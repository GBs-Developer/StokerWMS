#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sincronizador DB2 -> PostgreSQL para Stoker WMS
Coleta dados do DB2 e salva no banco PostgreSQL local.
Modo INCREMENTAL: usa CHAVE única para evitar duplicatas.

Uso:
    python sync_db2.py                        # Sync único
    python sync_db2.py --desde 2025-01-01     # (parâmetro reservado, janela fixa 31d)
    python sync_db2.py --loop 600             # Sync a cada 10 minutos
    python sync_db2.py --loop 600 --serve     # Sync + servidor web
"""

import os
import sys
import time
import json
import uuid
import platform
import argparse
import subprocess
import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import pyodbc
import psycopg2
import psycopg2.extras


# ─────────────────────────────────────────────────────────────
#  CONFIGURAÇÃO  (use variáveis de ambiente sempre que possível)
# ─────────────────────────────────────────────────────────────

STRING_CONEXAO_DB2 = os.environ.get("DB2_DSN", (
    "DSN=CISSODBC;UID=CONSULTA;PWD=qazwsx@123;"
    "MODE=SHARE;CLIENTENCALG=2;PROTOCOL=TCPIP;"
    "TXNISOLATION=1;SERVICENAME=50000;HOSTNAME=192.168.1.200;"
    "DATABASE=CISSERP;"
))

DATABASE_PATH = os.environ.get(
    "DATABASE_URL_LOCAL",
    "host=127.0.0.1 port=5435 dbname=data_stoker user=postgres password=1234"
)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
QUIET = False


# ─────────────────────────────────────────────────────────────
#  LOG  — colorido · níveis · seções · temporizado
# ─────────────────────────────────────────────────────────────

def _supports_ansi() -> bool:
    """Verifica se o terminal suporta cores ANSI.
    No Windows, apenas Windows Terminal (WT_SESSION), ANSICON ou VS Code suportam.
    """
    if not sys.stdout.isatty():
        return False
    if sys.platform == "win32":
        return bool(
            os.environ.get("WT_SESSION")       # Windows Terminal
            or os.environ.get("ANSICON")        # ANSICON
            or os.environ.get("TERM_PROGRAM")   # VS Code / outros
            or os.environ.get("ConEmuANSI") == "ON"
        )
    return True  # Linux / macOS

_USE_ANSI = _supports_ansi()

def _c(code: str, text: str) -> str:
    """Aplica cor ANSI somente quando suportado."""
    return f"\033[{code}m{text}\033[0m" if _USE_ANSI else text

def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")

# Níveis disponíveis: "info" | "ok" | "warn" | "erro" | "sync" | "detalhe"
_LEVEL_MAP = {
    "info":    (" ", "0"),
    "ok":      ("+", "32"),     # verde
    "warn":    ("!", "33"),     # amarelo
    "erro":    ("X", "31"),     # vermelho
    "sync":    (">", "36"),     # ciano
    "detalhe": ("-", "90"),     # cinza
}
# Ícones Unicode se ANSI for suportado (terminais modernos)
_LEVEL_MAP_ANSI = {
    "info":    ("·", "0"),
    "ok":      ("✓", "32"),
    "warn":    ("!", "33"),
    "erro":    ("✗", "31"),
    "sync":    ("◈", "36"),
    "detalhe": ("›", "90"),
}

def log(msg: str, level: str = "info"):
    """Imprime linha de log com timestamp, ícone e cor."""
    if QUIET:
        return
    lvl_map = _LEVEL_MAP_ANSI if _USE_ANSI else _LEVEL_MAP
    icon, color = lvl_map.get(level, (" ", "0"))
    icon_fmt = _c(f"{color};1", icon)
    print(f"[{_ts()}] {icon_fmt} {msg}", flush=True)

def log_section(title: str):
    """Imprime cabeçalho de seção com separador visual."""
    if QUIET:
        return
    bar = "-" * 54
    print(f"\n{bar}", flush=True)
    print(f"  {title.upper()}", flush=True)
    print(f"{bar}", flush=True)

def log_banner(title: str, subtitle: str = ""):
    """Imprime banner inicial do script."""
    if QUIET:
        return
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"  {title}  |  {now}"
    if subtitle:
        line += f"  |  {subtitle}"
    border = "=" * max(len(line) + 2, 54)
    print(f"\n{border}", flush=True)
    print(line, flush=True)
    print(f"{border}\n", flush=True)

def log_summary(label: str, duracao: float, proximo: Optional[int] = None):
    """Imprime caixa de sumário ao final do sync."""
    if QUIET:
        return
    proximo_str = f"  |  proximo em {proximo}s" if proximo else ""
    line = f"  {label}  |  duracao={duracao:.1f}s{proximo_str}"
    border = "-" * max(len(line) + 2, 54)
    print(f"\n{border}", flush=True)
    print(line, flush=True)
    print(f"{border}\n", flush=True)


# ─────────────────────────────────────────────────────────────
#  CONEXÕES
# ─────────────────────────────────────────────────────────────

def conectar_db2() -> pyodbc.Connection:
    """Conecta ao DB2 via ODBC."""
    log("DB2 — conectando...", "sync")
    t0 = time.time()
    conn = pyodbc.connect(STRING_CONEXAO_DB2, timeout=30)
    log(f"DB2 — conectado em {time.time()-t0:.2f}s", "ok")
    return conn


def executar_sql_db2(conn: pyodbc.Connection, query: str) -> List[Dict[str, Any]]:
    """Executa SQL no DB2 e retorna lista de dicionários."""
    cursor = conn.cursor()
    try:
        cursor.execute("SET CURRENT SCHEMA DBA")
        cursor.execute(query)
    except Exception as e:
        log(f"Erro SQL DB2: {e}", "erro")
        log(f"Query (500 chars): {query[:500]}...", "detalhe")
        return []

    if cursor.description is None:
        return []

    colunas = [col[0].strip() for col in cursor.description]
    rows = cursor.fetchall()
    return [dict(zip(colunas, row)) for row in rows]


# ─────────────────────────────────────────────────────────────
#  FORMATAÇÃO DE DATAS
# ─────────────────────────────────────────────────────────────

def formatar_data(valor) -> str:
    if valor is None:
        return ""
    if hasattr(valor, "strftime"):
        return valor.strftime("%Y-%m-%d")
    return str(valor)[:10]


def formatar_datetime(valor) -> str:
    if valor is None:
        return ""
    if hasattr(valor, "strftime"):
        return valor.strftime("%Y-%m-%dT%H:%M:%S")
    s = str(valor)
    return s.replace(" ", "T")[:19] if " " in s else s[:19]


def formatar_hora(valor) -> str:
    if valor is None:
        return ""
    if hasattr(valor, "strftime"):
        return valor.strftime("%H:%M:%S")
    return str(valor)[:8]


# ─────────────────────────────────────────────────────────────
#  SYSTEM SETTINGS
# ─────────────────────────────────────────────────────────────

def ensurar_system_settings():
    """Garante que a tabela system_settings existe no PostgreSQL."""
    try:
        conn = psycopg2.connect(DATABASE_PATH)
        conn.autocommit = True
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                id TEXT PRIMARY KEY DEFAULT 'global',
                separation_mode TEXT NOT NULL DEFAULT 'by_order',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_by TEXT
            )
        """)

        cursor.execute("SELECT id FROM system_settings WHERE id = 'global'")
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO system_settings (id, separation_mode) VALUES ('global', 'by_order')"
            )
            log("system_settings — registro 'global' criado", "ok")

        conn.close()
    except Exception as e:
        log(f"Erro ao garantir system_settings: {e}", "erro")


# ─────────────────────────────────────────────────────────────
#  SQL HELPERS
# ─────────────────────────────────────────────────────────────

def gerar_sql_orcamentos() -> str:
    """Lê SQL de orçamentos do arquivo sql/orcamentos.sql."""
    path_sql = os.path.join(PROJECT_ROOT, "sql", "orcamentos.sql")
    if not os.path.exists(path_sql):
        log("sql/orcamentos.sql não encontrado — usando query vazia", "warn")
        return ""
    try:
        with open(path_sql, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        log(f"Erro ao ler sql/orcamentos.sql: {e}", "erro")
        return ""


# ─────────────────────────────────────────────────────────────
#  MAPEAMENTO DINÂMICO (Mapping Studio)
# ─────────────────────────────────────────────────────────────

def load_pg_mappings(dataset: str) -> Optional[list]:
    """Carrega mapeamento ativo do PostgreSQL para o dataset especificado."""
    pg_url = os.environ.get("DATABASE_URL")
    if not pg_url:
        return None

    try:
        conn_pg = psycopg2.connect(pg_url)
        cursor = conn_pg.cursor()
        cursor.execute(
            "SELECT mapping_json FROM db2_mappings "
            "WHERE dataset = %s AND is_active = true "
            "ORDER BY version DESC LIMIT 1",
            (dataset,)
        )
        row = cursor.fetchone()
        conn_pg.close()

        if row:
            mapping = row[0]
            if isinstance(mapping, str):
                mapping = json.loads(mapping)
            return mapping
        return None
    except Exception as e:
        log(f"Erro ao carregar mapping '{dataset}': {e}", "warn")
        return None


def apply_mapping(row: dict, mapping: list) -> dict:
    """Aplica um mapeamento a uma linha de dados do cache."""
    result = {}
    for field_map in mapping:
        app_field = field_map.get("appField", "")
        db_expr   = field_map.get("dbExpression", "")
        cast      = field_map.get("cast", "")
        default   = field_map.get("defaultValue", "")

        value = None
        if db_expr:
            value = (
                row.get(db_expr)
                or row.get(db_expr.upper())
                or row.get(db_expr.lower())
            )

        if value is None or value == "":
            value = default if default else None

        if value is not None and cast:
            try:
                if cast == "number":
                    value = float(value)
                elif cast == "string":
                    value = str(value)
                elif cast == "divide_100":
                    value = float(value) / 100.0
                elif cast == "divide_1000":
                    value = float(value) / 1000.0
                elif cast == "boolean_T_F":
                    value = str(value).upper() == "T"
            except (ValueError, TypeError):
                pass

        result[app_field] = value
    return result


# ─────────────────────────────────────────────────────────────
#  TRANSFORMAÇÃO  cache_orcamentos → orders / products / items
# ─────────────────────────────────────────────────────────────

def transform_data(conn_pg):
    """
    Transforma dados brutos de cache_orcamentos em orders/products/work_units.
    Usa bulk insert e delta sync para eficiência.
    """
    t0 = time.time()

    orders_mapping   = load_pg_mappings("orders")
    products_mapping = load_pg_mappings("products")
    items_mapping    = load_pg_mappings("order_items")
    use_dynamic = orders_mapping or products_mapping or items_mapping

    if use_dynamic:
        log("Transformação — mapeamento dinâmico (Mapping Studio)", "detalhe")

    cursor = conn_pg.cursor()

    cursor.execute("SELECT * FROM cache_orcamentos")
    rows = cursor.fetchall()

    if not rows:
        log("Transformação — cache vazio, nada a processar", "warn")
        return

    col_names = [d[0] for d in cursor.description]

    # Pré-carga de IDs existentes
    cursor.execute("SELECT erp_order_id, id FROM orders")
    existing_orders = {r[0]: r[1] for r in cursor.fetchall()}

    cursor.execute("SELECT erp_code, id FROM products")
    existing_products = {r[0]: r[1] for r in cursor.fetchall()}

    cursor.execute("SELECT order_id, product_id FROM order_items")
    existing_items = set((r[0], r[1]) for r in cursor.fetchall())

    cursor.execute("SELECT order_id, section, pickup_point FROM work_units")
    existing_work_units = set(
        (r[0], str(r[1]) if r[1] is not None else None, int(r[2]) if r[2] is not None else 0)
        for r in cursor.fetchall()
    )

    upsert_orders       = []
    new_products        = []
    new_items_to_insert = []
    unique_pickup_points = set()
    unique_sections     = set()
    new_work_units      = []
    batch_products_map  = {}
    orders_map: Dict[str, dict] = {}

    # ── Passagem 1: agregar linhas em pedidos ──
    for row_tuple in rows:
        row = dict(zip(col_names, row_tuple))

        if orders_mapping:
            mapped_order = apply_mapping(row, orders_mapping)
            id_empresa   = str(row.get("IDEMPRESA", ""))
            erp_order_id = str(mapped_order.get("erp_order_id", ""))
            map_key      = f"{id_empresa}-{erp_order_id}"

            if map_key not in orders_map:
                orders_map[map_key] = {
                    "erp_id_display":  erp_order_id,
                    "customer_name":   mapped_order.get("customer_name") or "Cliente Desconhecido",
                    "customer_code":   str(mapped_order.get("customer_code") or ""),
                    "total_value":     0.0,
                    "items":           [],
                    "created_at":      mapped_order.get("created_at"),
                    "pickup_point":    mapped_order.get("pickup_point"),
                    "section":         mapped_order.get("section"),
                    "flag_pre_nota_paga": None,
                    "financial_status":   mapped_order.get("financial_status"),
                }

            orders_map[map_key]["total_value"] += float(mapped_order.get("total_value") or 0)
            orders_map[map_key]["items"].append(row)
        else:
            id_empresa   = str(row.get("IDEMPRESA"))
            id_orcamento = str(row.get("IDORCAMENTO"))
            map_key      = f"{id_empresa}-{id_orcamento}"

            if map_key not in orders_map:
                orders_map[map_key] = {
                    "erp_id_display":  id_orcamento,
                    "customer_name":   row.get("DESCLIENTE") or "Cliente Desconhecido",
                    "customer_code":   str(row.get("IDCLIFOR") or ""),
                    "total_value":     0.0,
                    "items":           [],
                    "created_at":      row.get("DTMOVIMENTO"),
                    "pickup_point":    row.get("IDLOCALRETIRADA"),
                    "section":         row.get("IDSECAO"),
                    "flag_pre_nota_paga": row.get("FLAGPRENOTAPAGA"),
                }

            orders_map[map_key]["total_value"] += float(row.get("VALTOTLIQUIDO") or 0) / 100.0
            orders_map[map_key]["items"].append(row)

    # ── Passagem 2: processar pedidos e itens ──
    processed_erp_order_ids: set = set()

    for map_key, data in orders_map.items():
        erp_order_id    = data["erp_id_display"]
        id_empresa_raw  = map_key.split("-")[0]
        id_empresa      = int(id_empresa_raw) if id_empresa_raw.isdigit() else 1
        processed_erp_order_ids.add(erp_order_id)

        order_uuid = existing_orders.get(erp_order_id)
        if not order_uuid:
            order_uuid = str(uuid.uuid4())
            existing_orders[erp_order_id] = order_uuid

        if data.get("financial_status"):
            fin_status = data["financial_status"]
        elif data.get("flag_pre_nota_paga") == "T":
            fin_status = "faturado"
        else:
            fin_status = "pendente"

        all_item_pickup_points = set()
        for item in data["items"]:
            pp = item.get("IDLOCALRETIRADA")
            try:
                pp_int = int(pp) if pp else 0
                if pp_int > 0:
                    all_item_pickup_points.add(pp_int)
            except (ValueError, TypeError):
                pass
        if not all_item_pickup_points:
            pickup_point_val = data.get("pickup_point")
            try:
                pp_int = int(pickup_point_val) if pickup_point_val else 0
                if pp_int > 0:
                    all_item_pickup_points.add(pp_int)
            except (ValueError, TypeError):
                pass
        pickup_points_json = json.dumps(sorted(all_item_pickup_points)) if all_item_pickup_points else "[]"

        first_item = data["items"][0] if data["items"] else {}
        upsert_orders.append((
            order_uuid, erp_order_id, data["customer_name"], data["customer_code"],
            data["total_value"], fin_status, pickup_points_json, data.get("created_at"),
            first_item.get("OBSERVACAO", ""),
            first_item.get("OBSERVACAO2", ""),
            first_item.get("DESCRCIDADE", ""),
            first_item.get("UF", ""),
            str(first_item.get("IDCEP", "") or ""),
            first_item.get("ENDERECO", ""),
            first_item.get("BAIRRO", ""),
            str(first_item.get("CNPJCPF", "") or ""),
            str(first_item.get("NUMERO", "") or ""),
            id_empresa,
        ))

        order_distinct_configs: set = set()
        incoming_items_map: Dict[str, dict] = {}

        for item in data["items"]:
            if products_mapping and items_mapping:
                mapped_prod = apply_mapping(item, products_mapping)
                mapped_item = apply_mapping(item, items_mapping)
                erp_prod_code = str(mapped_prod.get("erp_code") or mapped_item.get("erp_product_code") or "")
                prod_uuid     = existing_products.get(erp_prod_code)
                unit          = str(mapped_prod.get("unit") or "UN")
                manufacturer  = str(mapped_prod.get("manufacturer") or "")
                real_qty      = float(mapped_item.get("quantity") or 0)
                price         = mapped_prod.get("price")
                barcode       = mapped_prod.get("barcode")
                box_barcode   = mapped_prod.get("box_barcode")
                name          = mapped_prod.get("name")
                item_pickup   = mapped_item.get("pickup_point")
                item_section  = str(mapped_item.get("section") or "")
            else:
                erp_prod_code = str(item.get("IDPRODUTO"))
                prod_uuid     = existing_products.get(erp_prod_code)
                unit          = item.get("UNIDADE") or "UN"
                manufacturer  = item.get("FABRICANTE") or ""
                real_qty      = float(item.get("QTDPRODUTO") or 0) / 1000.0
                price         = item.get("VALUNITBRUTO")
                barcode       = item.get("CODBARRAS")
                box_barcode   = item.get("CODBARRAS_CAIXA")
                name          = item.get("DESCRRESPRODUTO")
                item_pickup   = item.get("IDLOCALRETIRADA")
                item_section  = str(item.get("IDSECAO"))

            if not prod_uuid:
                prod_uuid = batch_products_map.get(erp_prod_code)
                if not prod_uuid:
                    prod_uuid = str(uuid.uuid4())
                    new_products.append((
                        prod_uuid, erp_prod_code, barcode, box_barcode, name,
                        str(item_section or ""), item_pickup, unit, manufacturer, price,
                    ))
                    batch_products_map[erp_prod_code] = prod_uuid

            incoming_items_map[erp_prod_code] = {
                "prod_uuid": prod_uuid,
                "qty":    real_qty,
                "pickup": item_pickup,
                "section": item_section,
            }

            if item_pickup and item_pickup > 0:
                pp_name = item.get("LOCALRETESTOQUE") or f"Ponto {item_pickup}"
                unique_pickup_points.add((item_pickup, pp_name))
            if item_section and str(item_section).isdigit():
                sec_id   = int(item_section)
                sec_name = item.get("DESCRSECAO") or f"Seção {sec_id}"
                unique_sections.add((sec_id, sec_name))

            wu_section = item_section if item_section else None
            wu_pickup  = int(item_pickup) if item_pickup else 0
            order_distinct_configs.add((wu_section, wu_pickup))

        # Delta sync de itens existentes no DB
        current_db_items: Dict[str, dict] = {}
        if order_uuid:
            try:
                cursor.execute("""
                    SELECT oi.id, oi.quantity, p.erp_code, oi.product_id
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    WHERE oi.order_id = %s
                """, (order_uuid,))
                for r in cursor.fetchall():
                    current_db_items[r[2]] = {"id": r[0], "qty": r[1], "prod_id": r[3]}
            except Exception as e:
                log(f"Erro ao buscar itens para diff (pedido {erp_order_id}): {e}", "warn")

        # A) Upsert de itens
        for erp_code, item_data in incoming_items_map.items():
            db_item = current_db_items.get(erp_code)
            if db_item:
                if abs(db_item["qty"] - item_data["qty"]) > 0.0001:
                    cursor.execute(
                        "UPDATE order_items SET quantity = %s WHERE id = %s",
                        (item_data["qty"], db_item["id"]),
                    )
            else:
                if (order_uuid, item_data["prod_uuid"]) not in existing_items:
                    new_items_to_insert.append((
                        str(uuid.uuid4()), order_uuid, item_data["prod_uuid"],
                        item_data["qty"], item_data["pickup"], item_data["section"],
                    ))
                    existing_items.add((order_uuid, item_data["prod_uuid"]))

        # B) Remover itens que sumiram do ERP
        for erp_code, db_item in current_db_items.items():
            if erp_code not in incoming_items_map:
                cursor.execute("DELETE FROM exceptions WHERE order_item_id = %s", (db_item["id"],))
                cursor.execute("DELETE FROM order_items WHERE id = %s", (db_item["id"],))

        # Work units por configuração distinta
        for (sec, pp) in order_distinct_configs:
            lookup_sec = str(sec) if sec is not None else None
            lookup_pp  = int(pp)
            if (order_uuid, lookup_sec, lookup_pp) not in existing_work_units:
                new_work_units.append((str(uuid.uuid4()), order_uuid, pp, sec, id_empresa))
                existing_work_units.add((order_uuid, lookup_sec, lookup_pp))

    # ── Bulk inserts ──
    try:
        if unique_pickup_points:
            cursor.executemany(
                "INSERT INTO pickup_points (id, name, active) VALUES (%s, %s, true) "
                "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, active=true",
                list(unique_pickup_points),
            )
        if unique_sections:
            cursor.executemany(
                "INSERT INTO sections (id, name) VALUES (%s, %s) "
                "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name",
                list(unique_sections),
            )
        conn_pg.commit()
    except Exception as e:
        log(f"Erro ao inserir pontos/seções: {e}", "erro")

    try:
        if new_products:
            cursor.executemany("""
                INSERT INTO products (id, erp_code, barcode, box_barcode, name, section,
                    pickup_point, unit, manufacturer, price)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT(erp_code) DO UPDATE SET
                    price = excluded.price, name = excluded.name,
                    barcode = excluded.barcode, box_barcode = excluded.box_barcode,
                    section = excluded.section, pickup_point = excluded.pickup_point,
                    unit = excluded.unit, manufacturer = excluded.manufacturer,
                    erp_updated_at = CURRENT_TIMESTAMP
            """, new_products)

        if upsert_orders:
            cursor.executemany("""
                INSERT INTO orders (
                    id, erp_order_id, customer_name, customer_code, total_value,
                    financial_status, pickup_points, status, created_at,
                    observation, observation2, city, state, zip_code, address,
                    neighborhood, cnpj_cpf, address_number, company_id
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,'pendente',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(erp_order_id) DO UPDATE SET
                    financial_status = excluded.financial_status,
                    total_value      = excluded.total_value,
                    customer_name    = excluded.customer_name,
                    pickup_points    = excluded.pickup_points,
                    observation      = excluded.observation,
                    observation2     = excluded.observation2,
                    city             = excluded.city,
                    state            = excluded.state,
                    zip_code         = excluded.zip_code,
                    address          = excluded.address,
                    neighborhood     = excluded.neighborhood,
                    cnpj_cpf         = excluded.cnpj_cpf,
                    address_number   = excluded.address_number,
                    company_id       = excluded.company_id,
                    updated_at       = CURRENT_TIMESTAMP
            """, upsert_orders)

        if new_items_to_insert:
            cursor.executemany("""
                INSERT INTO order_items (id, order_id, product_id, quantity,
                    separated_qty, status, pickup_point, section)
                VALUES (%s, %s, %s, %s, 0, 'pendente', %s, %s)
            """, new_items_to_insert)

        if new_work_units:
            cursor.executemany("""
                INSERT INTO work_units (id, order_id, status, type,
                    pickup_point, section, company_id)
                VALUES (%s, %s, 'pendente', 'separacao', %s, %s, %s)
            """, new_work_units)

        # ── Remoção de pedidos que sumiram do ERP (janela 31 dias) ──
        if processed_erp_order_ids:
            quoted_ids = ",".join(f"'{x}'" for x in processed_erp_order_ids)
            cursor.execute(f"""
                SELECT id, erp_order_id FROM orders
                WHERE created_at::timestamp >= CURRENT_DATE - INTERVAL '31 days'
                AND erp_order_id NOT IN ({quoted_ids})
            """)
            orders_to_delete = cursor.fetchall()

            if orders_to_delete:
                ids_to_del = [r[0] for r in orders_to_delete]
                erp_ids_del = [r[1] for r in orders_to_delete]
                amostra = erp_ids_del[:5]
                sufixo = f" ... +{len(erp_ids_del)-5} mais" if len(erp_ids_del) > 5 else ""
                log(f"Remoção ERP — {len(ids_to_del)} pedido(s) excluído(s): {amostra}{sufixo}", "warn")

                quoted_uuids = ",".join(f"'{x}'" for x in ids_to_del)
                cursor.execute(f"DELETE FROM exceptions WHERE order_item_id IN "
                               f"(SELECT id FROM order_items WHERE order_id IN ({quoted_uuids}))")
                cursor.execute(f"DELETE FROM order_items        WHERE order_id IN ({quoted_uuids})")
                cursor.execute(f"DELETE FROM work_units         WHERE order_id IN ({quoted_uuids})")
                cursor.execute(f"DELETE FROM picking_sessions   WHERE order_id IN ({quoted_uuids})")
                cursor.execute(f"DELETE FROM orders             WHERE id IN ({quoted_uuids})")

        conn_pg.commit()

        elapsed = time.time() - t0
        log(
            f"Transformação — {len(orders_map)} pedidos · "
            f"{len(new_products)} produtos novos · "
            f"{len(new_items_to_insert)} itens novos · "
            f"{elapsed:.1f}s",
            "ok",
        )

    except Exception as e:
        log(f"Erro no bulk insert: {e}", "erro")
        import traceback
        traceback.print_exc()


# ─────────────────────────────────────────────────────────────
#  SYNC ORÇAMENTOS
# ─────────────────────────────────────────────────────────────

def sync_orcamentos(conn_db2, conn_pg):
    """Sincroniza cache_orcamentos — janela de 31 dias."""
    t0 = time.time()
    log("Orçamentos — buscando últimos 31 dias...", "sync")

    query = gerar_sql_orcamentos()
    if not query:
        log("Orçamentos — query vazia, pulando", "warn")
        return

    cursor = conn_pg.cursor()

    try:
        dados = executar_sql_db2(conn_db2, query)
    except Exception as e:
        log(f"Orçamentos — erro ao executar query DB2: {e}", "erro")
        return

    cutoff_date = (datetime.now() - timedelta(days=32)).strftime("%Y-%m-%d")
    deleted_count = 0
    try:
        cursor.execute('DELETE FROM cache_orcamentos WHERE "DTMOVIMENTO" >= %s', (cutoff_date,))
        deleted_count = cursor.rowcount
    except Exception as e:
        log(f"Orçamentos — erro ao limpar janela local: {e}", "erro")

    inseridos = 0
    erros = 0

    for row in dados:
        try:
            chave = (
                f"{row.get('IDEMPRESA')}-{row.get('IDORCAMENTO')}-"
                f"{row.get('IDPRODUTO')}-{row.get('IDSUBPRODUTO')}-{row.get('NUMSEQUENCIA')}"
            )
            cursor.execute("""
                INSERT INTO cache_orcamentos (
                    "CHAVE","IDEMPRESA","IDORCAMENTO","IDPRODUTO","IDSUBPRODUTO","NUMSEQUENCIA",
                    "QTDPRODUTO","UNIDADE","FABRICANTE","VALUNITBRUTO","VALTOTLIQUIDO","DESCRRESPRODUTO",
                    "IDVENDEDOR","IDLOCALRETIRADA","IDSECAO","DESCRSECAO",
                    "TIPOENTREGA","NOMEVENDEDOR","TIPOENTREGA_DESCR","LOCALRETESTOQUE",
                    "FLAGCANCELADO","IDCLIFOR","DESCLIENTE","DTMOVIMENTO",
                    "IDRECEBIMENTO","DESCRRECEBIMENTO","FLAGPRENOTAPAGA",
                    "CODBARRAS","CODBARRAS_CAIXA",
                    "OBSERVACAO","OBSERVACAO2","DESCRCIDADE","UF","IDCEP",
                    "ENDERECO","BAIRRO","CNPJCPF","NUMERO"
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                )
                ON CONFLICT ("CHAVE") DO UPDATE SET
                    "IDEMPRESA"=EXCLUDED."IDEMPRESA","IDORCAMENTO"=EXCLUDED."IDORCAMENTO",
                    "IDPRODUTO"=EXCLUDED."IDPRODUTO","IDSUBPRODUTO"=EXCLUDED."IDSUBPRODUTO",
                    "NUMSEQUENCIA"=EXCLUDED."NUMSEQUENCIA","QTDPRODUTO"=EXCLUDED."QTDPRODUTO",
                    "UNIDADE"=EXCLUDED."UNIDADE","FABRICANTE"=EXCLUDED."FABRICANTE",
                    "VALUNITBRUTO"=EXCLUDED."VALUNITBRUTO","VALTOTLIQUIDO"=EXCLUDED."VALTOTLIQUIDO",
                    "DESCRRESPRODUTO"=EXCLUDED."DESCRRESPRODUTO","IDVENDEDOR"=EXCLUDED."IDVENDEDOR",
                    "IDLOCALRETIRADA"=EXCLUDED."IDLOCALRETIRADA","IDSECAO"=EXCLUDED."IDSECAO",
                    "DESCRSECAO"=EXCLUDED."DESCRSECAO","TIPOENTREGA"=EXCLUDED."TIPOENTREGA",
                    "NOMEVENDEDOR"=EXCLUDED."NOMEVENDEDOR","TIPOENTREGA_DESCR"=EXCLUDED."TIPOENTREGA_DESCR",
                    "LOCALRETESTOQUE"=EXCLUDED."LOCALRETESTOQUE","FLAGCANCELADO"=EXCLUDED."FLAGCANCELADO",
                    "IDCLIFOR"=EXCLUDED."IDCLIFOR","DESCLIENTE"=EXCLUDED."DESCLIENTE",
                    "DTMOVIMENTO"=EXCLUDED."DTMOVIMENTO","IDRECEBIMENTO"=EXCLUDED."IDRECEBIMENTO",
                    "DESCRRECEBIMENTO"=EXCLUDED."DESCRRECEBIMENTO","FLAGPRENOTAPAGA"=EXCLUDED."FLAGPRENOTAPAGA",
                    "CODBARRAS"=EXCLUDED."CODBARRAS","CODBARRAS_CAIXA"=EXCLUDED."CODBARRAS_CAIXA",
                    "OBSERVACAO"=EXCLUDED."OBSERVACAO","OBSERVACAO2"=EXCLUDED."OBSERVACAO2",
                    "DESCRCIDADE"=EXCLUDED."DESCRCIDADE","UF"=EXCLUDED."UF",
                    "IDCEP"=EXCLUDED."IDCEP","ENDERECO"=EXCLUDED."ENDERECO",
                    "BAIRRO"=EXCLUDED."BAIRRO","CNPJCPF"=EXCLUDED."CNPJCPF","NUMERO"=EXCLUDED."NUMERO"
            """, (
                chave,
                int(row.get("IDEMPRESA", 0)),
                int(row.get("IDORCAMENTO", 0)),
                str(row.get("IDPRODUTO", "")),
                str(row.get("IDSUBPRODUTO", "")),
                int(row.get("NUMSEQUENCIA", 0)),
                float(row.get("QTDPRODUTO", 0) or 0),
                str(row.get("UNIDADE", "UN") or "UN"),
                str(row.get("FABRICANTE", "") or ""),
                float(row.get("VALUNITBRUTO", 0) or 0),
                float(row.get("VALTOTLIQUIDO", 0) or 0),
                row.get("DESCRRESPRODUTO", ""),
                str(row.get("IDVENDEDOR", "")),
                int(row.get("IDLOCALRETIRADA", 0) or 0),
                int(row.get("IDSECAO", 0) or 0),
                row.get("DESCRSECAO", ""),
                row.get("TIPOENTREGA", ""),
                row.get("NOMEVENDEDOR", ""),
                row.get("TIPOENTREGA_DESCR", ""),
                row.get("LOCALRETESTOQUE", ""),
                row.get("FLAGCANCELADO", ""),
                str(row.get("IDCLIFOR", "")),
                row.get("DESCLIENTE", ""),
                formatar_datetime(row.get("DTMOVIMENTO")),
                str(row.get("IDRECEBIMENTO", "")),
                row.get("DESCRRECEBIMENTO", ""),
                row.get("FLAGPRENOTAPAGA", ""),
                str(row.get("CODBARRAS", "") or ""),
                str(row.get("CODBARRAS_CAIXA", "") or ""),
                str(row.get("OBSERVACAO", "") or ""),
                str(row.get("OBSERVACAO2", "") or ""),
                str(row.get("DESCRCIDADE", "") or ""),
                str(row.get("UF", "") or ""),
                str(row.get("IDCEP", "") or ""),
                str(row.get("ENDERECO", "") or ""),
                str(row.get("BAIRRO", "") or ""),
                str(row.get("CNPJCPF", "") or ""),
                str(row.get("NUMERO", "") or ""),
            ))
            inseridos += 1

        except Exception as e:
            log(f"Erro ao inserir orçamento {chave}: {e}", "erro")
            erros += 1

    conn_pg.commit()
    elapsed = time.time() - t0
    log(
        f"Orçamentos — {len(dados)} obtidos · "
        f"{deleted_count} removidos (>={cutoff_date}) · "
        f"{inseridos} inseridos · {erros} erros · {elapsed:.1f}s",
        "ok" if erros == 0 else "warn",
    )


# ─────────────────────────────────────────────────────────────
#  SYNC ESTOQUE
# ─────────────────────────────────────────────────────────────

def sync_products_stock(conn_db2, conn_pg):
    """Sincroniza estoque real do ERP → product_company_stock e products.stock_qty."""
    t0 = time.time()
    log("Estoque — sincronizando do ERP...", "sync")

    sql_path = os.path.join(PROJECT_ROOT, "sql", "estoque_geral.sql")
    if not os.path.exists(sql_path):
        log("Estoque — sql/estoque_geral.sql não encontrado, pulando", "warn")
        return

    with open(sql_path, "r", encoding="utf-8") as f:
        query = f.read()

    try:
        dados = executar_sql_db2(conn_db2, query)
    except Exception as e:
        log(f"Estoque — erro na query DB2: {e}", "erro")
        return

    if not dados:
        log("Estoque — nenhum registro retornado do DB2", "warn")
        return

    cursor = conn_pg.cursor()
    cursor.execute("SELECT id, erp_code FROM products")
    erp_to_uuid = {str(r[1]).strip(): str(r[0]) for r in cursor.fetchall()}

    atualizados = 0
    erros = 0

    for row in dados:
        try:
            empresa  = int(row.get("IDEMPRESA", 0))
            erp_code = str(row.get("IDPRODUTO", "")).strip()
            qtd      = float(row.get("QTDESTOQUE", 0) or 0)

            if erp_code in erp_to_uuid:
                prod_uuid = erp_to_uuid[erp_code]
                cursor.execute("""
                    INSERT INTO product_company_stock (id, product_id, company_id, stock_qty, erp_updated_at)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (product_id, company_id) DO UPDATE SET
                        stock_qty = EXCLUDED.stock_qty,
                        erp_updated_at = CURRENT_TIMESTAMP
                """, (str(uuid.uuid4()), prod_uuid, empresa, qtd))
                cursor.execute(
                    "UPDATE products SET stock_qty = %s WHERE id = %s",
                    (qtd, prod_uuid),
                )
                atualizados += 1
        except Exception as e:
            log(f"Estoque — erro produto {row.get('IDPRODUTO')}: {e}", "erro")
            erros += 1

    conn_pg.commit()
    elapsed = time.time() - t0
    log(
        f"Estoque — {len(dados)} obtidos · {atualizados} atualizados · "
        f"{erros} erros · {elapsed:.1f}s",
        "ok" if erros == 0 else "warn",
    )


# ─────────────────────────────────────────────────────────────
#  SYNC BOX BARCODES
# ─────────────────────────────────────────────────────────────

def sync_box_barcodes(conn_db2, conn_pg):
    """Sincroniza múltiplos códigos de caixa (PRODUTO_GRADE_CODBARCX)."""
    t0 = time.time()
    log("Box Barcodes — sincronizando...", "sync")

    cursor = conn_pg.cursor()
    cursor.execute("SELECT id, erp_code FROM products")
    products_db = cursor.fetchall()

    if not products_db:
        log("Box Barcodes — nenhum produto na base, pulando", "warn")
        return

    erp_to_uuid = {str(r[1]).strip(): str(r[0]) for r in products_db}
    erp_codes   = list(erp_to_uuid.keys())
    chunk_size  = 500
    all_box_barcodes: Dict[str, list] = {}

    try:
        db2_cursor = conn_db2.cursor()
        db2_cursor.execute("SET CURRENT SCHEMA DBA")

        for i in range(0, len(erp_codes), chunk_size):
            chunk     = erp_codes[i : i + chunk_size]
            in_clause = ",".join(f"'{c}'" for c in chunk)
            query = f"""
                SELECT TRIM(IDPRODUTO) AS IDPRODUTO,
                       CASE
                           WHEN TRIM(COALESCE(CODBARCX, '')) = '' THEN VARCHAR(IDCODBARCX)
                           ELSE CODBARCX
                       END AS CODBARCX,
                       COALESCE(QTDMULTIPLA, 1) AS QTDMULTIPLA
                FROM DBA.PRODUTO_GRADE_CODBARCX
                WHERE IDPRODUTO IN ({in_clause})
            """
            db2_cursor.execute(query)
            for row in db2_cursor.fetchall():
                erp_code = str(row[0]).strip()
                barcode  = str(row[1]).strip()
                qty      = float(row[2]) / 1000.0
                if not barcode:
                    continue
                if erp_code not in all_box_barcodes:
                    all_box_barcodes[erp_code] = []
                all_box_barcodes[erp_code].append({"code": barcode, "qty": qty})

        updates = [
            (json.dumps(barcodes), erp_to_uuid[erp_code])
            for erp_code, barcodes in all_box_barcodes.items()
            if erp_code in erp_to_uuid
        ]

        if updates:
            cursor.executemany(
                "UPDATE products SET box_barcodes = %s WHERE id = %s", updates
            )
            conn_pg.commit()

        elapsed = time.time() - t0
        log(f"Box Barcodes — {len(updates)} produtos atualizados · {elapsed:.1f}s", "ok")

    except Exception as e:
        log(f"Box Barcodes — erro: {e}", "erro")


# ─────────────────────────────────────────────────────────────
#  SYNC ENDEREÇOS WMS
# ─────────────────────────────────────────────────────────────

def sync_enderecos_wms(conn_db2, conn_pg):
    """Sincroniza endereços WMS do DB2 para o PostgreSQL local."""
    t0 = time.time()
    log("Endereços WMS — sincronizando...", "sync")

    sql_path = os.path.join(PROJECT_ROOT, "sql", "enderecos_wms.sql")
    if not os.path.exists(sql_path):
        log("Endereços WMS — sql/enderecos_wms.sql não encontrado, pulando", "warn")
        return

    with open(sql_path, "r", encoding="utf-8") as f:
        query = f.read()

    try:
        dados = executar_sql_db2(conn_db2, query)
    except Exception as e:
        log(f"Endereços WMS — erro na query DB2: {e}", "erro")
        return

    if not dados:
        log("Endereços WMS — nenhum registro retornado", "warn")
        return

    cursor   = conn_pg.cursor()
    inseridos = 0
    ignorados = 0

    for row in dados:
        try:
            empresa = int(row.get("IDEMPRESA", 0))
            bairro  = str(row.get("IDBAIRRO", "")).strip()
            rua     = str(row.get("DESCRRUA", "")).strip()
            bloco   = str(row.get("DESCRBLOCO", "")).strip()
            nivel   = str(row.get("DESCRNIVEL", "")).strip()

            if not all([bairro, rua, bloco, nivel]):
                ignorados += 1
                continue

            code = f"{bairro}-{rua}-{bloco}-{nivel}"
            cursor.execute(
                "SELECT id FROM wms_addresses WHERE company_id = %s AND code = %s",
                (empresa, code),
            )
            if cursor.fetchone():
                ignorados += 1
                continue

            cursor.execute("""
                INSERT INTO wms_addresses
                    (id, company_id, bairro, rua, bloco, nivel, code, type, active, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'standard', true, CURRENT_TIMESTAMP)
            """, (str(uuid.uuid4()), empresa, bairro, rua, bloco, nivel, code))
            inseridos += 1

        except Exception as e:
            log(f"Endereços WMS — erro ao inserir: {e}", "erro")

    conn_pg.commit()
    elapsed = time.time() - t0
    log(
        f"Endereços WMS — {len(dados)} obtidos · "
        f"{inseridos} novos · {ignorados} existentes · {elapsed:.1f}s",
        "ok",
    )


# ─────────────────────────────────────────────────────────────
#  SYNC NOTAS FISCAIS RECEBIMENTO
# ─────────────────────────────────────────────────────────────

def sync_notas_recebimento(conn_db2, conn_pg):
    """Sincroniza notas fiscais de recebimento do DB2 para o PostgreSQL."""
    t0 = time.time()
    log("NFs Recebimento — sincronizando...", "sync")

    sql_path = os.path.join(PROJECT_ROOT, "sql", "notas_recebimento.sql")
    if not os.path.exists(sql_path):
        log("NFs Recebimento — sql/notas_recebimento.sql não encontrado, pulando", "warn")
        return

    with open(sql_path, "r", encoding="utf-8") as f:
        query = f.read()

    try:
        dados = executar_sql_db2(conn_db2, query)
    except Exception as e:
        log(f"NFs Recebimento — erro na query DB2: {e}", "erro")
        return

    if not dados:
        log("NFs Recebimento — nenhum registro retornado", "warn")
        return

    nf_map: Dict[str, dict] = {}
    for row in dados:
        empresa  = int(row.get("IDEMPRESA", 0))
        numnota  = str(row.get("NUMNOTA", "")).strip()
        serie    = str(row.get("SERIENOTA", "")).strip()
        key      = f"{empresa}-{numnota}-{serie}"

        if key not in nf_map:
            nf_map[key] = {
                "empresa":    empresa,
                "numnota":    numnota,
                "serie":      serie,
                "fornecedor": str(row.get("IDCLIFOR", "")).strip(),
                "autorizacao": str(row.get("IDAUTORIZACAO", "")).strip(),
                "items":      [],
            }

        nf_map[key]["items"].append({
            "idproduto":  str(row.get("IDPRODUTO", "")).strip(),
            "codigoforn": str(row.get("CODIGOINTERNOFORN", "")).strip(),
            "quantidade": float(row.get("QTDPRODUTO", 0) or 0),
            "descricao":  str(row.get("DESCRRESPRODUTO", "")).strip(),
        })

    cursor      = conn_pg.cursor()
    nf_inseridas  = 0
    nf_atualizadas = 0
    itens_inseridos = 0

    for key, nf_data in nf_map.items():
        try:
            empresa  = nf_data["empresa"]
            numnota  = nf_data["numnota"]

            cursor.execute(
                "SELECT id FROM nf_cache WHERE company_id = %s AND nf_number = %s",
                (empresa, numnota),
            )
            existing = cursor.fetchone()

            if existing:
                nf_id = existing[0]
                cursor.execute("DELETE FROM nf_items WHERE nf_id = %s", (nf_id,))
                nf_atualizadas += 1
            else:
                nf_id = str(uuid.uuid4())
                cursor.execute("""
                    INSERT INTO nf_cache
                        (id, company_id, nf_number, nf_series, supplier_name, status, synced_at)
                    VALUES (%s, %s, %s, %s, %s, 'pendente', CURRENT_TIMESTAMP)
                """, (nf_id, empresa, numnota, nf_data["serie"], nf_data["fornecedor"]))
                nf_inseridas += 1

            for item in nf_data["items"]:
                item_id = str(uuid.uuid4())
                prod_id = None
                cursor.execute(
                    "SELECT id FROM products WHERE erp_code = %s", (item["idproduto"],)
                )
                prod_row = cursor.fetchone()
                if prod_row:
                    prod_id = prod_row[0]

                cursor.execute("""
                    INSERT INTO nf_items
                        (id, nf_id, product_id, erp_code, product_name, quantity, unit, company_id)
                    VALUES (%s, %s, %s, %s, %s, %s, 'UN', %s)
                """, (item_id, nf_id, prod_id, item["idproduto"],
                      item["descricao"], item["quantidade"], empresa))
                itens_inseridos += 1

        except Exception as e:
            log(f"NFs Recebimento — erro NF {key}: {e}", "erro")

    conn_pg.commit()
    elapsed = time.time() - t0
    log(
        f"NFs Recebimento — {len(nf_map)} NFs · "
        f"{nf_inseridas} novas · {nf_atualizadas} atualizadas · "
        f"{itens_inseridos} itens · {elapsed:.1f}s",
        "ok",
    )


# ─────────────────────────────────────────────────────────────
#  FLUXO PRINCIPAL DE SINCRONIZAÇÃO
# ─────────────────────────────────────────────────────────────

def sincronizar(data_inicial: Optional[str] = None) -> bool:
    """
    Executa o ciclo completo de sincronização.
    `data_inicial` é aceito por compatibilidade mas não altera a janela fixa de 31 dias.
    """
    inicio = time.time()
    log_section("Iniciando ciclo de sync")

    # 1. Conectar ao DB2
    try:
        conn_db2 = conectar_db2()
    except Exception as e:
        log(f"Falha ao conectar no DB2: {e}", "erro")
        return False

    # 2. Conectar ao PostgreSQL local
    try:
        conn_pg = psycopg2.connect(DATABASE_PATH)
        conn_pg.autocommit = False
        log("PostgreSQL local — conectado", "ok")
    except Exception as e:
        log(f"Falha ao conectar no PostgreSQL local: {e}", "erro")
        try:
            conn_db2.close()
        except Exception:
            pass
        return False

    sucesso = True
    try:
        sync_orcamentos(conn_db2, conn_pg)
        transform_data(conn_pg)
        sync_products_stock(conn_db2, conn_pg)
        sync_box_barcodes(conn_db2, conn_pg)
        sync_enderecos_wms(conn_db2, conn_pg)
        sync_notas_recebimento(conn_db2, conn_pg)

    except Exception as e:
        log(f"Erro inesperado no ciclo de sync: {e}", "erro")
        import traceback
        traceback.print_exc()
        sucesso = False

    finally:
        for conn in [conn_db2, conn_pg]:
            try:
                conn.close()
            except Exception as close_err:
                log(f"Aviso ao fechar conexão: {close_err}", "warn")

    duracao = time.time() - inicio
    if sucesso:
        log_summary("SYNC CONCLUÍDO", duracao)
    else:
        log(f"Sync terminou com erros em {duracao:.1f}s", "erro")

    return sucesso


# ─────────────────────────────────────────────────────────────
#  SERVIDOR WEB
# ─────────────────────────────────────────────────────────────

def kill_port_411():
    """Libera a porta 411 caso esteja em uso (Windows)."""
    if sys.platform != "win32":
        return
    try:
        result = subprocess.run(
            "netstat -ano | findstr :411",
            shell=True, capture_output=True, text=True,
        )
        for line in result.stdout.strip().splitlines():
            parts = line.split()
            if len(parts) >= 5:
                pid = parts[-1]
                if pid != "0":
                    log(f"Porta 411 em uso pelo PID {pid} — liberando...", "warn")
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
    except Exception as e:
        log(f"Não foi possível liberar porta 411: {e}", "warn")


def iniciar_servidor():
    """Inicia o servidor web do dashboard."""
    log_section("Iniciando servidor web")

    try:
        subprocess.run("npm --version", shell=True, capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        log("npm não encontrado — instale Node.js primeiro: https://nodejs.org/", "erro")
        return

    kill_port_411()

    env = os.environ.copy()
    env["PORT"] = "411"

    log("Servidor disponível em → http://localhost:411", "ok")

    try:
        if sys.platform == "win32":
            env["NODE_ENV"] = "development"
            subprocess.run("npx tsx server/index.ts", shell=True, cwd=PROJECT_ROOT, env=env)
        else:
            subprocess.run("npm run dev", shell=True, cwd=PROJECT_ROOT, env=env)
    except KeyboardInterrupt:
        log("Servidor interrompido pelo usuário.", "warn")


# ─────────────────────────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────────────────────────

def main():
    global QUIET

    parser = argparse.ArgumentParser(
        description="Sincronizador DB2 → PostgreSQL (Stoker WMS)",
        epilog="""
Exemplos:
  python sync_db2.py --serve          # Sync + Servidor (loop padrão 5 min)
  python sync_db2.py --loop 600       # Apenas sync (loop 10 min)
  python sync_db2.py --quiet --serve  # Servidor sem logs no terminal
        """,
    )
    parser.add_argument(
        "--desde", type=str, metavar="YYYY-MM-DD",
        help="Reservado (janela fixa de 31 dias — parâmetro ignorado)",
    )
    parser.add_argument(
        "--loop", type=int, metavar="SEGUNDOS",
        help="Intervalo do loop de sync (padrão: 300s = 5 min)",
    )
    parser.add_argument(
        "--serve", action="store_true",
        help="Inicia o servidor web após o primeiro sync",
    )
    parser.add_argument(
        "--quiet", action="store_true",
        help="Suprime todos os logs no stdout",
    )

    args   = parser.parse_args()
    QUIET  = args.quiet

    intervalo  = args.loop if args.loop else 300
    modo_str   = "serve" if args.serve else ("loop" if args.loop else "once")

    log_banner("STOKER SYNC", f"modo={modo_str} · SO={platform.system()}")

    # Garantir tabelas essenciais
    ensurar_system_settings()

    # ── 1. Sync inicial ──
    sucesso = sincronizar(data_inicial=args.desde)

    if not sucesso and not args.serve and not args.loop:
        sys.exit(1)

    # ── 2. Loop de sync ──
    def loop_sync():
        cycle = 1
        while True:
            time.sleep(intervalo)
            log(f"Loop — ciclo #{cycle} (a cada {intervalo}s)", "sync")
            sincronizar()
            cycle += 1

    if args.serve:
        # Loop roda em thread daemon; servidor ocupa a thread principal
        t = threading.Thread(target=loop_sync, daemon=True)
        t.start()
        log(f"Loop de sync em background ({intervalo}s)", "ok")
        iniciar_servidor()

    elif args.loop:
        log(f"Modo loop ativo — intervalo={intervalo}s", "ok")
        try:
            loop_sync()
        except KeyboardInterrupt:
            log("Loop interrompido pelo usuário.", "warn")


if __name__ == "__main__":
    main()
