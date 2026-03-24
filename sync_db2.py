#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sincronizador DB2 -> SQLite para Sales Analytics Dashboard
Coleta dados do DB2 e salva no database.db local.
Modo INCREMENTAL: usa CHAVE única para evitar duplicatas.

Uso:
    python sync_db2.py                        # Sync incremental (última semana)
    python sync_db2.py --desde 2025-01-01     # Carga desde data específica
    python sync_db2.py --loop 600             # Sync a cada 10 minutos
    python sync_db2.py --loop 600 --serve     # Sync + servidor web
"""

import os
import sys
import time
import psycopg2
import psycopg2.extras
import argparse
import subprocess
import threading
import uuid
import platform
import logging
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

# === MODIFICATION: pyodbc mandatory ===
import pyodbc
# =====================================

# === PostgreSQL mapping support ===
try:
    import psycopg2
    import json as json_module
except ImportError:
    psycopg2 = None
# ==================================

# === CONFIGURAÇÃO ===
STRING_CONEXAO_DB2 = (
    "DSN=CISSODBC;UID=CONSULTA;PWD=qazwsx@123;"
    "MODE=SHARE;CLIENTENCALG=2;PROTOCOL=TCPIP;"
    "TXNISOLATION=1;SERVICENAME=50000;HOSTNAME=192.168.1.200;"
    "DATABASE=CISSERP;"
)

QUIET = False

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
SCRIPT_DIR = PROJECT_ROOT
DATABASE_PATH = "host=127.0.0.1 port=5435 dbname=data_stoker user=postgres password=1234"


def log(msg: str):
    """Log com timestamp completo YYYY-MM-DD HH:MM:SS."""
    if QUIET:
        return
    # Formato solicitado: [2026-02-08 21:30:13] Msg
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")


def conectar_db2():
    """Conecta ao DB2."""
    conn = pyodbc.connect(STRING_CONEXAO_DB2, timeout=30)
    log("DB2 OK | conexão estabelecida")
    return conn


def executar_sql_db2(conn, query: str) -> List[Dict[str, Any]]:
    """Executa SQL no DB2 e retorna lista de dicionários."""
    cursor = conn.cursor()
    try:
        # Define o schema antes de executar a query
        cursor.execute("SET CURRENT SCHEMA DBA")
        cursor.execute(query)
    except Exception as e:
        log(f"  ERRO SQL: {e}")
        log(f"  Query (primeiros 500 chars): {query[:500]}...")
        return []
    
    if cursor.description is None:
        return []
    
    colunas = [col[0].strip() for col in cursor.description]
    rows = cursor.fetchall()
    return [dict(zip(colunas, row)) for row in rows]


def formatar_data(valor) -> str:
    """Formata data para YYYY-MM-DD."""
    if valor is None:
        return ""
    if hasattr(valor, 'strftime'):
        return valor.strftime('%Y-%m-%d')
    return str(valor)[:10]


def formatar_datetime(valor) -> str:
    """Formata datetime para ISO 8601 completo (YYYY-MM-DDTHH:MM:SS)."""
    if valor is None:
        return ""
    if hasattr(valor, 'strftime'):
        return valor.strftime('%Y-%m-%dT%H:%M:%S')
    # Se vier como string "2025-02-08 21:50:00", converter para formato ISO
    valor_str = str(valor)
    if ' ' in valor_str:
        # Substituir espaço por 'T' para formato ISO
        return valor_str.replace(' ', 'T')[:19]
    return valor_str[:19]  # Retorna até segundos


def formatar_hora(valor) -> str:
    """Formata hora para HH:MM:SS."""
    if valor is None:
        return ""
    if hasattr(valor, 'strftime'):
        return valor.strftime('%H:%M:%S')
    return str(valor)[:8]


def inicializar_sqlite():
    """Inicializa o banco SQLite com o schema."""
    log(f"Inicializando SQLite em {"host=127.0.0.1 port=5435 dbname=data_stoker user=postgres password=1234"}...")
    
    try:
        conn_sqlite = psycopg2.connect('host=127.0.0.1 port=5435 dbname=data_stoker user=postgres password=1234')
        cursor = conn.cursor()
        
        # Enable WAL mode and set busy timeout for concurrent access
        
        
        conn.commit()
        
        # 1. Cache Orcamentos
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cache_orcamentos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    CHAVE TEXT UNIQUE NOT NULL,
                    IDEMPRESA INTEGER,
                    IDORCAMENTO INTEGER,
                    IDPRODUTO TEXT,
                    IDSUBPRODUTO TEXT,
                    NUMSEQUENCIA INTEGER,
                    QTDPRODUTO REAL,
                    UNIDADE TEXT,
                    FABRICANTE TEXT,
                    VALUNITBRUTO REAL,
                    VALTOTLIQUIDO REAL,
                    DESCRRESPRODUTO TEXT,
                    IDVENDEDOR TEXT,
                    IDLOCALRETIRADA INTEGER,
                    IDSECAO INTEGER,
                    DESCRSECAO TEXT,
                    TIPOENTREGA TEXT,
                    NOMEVENDEDOR TEXT,
                    TIPOENTREGA_DESCR TEXT,
                    LOCALRETESTOQUE TEXT,
                    FLAGCANCELADO TEXT,
                    IDCLIFOR TEXT,
                    DESCLIENTE TEXT,
                    DTMOVIMENTO TEXT,
                    IDRECEBIMENTO TEXT,
                    DESCRRECEBIMENTO TEXT,
                    FLAGPRENOTAPAGA TEXT,
                    CODBARRAS TEXT,
                    CODBARRAS_CAIXA TEXT,
                    OBSERVACAO TEXT,
                    OBSERVACAO2 TEXT,
                    DESCRCIDADE TEXT,
                    UF TEXT,
                    IDCEP TEXT,
                    ENDERECO TEXT,
                    BAIRRO TEXT,
                    CNPJCPF TEXT,
                    NUMERO TEXT,
                    sync_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
        except Exception as e:
            log(f"Erro ao criar cache_orcamentos: {e}")

        # Migration: cache_orcamentos new header fields
        try:
            cursor.execute("PRAGMA table_info(cache_orcamentos)")
            cache_cols = [info[1] for info in cursor.fetchall()]
            new_cache_cols = {
                "OBSERVACAO": "TEXT",
                "OBSERVACAO2": "TEXT",
                "DESCRCIDADE": "TEXT",
                "UF": "TEXT",
                "IDCEP": "TEXT",
                "ENDERECO": "TEXT",
                "BAIRRO": "TEXT",
                "CNPJCPF": "TEXT",
                "NUMERO": "TEXT",
            }
            for col, col_type in new_cache_cols.items():
                if col not in cache_cols:
                    try:
                        cursor.execute(f"ALTER TABLE cache_orcamentos ADD COLUMN {col} {col_type}")
                        log(f"  Migracao: Coluna {col} adicionada a cache_orcamentos")
                    except Exception as e:
                        log(f"  Erro na migracao {col}: {e}")
            conn.commit()
        except Exception as e:
            log(f"Erro na migracao cache_orcamentos: {e}")

        # 2. Remover tabelas antigas
        try:
            cursor.execute("DROP TABLE IF EXISTS cache_vendas_pendentes")
            cursor.execute("DROP TABLE IF EXISTS cache_tubos_conexoes")
            conn.commit()
        except Exception as e:
            log(f"Erro ao limpar tabelas antigas: {e}")

        # 3. Companies & Goals & Alerts & Pickup Points
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pickup_points (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    active INTEGER DEFAULT 1
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS companies (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    cnpj TEXT UNIQUE NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS goals (
                    id TEXT PRIMARY KEY,
                    salesperson_id TEXT NOT NULL,
                    company_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    target_value REAL NOT NULL,
                    month INTEGER NOT NULL,
                    year INTEGER NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id TEXT PRIMARY KEY,
                    company_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    salesperson_id TEXT,
                    severity TEXT DEFAULT 'warning',
                    is_read INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
        except Exception as e:
            log(f"Erro ao criar tabelas comp/goals/alerts: {e}")
            
        # 4. Indices
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orc_dt ON cache_orcamentos(DTMOVIMENTO)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orc_vend ON cache_orcamentos(IDVENDEDOR)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orc_chave ON cache_orcamentos(CHAVE)")
            conn.commit()
        except Exception as e:
            log(f"Erro ao criar indices: {e}")

        # 5. Users
        try:
            # Check if settings column exists if table exists
            cursor.execute("PRAGMA table_info(users)")
            columns = [info[1] for info in cursor.fetchall()]
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    sections TEXT,
                    settings TEXT,
                    active INTEGER DEFAULT 1,
                    badge_code TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Migration: settings
            if 'settings' not in columns and 'users' in [t[0] for t in cursor.execute("SELECT name FROM pg_tables WHERE type='table'")]:
                 try:
                     cursor.execute("ALTER TABLE users ADD COLUMN settings TEXT")
                 except:
                     pass

            # Migration: badge_code
            if 'badge_code' not in columns and 'users' in [t[0] for t in cursor.execute("SELECT name FROM pg_tables WHERE type='table'")]:
                 try:
                     cursor.execute("ALTER TABLE users ADD COLUMN badge_code TEXT")
                     log("  Migracao: Coluna badge_code adicionada a users")
                 except Exception as e:
                     log(f"  Erro na migracao badge_code: {e}")
            conn.commit()
        except Exception as e:
            log(f"Erro ao criar users: {e}")
            
        # 6. Sections
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sections (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL
                )
            """)
            conn.commit()
        except Exception as e:
            log(f"Erro ao criar sections: {e}")
            
        # 7. App Tables
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    erp_code TEXT UNIQUE NOT NULL,
                    barcode TEXT,
                    box_barcode TEXT,
                    box_barcodes TEXT,
                    name TEXT NOT NULL,
                    section TEXT NOT NULL,
                    pickup_point INTEGER NOT NULL,
                    unit TEXT DEFAULT 'UN' NOT NULL,
                    manufacturer TEXT,
                    price REAL DEFAULT 0 NOT NULL,
                    stock_qty REAL DEFAULT 0 NOT NULL,
                    erp_updated_at TEXT
                )
            """)
            
            # Migration: box_barcodes
            cursor.execute("PRAGMA table_info(products)")
            prod_cols = [info[1] for info in cursor.fetchall()]
            if 'box_barcodes' not in prod_cols and 'products' in [t[0] for t in cursor.execute("SELECT name FROM pg_tables WHERE type='table'")]:
                 try:
                     cursor.execute("ALTER TABLE products ADD COLUMN box_barcodes TEXT")
                     log("  Migracao: Coluna box_barcodes adicionada a products")
                 except Exception as e:
                     log(f"  Erro na migracao box_barcodes: {e}")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS routes (
                    id TEXT PRIMARY KEY,
                    code TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY,
                    erp_order_id TEXT UNIQUE NOT NULL,
                    customer_name TEXT NOT NULL,
                    customer_code TEXT,
                    total_value REAL DEFAULT 0 NOT NULL,
                    observation TEXT,
                    observation2 TEXT,
                    city TEXT,
                    state TEXT,
                    zip_code TEXT,
                    address TEXT,
                    neighborhood TEXT,
                    cnpj_cpf TEXT,
                    address_number TEXT,
                    status TEXT DEFAULT 'pendente' NOT NULL,
                    financial_status TEXT DEFAULT 'pendente' NOT NULL,
                    priority INTEGER DEFAULT 0 NOT NULL,
                    is_launched INTEGER DEFAULT 0 NOT NULL,
                    route_id TEXT REFERENCES routes(id),
                    separation_code TEXT UNIQUE,
                    pickup_points TEXT,
                    erp_updated_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """)

            # Migration: orders new header fields
            cursor.execute("PRAGMA table_info(orders)")
            orders_cols = [info[1] for info in cursor.fetchall()]
            new_orders_cols = {
                "observation2": "TEXT",
                "city": "TEXT",
                "state": "TEXT",
                "zip_code": "TEXT",
                "address": "TEXT",
                "neighborhood": "TEXT",
                "cnpj_cpf": "TEXT",
                "address_number": "TEXT",
            }
            for col, col_type in new_orders_cols.items():
                if col not in orders_cols:
                    try:
                        cursor.execute(f"ALTER TABLE orders ADD COLUMN {col} {col_type}")
                        log(f"  Migracao: Coluna {col} adicionada a orders")
                    except Exception as e:
                        log(f"  Erro na migracao orders.{col}: {e}")
            conn.commit()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS order_items (
                    id TEXT PRIMARY KEY,
                    order_id TEXT NOT NULL REFERENCES orders(id),
                    product_id TEXT NOT NULL REFERENCES products(id),
                    quantity REAL NOT NULL,
                    separated_qty REAL DEFAULT 0 NOT NULL,
                    checked_qty REAL DEFAULT 0 NOT NULL,
                    status TEXT DEFAULT 'pendente' NOT NULL,
                    pickup_point INTEGER NOT NULL,
                    section TEXT NOT NULL,
                    qty_picked REAL DEFAULT 0,
                    qty_checked REAL DEFAULT 0,
                    exception_type TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS work_units (
                    id TEXT PRIMARY KEY,
                    order_id TEXT REFERENCES orders(id),
                    status TEXT NOT NULL,
                    type TEXT NOT NULL,
                    pickup_point INTEGER,
                    section TEXT,
                    assigned_user_id TEXT REFERENCES users(id),
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    completed_at TEXT,
                    locked_by TEXT REFERENCES users(id),
                    locked_at TEXT,
                    lock_expires_at TEXT,
                    cart_qr_code TEXT,
                    pallet_qr_code TEXT,
                    started_at TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS exceptions (
                    id TEXT PRIMARY KEY,
                    work_unit_id TEXT NOT NULL REFERENCES work_units(id),
                    order_item_id TEXT NOT NULL REFERENCES order_items(id),
                    type TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    observation TEXT,
                    reported_by TEXT NOT NULL REFERENCES users(id),
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT REFERENCES users(id),
                    action TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT,
                    details TEXT,
                    previous_value TEXT,
                    new_value TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """)
            
            # Additional tables for server functionality
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS section_groups (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    sections TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS picking_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id),
                    order_id TEXT NOT NULL REFERENCES orders(id),
                    section_id TEXT NOT NULL,
                    last_heartbeat TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    UNIQUE(order_id, section_id)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id),
                    token TEXT NOT NULL,
                    session_key TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS manual_qty_rules (
                    id TEXT PRIMARY KEY,
                    rule_type TEXT NOT NULL,
                    value TEXT NOT NULL,
                    description TEXT,
                    active INTEGER DEFAULT 1,
                    created_by TEXT REFERENCES users(id),
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS db2_mappings (
                    id TEXT PRIMARY KEY,
                    dataset TEXT NOT NULL,
                    version INTEGER DEFAULT 1 NOT NULL,
                    is_active INTEGER DEFAULT 0 NOT NULL,
                    mapping_json TEXT NOT NULL,
                    description TEXT,
                    created_by TEXT REFERENCES users(id),
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """)
            
            conn.commit()
            log(f"SQLite OK | arquivo=database.db | schema=OK")
        except Exception as e:
            log(f"Erro ao criar tabelas da aplicacao: {e}")
            import traceback
            traceback.print_exc()
            
    except Exception as e:
        log(f"Erro CRITICO ao inicializar SQLite: {e}")
        return

    finally:
        try:
            conn.close()
        except:
            pass


def gerar_sql_orcamentos() -> str:
    """Lê SQL de orçamentos do arquivo .sql"""
    try:
        path_sql = os.path.join(PROJECT_ROOT, "sql", "orcamentos.sql")
        # Check if file exists, if not use fallback
        if not os.path.exists(path_sql):
             log("WARN: sql/orcamentos.sql nao encontrado. Usando query fallback.")
             return "SELECT * FROM DUMMY" # Should not happen if environment is correct
             
        with open(path_sql, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        log(f"Erro ao ler sql/orcamentos.sql: {e}")
        return ""


def load_pg_mappings(dataset: str) -> Optional[list]:
    """Carrega mapeamento ativo do PostgreSQL para o dataset especificado."""
    if not psycopg2:
        # log("psycopg2 nao instalado - usando mapeamento legado")
        return None
    
    pg_url = os.environ.get('DATABASE_URL')
    if not pg_url:
        # log("DATABASE_URL nao configurada - usando mapeamento legado")
        return None
    
    try:
        conn_pg = psycopg2.connect(pg_url)
        cursor = conn_pg.cursor()
        cursor.execute(
            "SELECT mapping_json FROM db2_mappings WHERE dataset = %s AND is_active = true ORDER BY version DESC LIMIT 1",
            (dataset,)
        )
        row = cursor.fetchone()
        conn_pg.close()
        
        if row:
            mapping = row[0]
            if isinstance(mapping, str):
                mapping = json_module.loads(mapping)
            # log(f"  Mapping ativo encontrado para '{dataset}' ({len(mapping)} campos)")
            return mapping
        else:
            # log(f"  Nenhum mapping ativo para '{dataset}' - usando mapeamento legado")
            return None
    except Exception as e:
        log(f"  Erro ao carregar mapping do PostgreSQL: {e}")
        return None


def apply_mapping(row: dict, mapping: list) -> dict:
    """Aplica um mapeamento a uma linha de dados do cache."""
    result = {}
    for field_map in mapping:
        app_field = field_map.get('appField', '')
        db_expr = field_map.get('dbExpression', '')
        cast = field_map.get('cast', '')
        default = field_map.get('defaultValue', '')
        
        value = None
        if db_expr:
            value = row.get(db_expr)
            if value is None:
                value = row.get(db_expr.upper())
            if value is None:
                value = row.get(db_expr.lower())
        
        if value is None or value == '':
            value = default if default else None
        
        if value is not None and cast:
            try:
                if cast == 'number':
                    value = float(value)
                elif cast == 'string':
                    value = str(value)
                elif cast == 'divide_100':
                    value = float(value) / 100.0
                elif cast == 'divide_1000':
                    value = float(value) / 1000.0
                elif cast == 'boolean_T_F':
                    value = (str(value).upper() == 'T')
            except (ValueError, TypeError):
                pass
        
        result[app_field] = value
    return result


def transform_data(conn_sqlite):
    """
    Transforma dados brutos de cache_orcamentos em orders/products/work_units
    para uso da aplicação. Otimizado com Bulk Insert e Delta Sync.
    """
    # Carregar mapeamentos do PostgreSQL (se disponiveis)
    orders_mapping = load_pg_mappings("orders")
    products_mapping = load_pg_mappings("products")
    items_mapping = load_pg_mappings("order_items")
    
    use_dynamic_mapping = (orders_mapping is not None or products_mapping is not None or items_mapping is not None)

    if use_dynamic_mapping:
        log("Transformação | Usando mapeamento dinâmico do Mapping Studio")
    # else:
    #     log("Transformação | WARN: psycopg2 ausente; usando mapeamento legado (hardcoded)")
    
    cursor = conn_sqlite.cursor()
    
    # 1. Obter dados do cache (últimos 31 dias já filtrados pelo sync_orcamentos)
    cursor.execute("SELECT * FROM cache_orcamentos")
    rows = cursor.fetchall()
    
    if not rows:
        return
        
    col_names = [description[0] for description in cursor.description]
    
    # Pre-loading Existing Data IDs to memory for fast lookup
    cursor.execute("SELECT erp_order_id, id FROM orders")
    existing_orders = {r[0]: r[1] for r in cursor.fetchall()}
    
    cursor.execute("SELECT erp_code, id FROM products")
    existing_products = {r[0]: r[1] for r in cursor.fetchall()}
    
    # For items lookup (order_id, product_id)
    cursor.execute("SELECT order_id, product_id FROM order_items")
    existing_items = set((r[0], r[1]) for r in cursor.fetchall()) # Set of tuples
    
    # Work units
    cursor.execute("SELECT order_id, section, pickup_point FROM work_units")
    existing_work_units = set((r[0], str(r[1]) if r[1] is not None else None, int(r[2]) if r[2] is not None else 0) for r in cursor.fetchall())
    
    # Batches for insert/update
    upsert_orders = []
    new_products = []
    
    # New Item Inserts
    new_items_to_insert = []
    
    unique_pickup_points = set()
    unique_sections = set()
    new_work_units = []
    
    # Helper Data Structures for this Batch
    batch_products_map = {} 
    
    orders_map = {} # erp_order_id -> {total, items: [], ...}

    # Pass 1: Aggregate Rows into Orders in Memory
    for row_tuple in rows:
        row = dict(zip(col_names, row_tuple))
        
        # Use dynamic mapping if available, otherwise use legacy hardcoded mapping
        if orders_mapping:
            mapped_order = apply_mapping(row, orders_mapping)
            id_empresa = str(row.get('IDEMPRESA', ''))
            erp_order_id = str(mapped_order.get('erp_order_id', ''))
            map_key = f"{id_empresa}-{erp_order_id}"
            
            if map_key not in orders_map:
                orders_map[map_key] = {
                    'erp_id_display': erp_order_id,
                    'customer_name': mapped_order.get('customer_name') or 'Cliente Desconhecido',
                    'customer_code': str(mapped_order.get('customer_code') or ''),
                    'total_value': 0.0,
                    'items': [],
                    'created_at': mapped_order.get('created_at'),
                    'pickup_point': mapped_order.get('pickup_point'),
                    'section': mapped_order.get('section'),
                    'flag_pre_nota_paga': None,  # Handled by financial_status mapping
                    'financial_status': mapped_order.get('financial_status'),
                }
            
            val_liq = float(mapped_order.get('total_value') or 0)
            orders_map[map_key]['total_value'] += val_liq
            orders_map[map_key]['items'].append(row)
        else:
            # Legacy hardcoded mapping
            id_empresa = str(row.get('IDEMPRESA'))
            id_orcamento = str(row.get('IDORCAMENTO'))
            erp_order_id = id_orcamento
            map_key = f"{id_empresa}-{id_orcamento}"
            
            if map_key not in orders_map:
                orders_map[map_key] = {
                    'erp_id_display': erp_order_id,
                    'customer_name': row.get('DESCLIENTE') or 'Cliente Desconhecido',
                    'customer_code': str(row.get('IDCLIFOR') or ''),
                    'total_value': 0.0,
                    'items': [],
                    'created_at': row.get('DTMOVIMENTO'),
                    'pickup_point': row.get('IDLOCALRETIRADA'),
                    'section': row.get('IDSECAO'),
                    'flag_pre_nota_paga': row.get('FLAGPRENOTAPAGA')
                }
            
            val_liq = float(row.get('VALTOTLIQUIDO') or 0) / 100.0
            orders_map[map_key]['total_value'] += val_liq
            orders_map[map_key]['items'].append(row)

    # Pass 2: Process Aggregated Orders & Delta Sync Items
    
    # Store all ERP IDs processed in this batch for deletion check later
    processed_erp_order_ids = set()

    for map_key, data in orders_map.items():
        
        erp_order_id = data['erp_id_display']
        id_empresa_raw = map_key.split('-')[0]
        id_empresa = int(id_empresa_raw) if id_empresa_raw.isdigit() else 1
        processed_erp_order_ids.add(erp_order_id)
        
        # --- ORDER ---
        order_uuid = existing_orders.get(erp_order_id)
        if not order_uuid:
            order_uuid = str(uuid.uuid4())
            existing_orders[erp_order_id] = order_uuid 
            
        # Map Financial Status
        if data.get('financial_status'):
            fin_status = data['financial_status']
        elif data.get('flag_pre_nota_paga') == 'T':
            fin_status = 'faturado'
        else:
            fin_status = 'pendente'

        # Prepare pickup_points JSON
        pickup_point_val = data.get('pickup_point')
        pickup_points_json = json.dumps([pickup_point_val]) if pickup_point_val else '[]'

        # Always add to upsert list (Update existing ones too)
        # Collect header fields from first item of this order
        first_item = data['items'][0] if data['items'] else {}
        upsert_orders.append((
            order_uuid, erp_order_id, data['customer_name'], data['customer_code'],
            data['total_value'], fin_status, pickup_points_json, data.get('created_at'),
            first_item.get('OBSERVACAO', ''),
            first_item.get('OBSERVACAO2', ''),
            first_item.get('DESCRCIDADE', ''),
            first_item.get('UF', ''),
            str(first_item.get('IDCEP', '') or ''),
            first_item.get('ENDERECO', ''),
            first_item.get('BAIRRO', ''),
            str(first_item.get('CNPJCPF', '') or ''),
            str(first_item.get('NUMERO', '') or ''),
            id_empresa
        ))
        
        # Track sections/pickup_points for this order
        order_distinct_configs = set()

        # --- ITEMS (Delta Sync) --- 
        # Map of Incoming Items: ERP_PROD_CODE -> Item Data
        incoming_items_map = {}
        
        for item in data['items']:
            if products_mapping and items_mapping:
                mapped_prod = apply_mapping(item, products_mapping)
                mapped_item = apply_mapping(item, items_mapping)
                erp_prod_code = str(mapped_prod.get('erp_code') or mapped_item.get('erp_product_code') or '')
                prod_uuid = existing_products.get(erp_prod_code)
                unit = str(mapped_prod.get('unit') or 'UN')
                manufacturer = str(mapped_prod.get('manufacturer') or '')
                real_qty = float(mapped_item.get('quantity') or 0)
                price = mapped_prod.get('price')
                barcode = mapped_prod.get('barcode')
                box_barcode = mapped_prod.get('box_barcode')
                name = mapped_prod.get('name')
                
                item_pickup = mapped_item.get('pickup_point')
                item_section = str(mapped_item.get('section') or '')
            else:
                erp_prod_code = str(item.get('IDPRODUTO'))
                prod_uuid = existing_products.get(erp_prod_code)
                unit = item.get('UNIDADE') or 'UN'
                manufacturer = item.get('FABRICANTE') or ''
                raw_qty = float(item.get('QTDPRODUTO') or 0)
                real_qty = raw_qty / 1000.0
                price = item.get('VALUNITBRUTO')
                barcode = item.get('CODBARRAS')
                box_barcode = item.get('CODBARRAS_CAIXA')
                name = item.get('DESCRRESPRODUTO')
                
                item_pickup = item.get('IDLOCALRETIRADA')
                item_section = str(item.get('IDSECAO'))

            # Ensure Product Exists
            if not prod_uuid:
                prod_uuid = batch_products_map.get(erp_prod_code)
                if not prod_uuid:
                    prod_uuid = str(uuid.uuid4())
                    new_products.append((
                        prod_uuid, erp_prod_code, barcode, box_barcode, name,
                        str(item_section or ''), item_pickup, unit, manufacturer, price
                    ))
                    batch_products_map[erp_prod_code] = prod_uuid
            
            # Key for Incoming Item uniqueness using ERP Product Code
            incoming_items_map[erp_prod_code] = {
                'prod_uuid': prod_uuid,
                'qty': real_qty,
                'pickup': item_pickup,
                'section': item_section
            }

            # Capture Pickup/Section Names
            if item_pickup and item_pickup > 0:
                pp_name = item.get('LOCALRETESTOQUE') or f"Ponto {item_pickup}"
                unique_pickup_points.add((item_pickup, pp_name))
            if item_section and str(item_section).isdigit():
                sec_id = int(item_section)
                sec_name = item.get('DESCRSECAO') or f"Seção {sec_id}"
                unique_sections.add((sec_id, sec_name))

            # Work Unit Configs
            wu_section = item_section if item_section else None
            wu_pickup = int(item_pickup) if item_pickup else 0
            order_distinct_configs.add((wu_section, wu_pickup))


        # 2. Compare with DB Items (if Order exists) to do Delta Sync (Update/Delete)
        current_db_items = {} # erp_prod_code -> {id, quantity, product_id}
        
        # Optimization: Fetch DB Items for this order to perform Diff
        if order_uuid:
             try:
                 cursor.execute("""
                    SELECT oi.id, oi.quantity, p.erp_code, oi.product_id 
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    WHERE oi.order_id = %s
                 """, (order_uuid,))
                 rows_db = cursor.fetchall()
                 for r in rows_db:
                     current_db_items[r[2]] = {'id': r[0], 'qty': r[1], 'prod_id': r[3]}
             except Exception as e:
                 log(f"Erro ao buscar itens DB para diff: {e}")

        # A) Upsert Items (Insert New OR Update Existing)
        for erp_code, item_data in incoming_items_map.items():
            db_item = current_db_items.get(erp_code)
            
            if db_item:
                # Exists -> Check for Quantity Change
                if abs(db_item['qty'] - item_data['qty']) > 0.0001:
                    # Update Quantity
                    cursor.execute("UPDATE order_items SET quantity = %s WHERE id = %s", (item_data['qty'], db_item['id']))
            else:
                # New -> Insert
                # Avoid inserting if we already queued it in new_items (e.g. duplicate lines in ERP resolved to single item%s)
                # We use set logic above or just trust incoming_items_map keys logic.
                if (order_uuid, item_data['prod_uuid']) not in existing_items:
                     new_items_to_insert.append((
                        str(uuid.uuid4()), order_uuid, item_data['prod_uuid'], item_data['qty'],
                        item_data['pickup'], item_data['section']
                    ))
                     existing_items.add((order_uuid, item_data['prod_uuid']))

        # B) Delete Items (Exists in DB but NOT in Incoming)
        for erp_code, db_item in current_db_items.items():
            if erp_code not in incoming_items_map:
                # Deleted from ERP -> Delete from DB
                cursor.execute("DELETE FROM order_items WHERE id = %s", (db_item['id'],))
                # Also delete related exceptions
                cursor.execute("DELETE FROM exceptions WHERE order_item_id = %s", (db_item['id'],))


        # --- Create Work Units based on Distinct Items ---
        for (sec, pp) in order_distinct_configs:
            lookup_sec = str(sec) if sec is not None else None
            lookup_pp = int(pp)
            
            if (order_uuid, lookup_sec, lookup_pp) not in existing_work_units:
                new_work_units.append((
                    str(uuid.uuid4()), order_uuid, pp, sec, id_empresa
                ))
                existing_work_units.add((order_uuid, lookup_sec, lookup_pp))


    # Insert Pickup Points
    try:
        if unique_pickup_points:
            cursor.executemany("INSERT INTO pickup_points (id, name, active) VALUES (%s, %s, true) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, active=true", list(unique_pickup_points))
            
        if unique_sections:
            cursor.executemany("INSERT INTO sections (id, name) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name", list(unique_sections))
            
        conn_sqlite.commit()
    except Exception as e:
        log(f"Erro ao inserir pontos/seções: {e}")

    # 3. Bulk Inserts / Updates
    try:
        if new_products:
            cursor.executemany("""
                INSERT INTO products (id, erp_code, barcode, box_barcode, name, section, pickup_point, unit, manufacturer, price)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT(erp_code) DO UPDATE SET
                    price = excluded.price,
                    name = excluded.name,
                    barcode = excluded.barcode,
                    box_barcode = excluded.box_barcode,
                    section = excluded.section,
                    pickup_point = excluded.pickup_point,
                    unit = excluded.unit,
                    manufacturer = excluded.manufacturer,
                    erp_updated_at = CURRENT_TIMESTAMP
            """, new_products)
            
        if upsert_orders:
            # Upsert Logic: Update Financial Status if order exists
            cursor.executemany("""
                INSERT INTO orders (
                    id, erp_order_id, customer_name, customer_code, total_value, financial_status,
                    pickup_points, status, created_at,
                    observation, observation2, city, state, zip_code, address, neighborhood, cnpj_cpf, address_number,
                    company_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pendente', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT(erp_order_id) DO UPDATE SET
                    financial_status = excluded.financial_status,
                    total_value = excluded.total_value,
                    customer_name = excluded.customer_name,
                    pickup_points = excluded.pickup_points,
                    observation = excluded.observation,
                    observation2 = excluded.observation2,
                    city = excluded.city,
                    state = excluded.state,
                    zip_code = excluded.zip_code,
                    address = excluded.address,
                    neighborhood = excluded.neighborhood,
                    cnpj_cpf = excluded.cnpj_cpf,
                    address_number = excluded.address_number,
                    company_id = excluded.company_id,
                    updated_at = CURRENT_TIMESTAMP
            """, upsert_orders)
            
        if new_items_to_insert:
            cursor.executemany("""
                INSERT INTO order_items (id, order_id, product_id, quantity, separated_qty, status, pickup_point, section)
                VALUES (%s, %s, %s, %s, 0, 'pendente', %s, %s)
            """, new_items_to_insert)
            
        if new_work_units:
            cursor.executemany("""
                INSERT INTO work_units (id, order_id, status, type, pickup_point, section, company_id)
                VALUES (%s, %s, 'pendente', 'separacao', %s, %s, %s)
            """, new_work_units)

        # 4. ORDER DELETION LOGIC (Hard Delete for Missing Orders)
        # Only delete orders within the sync window (last 31 days) to avoid wiping old history
        if processed_erp_order_ids:
            
            quoted_ids = ",".join(f"'{x}'" for x in processed_erp_order_ids)
            
            # Find IDs to delete:
            # Created >= 31 days ago (active window)
            # AND NOT IN processed_erp_order_ids
            # AND status logic%s User requested "If diff or not exist, delete/change".
            # We delete regardless of status if it disappeared from ERP view, assuming ERP is master.
            
            sql_find_deleted = f"""
                SELECT id, erp_order_id FROM orders 
                WHERE created_at::timestamp >= CURRENT_DATE - INTERVAL '31 days'
                AND erp_order_id NOT IN ({quoted_ids})
            """
            cursor.execute(sql_find_deleted)
            orders_to_delete = cursor.fetchall()
            
            if orders_to_delete:
                ids_to_del = [row[0] for row in orders_to_delete]
                erp_ids_del = [row[1] for row in orders_to_delete]
                
                log(f"Detectada remoção no ERP: Excluindo {len(ids_to_del)} pedidos locais: {erp_ids_del}")
                
                quoted_uuids = ",".join(f"'{x}'" for x in ids_to_del)
                
                # Delete Children Manually (No Cascade assumed)
                cursor.execute(f"DELETE FROM exceptions WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN ({quoted_uuids}))")
                cursor.execute(f"DELETE FROM order_items WHERE order_id IN ({quoted_uuids})")
                cursor.execute(f"DELETE FROM work_units WHERE order_id IN ({quoted_uuids})")
                cursor.execute(f"DELETE FROM picking_sessions WHERE order_id IN ({quoted_uuids})")
                
                # Delete Parent
                cursor.execute(f"DELETE FROM orders WHERE id IN ({quoted_uuids})")


        conn_sqlite.commit()
        
        # Log Summary
        log(f"Transformação | pedidos_processados={len(orders_map)} | novos_itens={len(new_items_to_insert)}")
        
    except Exception as e:
        log(f"Erro no Bulk Insert: {e}")
        import traceback
        traceback.print_exc()


def sync_orcamentos(conn_db2, conn_sqlite):
    """Sincroniza tabela cache_orcamentos (Janela 31 dias)."""
    cursor = conn_sqlite.cursor()
    
    # log(f"Sincronizando ORCAMENTOS (Últimos 31 dias)...")
    query = gerar_sql_orcamentos()

    try:
        dados = executar_sql_db2(conn_db2, query)
    except Exception as e:
        log(f"  ERRO ao executar query: {e}")
        return
    
    # log(f"  {len(dados)} registros obtidos do DB2")
    
    # ESTRATÉGIA WINDOW SYNC:
    # 1. Deletar tudo da janela (32 dias pra trás para garantir)
    # 2. Inserir tudo novo
    # Isso garante que registros excluídos no DB2 sumam do SQLite.
    
    cutoff_date = (datetime.now() - timedelta(days=32)).strftime('%Y-%m-%d')
    deleted_count = 0
    try:
        cursor.execute('DELETE FROM cache_orcamentos WHERE "DTMOVIMENTO" >= %s', (cutoff_date,))
        deleted_count = cursor.rowcount
        # log(f"  {deleted_count} registros removidos da janela local (>= {cutoff_date})")
    except Exception as e:
        log(f"  Erro ao limpar janela local: {e}")
    
    inseridos = 0
    erros = 0
    
    for row in dados:
        try:
            # Gera chave única: EMPRESA-ORC-PROD-SUBPROD-SEQ
            chave = f"{row.get('IDEMPRESA')}-{row.get('IDORCAMENTO')}-{row.get('IDPRODUTO')}-{row.get('IDSUBPRODUTO')}-{row.get('NUMSEQUENCIA')}"
            
            cursor.execute("""
                INSERT INTO cache_orcamentos (
                    "CHAVE", "IDEMPRESA", "IDORCAMENTO", "IDPRODUTO", "IDSUBPRODUTO", "NUMSEQUENCIA",
                    "QTDPRODUTO", "UNIDADE", "FABRICANTE", "VALUNITBRUTO", "VALTOTLIQUIDO", "DESCRRESPRODUTO",
                    "IDVENDEDOR", "IDLOCALRETIRADA", "IDSECAO", "DESCRSECAO",
                    "TIPOENTREGA", "NOMEVENDEDOR", "TIPOENTREGA_DESCR", "LOCALRETESTOQUE",
                    "FLAGCANCELADO", "IDCLIFOR", "DESCLIENTE", "DTMOVIMENTO",
                    "IDRECEBIMENTO", "DESCRRECEBIMENTO", "FLAGPRENOTAPAGA",
                    "CODBARRAS", "CODBARRAS_CAIXA",
                    "OBSERVACAO", "OBSERVACAO2", "DESCRCIDADE", "UF", "IDCEP", "ENDERECO", "BAIRRO", "CNPJCPF", "NUMERO"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("CHAVE") DO UPDATE SET
                    "IDEMPRESA"=EXCLUDED."IDEMPRESA", "IDORCAMENTO"=EXCLUDED."IDORCAMENTO", "IDPRODUTO"=EXCLUDED."IDPRODUTO",
                    "IDSUBPRODUTO"=EXCLUDED."IDSUBPRODUTO", "NUMSEQUENCIA"=EXCLUDED."NUMSEQUENCIA", "QTDPRODUTO"=EXCLUDED."QTDPRODUTO",
                    "UNIDADE"=EXCLUDED."UNIDADE", "FABRICANTE"=EXCLUDED."FABRICANTE", "VALUNITBRUTO"=EXCLUDED."VALUNITBRUTO",
                    "VALTOTLIQUIDO"=EXCLUDED."VALTOTLIQUIDO", "DESCRRESPRODUTO"=EXCLUDED."DESCRRESPRODUTO",
                    "IDVENDEDOR"=EXCLUDED."IDVENDEDOR", "IDLOCALRETIRADA"=EXCLUDED."IDLOCALRETIRADA", "IDSECAO"=EXCLUDED."IDSECAO",
                    "DESCRSECAO"=EXCLUDED."DESCRSECAO", "TIPOENTREGA"=EXCLUDED."TIPOENTREGA", "NOMEVENDEDOR"=EXCLUDED."NOMEVENDEDOR",
                    "TIPOENTREGA_DESCR"=EXCLUDED."TIPOENTREGA_DESCR", "LOCALRETESTOQUE"=EXCLUDED."LOCALRETESTOQUE",
                    "FLAGCANCELADO"=EXCLUDED."FLAGCANCELADO", "IDCLIFOR"=EXCLUDED."IDCLIFOR", "DESCLIENTE"=EXCLUDED."DESCLIENTE",
                    "DTMOVIMENTO"=EXCLUDED."DTMOVIMENTO", "IDRECEBIMENTO"=EXCLUDED."IDRECEBIMENTO", "DESCRRECEBIMENTO"=EXCLUDED."DESCRRECEBIMENTO",
                    "FLAGPRENOTAPAGA"=EXCLUDED."FLAGPRENOTAPAGA", "CODBARRAS"=EXCLUDED."CODBARRAS", "CODBARRAS_CAIXA"=EXCLUDED."CODBARRAS_CAIXA",
                    "OBSERVACAO"=EXCLUDED."OBSERVACAO", "OBSERVACAO2"=EXCLUDED."OBSERVACAO2", "DESCRCIDADE"=EXCLUDED."DESCRCIDADE",
                    "UF"=EXCLUDED."UF", "IDCEP"=EXCLUDED."IDCEP", "ENDERECO"=EXCLUDED."ENDERECO", "BAIRRO"=EXCLUDED."BAIRRO",
                    "CNPJCPF"=EXCLUDED."CNPJCPF", "NUMERO"=EXCLUDED."NUMERO"
            """, (
                chave,
                int(row.get('IDEMPRESA', 0)),
                int(row.get('IDORCAMENTO', 0)),
                str(row.get('IDPRODUTO', '')),
                str(row.get('IDSUBPRODUTO', '')),
                int(row.get('NUMSEQUENCIA', 0)),
                float(row.get('QTDPRODUTO', 0) or 0),
                str(row.get('UNIDADE', 'UN') or 'UN'),
                str(row.get('FABRICANTE', '') or ''), # Capture FABRICANTE
                float(row.get('VALUNITBRUTO', 0) or 0),
                float(row.get('VALTOTLIQUIDO', 0) or 0),
                row.get('DESCRRESPRODUTO', ''),
                str(row.get('IDVENDEDOR', '')),
                int(row.get('IDLOCALRETIRADA', 0) or 0),
                int(row.get('IDSECAO', 0) or 0),
                row.get('DESCRSECAO', ''),
                row.get('TIPOENTREGA', ''),
                row.get('NOMEVENDEDOR', ''),
                row.get('TIPOENTREGA_DESCR', ''),
                row.get('LOCALRETESTOQUE', ''),
                row.get('FLAGCANCELADO', ''),
                str(row.get('IDCLIFOR', '')),
                row.get('DESCLIENTE', ''),
                formatar_datetime(row.get('DTMOVIMENTO')),
                str(row.get('IDRECEBIMENTO', '')),
                row.get('DESCRRECEBIMENTO', ''),
                row.get('FLAGPRENOTAPAGA', ''),
                str(row.get('CODBARRAS', '') or ''),
                str(row.get('CODBARRAS_CAIXA', '') or ''),
                str(row.get('OBSERVACAO', '') or ''),
                str(row.get('OBSERVACAO2', '') or ''),
                str(row.get('DESCRCIDADE', '') or ''),
                str(row.get('UF', '') or ''),
                str(row.get('IDCEP', '') or ''),
                str(row.get('ENDERECO', '') or ''),
                str(row.get('BAIRRO', '') or ''),
                str(row.get('CNPJCPF', '') or ''),
                str(row.get('NUMERO', '') or '')
            ))
            inseridos += 1
                
        except Exception as e:
            log(f"  Erro ao inserir registro {chave}: {e}")
            erros += 1
    
    conn_sqlite.commit()
    conn_sqlite.commit()
    log(f"ORCAMENTOS (31d) | obtidos={len(dados)} | removidos={deleted_count} (>= {cutoff_date}) | inseridos={inseridos} | erros={erros}")


def sync_box_barcodes(conn_db2, conn_sqlite):
    """Sincroniza a tabela PRODUTO_GRADE_CODBARCX localmente (Multiplos códigos de caixa e quantidades)"""
    cursor = conn_sqlite.cursor()
    # Pega apenas produtos que estao na nossa base no momento
    cursor.execute("SELECT id, erp_code FROM products")
    products_db = cursor.fetchall()
    
    if not products_db:
        return
        
    erp_to_uuid = {str(r[1]).strip(): str(r[0]) for r in products_db}
    
    try:
        db2_cursor = conn_db2.cursor()
        db2_cursor.execute("SET CURRENT SCHEMA DBA")
        
        all_box_barcodes = {}
        
        erp_codes = list(erp_to_uuid.keys())
        chunk_size = 500
        
        for i in range(0, len(erp_codes), chunk_size):
            chunk = erp_codes[i:i + chunk_size]
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
                barcode = str(row[1]).strip()
                qty = float(row[2]) / 1000.0
                
                if not barcode: continue
                
                if erp_code not in all_box_barcodes:
                    all_box_barcodes[erp_code] = []
                all_box_barcodes[erp_code].append({"code": barcode, "qty": qty})
                
        updates = []
        for erp_code, barcodes in all_box_barcodes.items():
            if erp_code in erp_to_uuid:
                prod_id = erp_to_uuid[erp_code]
                import json
                updates.append((json.dumps(barcodes), prod_id))
                
        if updates:
            cursor.executemany("UPDATE products SET box_barcodes = %s WHERE id = %s", updates)
            conn_sqlite.commit()
            
        log(f"Box Barcodes Sync | {len(updates)} produtos atualizados com múltiplos códigos de caixa")
        
    except Exception as e:
        log(f"Erro ao sincronizar box_barcodes: {e}")


def sync_enderecos_wms(conn_db2, conn_sqlite):
    """Sincroniza endereços WMS do DB2 para o SQLite local, por empresa."""
    cursor = conn_sqlite.cursor()

    sql_path = os.path.join(PROJECT_ROOT, "sql", "enderecos_wms.sql")
    if not os.path.exists(sql_path):
        log("WARN: sql/enderecos_wms.sql nao encontrado. Pulando sync de endereços.")
        return

    with open(sql_path, 'r', encoding='utf-8') as f:
        query = f.read()

    try:
        dados = executar_sql_db2(conn_db2, query)
    except Exception as e:
        log(f"  ERRO ao executar query enderecos_wms: {e}")
        return

    if not dados:
        log("Endereços WMS | nenhum registro do DB2")
        return

    inseridos = 0
    ignorados = 0

    for row in dados:
        try:
            empresa = int(row.get('IDEMPRESA', 0))
            bairro = str(row.get('IDBAIRRO', '')).strip()
            rua = str(row.get('DESCRRUA', '')).strip()
            bloco = str(row.get('DESCRBLOCO', '')).strip()
            nivel = str(row.get('DESCRNIVEL', '')).strip()

            if not bairro or not rua or not bloco or not nivel:
                ignorados += 1
                continue

            code = f"{bairro}-{rua}-{bloco}-{nivel}"

            cursor.execute(
                "SELECT id FROM wms_addresses WHERE company_id = %s AND code = %s",
                (empresa, code)
            )
            if cursor.fetchone():
                ignorados += 1
                continue

            addr_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO wms_addresses (id, company_id, bairro, rua, bloco, nivel, code, type, active, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'standard', true, CURRENT_TIMESTAMP)
            """, (addr_id, empresa, bairro, rua, bloco, nivel, code))
            inseridos += 1

        except Exception as e:
            log(f"  Erro ao inserir endereço: {e}")

    conn_sqlite.commit()
    log(f"Endereços WMS | obtidos={len(dados)} | novos={inseridos} | existentes={ignorados}")


def sync_notas_recebimento(conn_db2, conn_sqlite):
    """Sincroniza notas fiscais de recebimento do DB2 para o SQLite local, por empresa."""
    cursor = conn_sqlite.cursor()

    sql_path = os.path.join(PROJECT_ROOT, "sql", "notas_recebimento.sql")
    if not os.path.exists(sql_path):
        log("WARN: sql/notas_recebimento.sql nao encontrado. Pulando sync de notas.")
        return

    with open(sql_path, 'r', encoding='utf-8') as f:
        query = f.read()

    try:
        dados = executar_sql_db2(conn_db2, query)
    except Exception as e:
        log(f"  ERRO ao executar query notas_recebimento: {e}")
        return

    if not dados:
        log("Notas Recebimento | nenhum registro do DB2")
        return

    nf_map = {}
    for row in dados:
        empresa = int(row.get('IDEMPRESA', 0))
        numnota = str(row.get('NUMNOTA', '')).strip()
        serie = str(row.get('SERIENOTA', '')).strip()
        key = f"{empresa}-{numnota}-{serie}"

        if key not in nf_map:
            nf_map[key] = {
                'empresa': empresa,
                'numnota': numnota,
                'serie': serie,
                'fornecedor': str(row.get('IDCLIFOR', '')).strip(),
                'autorizacao': str(row.get('IDAUTORIZACAO', '')).strip(),
                'items': []
            }

        nf_map[key]['items'].append({
            'idproduto': str(row.get('IDPRODUTO', '')).strip(),
            'codigoforn': str(row.get('CODIGOINTERNOFORN', '')).strip(),
            'quantidade': float(row.get('QTDPRODUTO', 0) or 0),
            'descricao': str(row.get('DESCRRESPRODUTO', '')).strip(),
        })

    nf_inseridas = 0
    nf_atualizadas = 0
    itens_inseridos = 0

    for key, nf_data in nf_map.items():
        try:
            empresa = nf_data['empresa']
            numnota = nf_data['numnota']

            cursor.execute(
                "SELECT id FROM nf_cache WHERE company_id = %s AND nf_number = %s",
                (empresa, numnota)
            )
            existing = cursor.fetchone()

            if existing:
                nf_id = existing[0]
                cursor.execute("DELETE FROM nf_items WHERE nf_id = %s", (nf_id,))
                nf_atualizadas += 1
            else:
                nf_id = str(uuid.uuid4())
                cursor.execute("""
                    INSERT INTO nf_cache (id, company_id, nf_number, nf_series, supplier_name, status, synced_at)
                    VALUES (%s, %s, %s, %s, %s, 'pendente', CURRENT_TIMESTAMP)
                """, (nf_id, empresa, numnota, nf_data['serie'], nf_data['fornecedor']))
                nf_inseridas += 1

            for item in nf_data['items']:
                item_id = str(uuid.uuid4())

                prod_id = None
                cursor.execute("SELECT id FROM products WHERE erp_code = %s", (item['idproduto'],))
                prod_row = cursor.fetchone()
                if prod_row:
                    prod_id = prod_row[0]

                cursor.execute("""
                    INSERT INTO nf_items (id, nf_id, product_id, erp_code, product_name, quantity, unit, company_id)
                    VALUES (%s, %s, %s, %s, %s, %s, 'UN', %s)
                """, (item_id, nf_id, prod_id, item['idproduto'], item['descricao'], item['quantidade'], empresa))
                itens_inseridos += 1

        except Exception as e:
            log(f"  Erro ao inserir NF {key}: {e}")

    conn_sqlite.commit()
    log(f"Notas Recebimento | NFs={len(nf_map)} | novas={nf_inseridas} | atualizadas={nf_atualizadas} | itens={itens_inseridos}")


def sincronizar(data_inicial: Optional[str] = None) -> bool:
    """Fluxo principal de sincronização."""
    inicio = time.time()
    
    try:
        conn_db2 = conectar_db2()
    except Exception as e:
        log(f"ERRO FATAL DB2: {e}")
        return False
        
    try:
        conn_sqlite = psycopg2.connect(DATABASE_PATH)
        conn_sqlite.autocommit = True
        
        sync_orcamentos(conn_db2, conn_sqlite)
        transform_data(conn_sqlite)
        sync_box_barcodes(conn_db2, conn_sqlite)
        sync_enderecos_wms(conn_db2, conn_sqlite)
        sync_notas_recebimento(conn_db2, conn_sqlite)
        
        duracao = time.time() - inicio
        # log(f"Sync concluído | duração={duracao:.2f}s")
        
        return True
    except Exception as e:
        log(f"ERRO NO PROCESSO DE SYNC: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        try:
            conn_db2.close()
            conn_sqlite.close()
        except:
            pass


def iniciar_servidor():
    """Inicia o servidor web do dashboard."""
    log("Iniciando servidor web...")
    os.chdir(PROJECT_ROOT)
    
    is_windows = sys.platform == "win32"
    
    try:
        subprocess.run("npm --version", shell=True, capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        log("ERRO: npm não encontrado. Instale Node.js primeiro.")
        log("Baixe em: https://nodejs.org/")
        return
    
    log(f"Acesse: http://localhost:411")
    
    # Auto-fix port
    kill_port_411()
    
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Web OK | url=http://localhost:411")
    
    if is_windows:
        # log("Executando servidor (Windows)...")
        env = os.environ.copy()
        env["NODE_ENV"] = "development"
        env["PORT"] = "411"
        try:
            subprocess.run("npx tsx server/index.ts", shell=True, cwd=PROJECT_ROOT, env=env)
        except KeyboardInterrupt:
             log("\nServidor interrompido pelo usuário.")
    else:
        log("Executando: npm run dev")
        env = os.environ.copy()
        env["PORT"] = "411"
        try:
            subprocess.run("npm run dev", shell=True, cwd=PROJECT_ROOT, env=env)
        except KeyboardInterrupt:
            log("\nServidor interrompido pelo usuário.")


def kill_port_411():
    """Mata processo usando a porta 411 (Windows) para evitar EADDRINUSE."""
    if sys.platform == "win32":
        try:
            # Encontrar PID
            result = subprocess.run('netstat -ano | findstr :411', shell=True, capture_output=True, text=True)
            output = result.stdout.strip()
            if output:
                lines = output.split('\n')
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 5:
                        pid = parts[-1] 
                        if pid != '0':
                            log(f"Porta 411 em uso pelo PID {pid}. Matando...")
                            subprocess.run(f'taskkill /F /PID {pid}', shell=True, capture_output=True)
        except Exception as e:
            log(f"Aviso: Não foi possível limpar porta 411: {e}")


def main():
    global QUIET
    parser = argparse.ArgumentParser(
        description="Sincronizador DB2 -> SQLite",
        epilog="""
Exemplos:
  python sync_db2.py --serve          # Sync + Servidor (Loop padrão 5 min)
  python sync_db2.py --loop 600       # Apenas Sync (Loop 10 min)
        """
    )
    parser.add_argument("--desde", type=str, metavar="YYYY-MM-DD",
                        help="Ignorado nesta versão (Janela fixa 31 dias)")
    parser.add_argument("--loop", type=int, metavar="SEGUNDOS",
                        help="Intervalo do loop (padrão 300s = 5min)")
    parser.add_argument("--serve", action="store_true",
                        help="Inicia o servidor web após sync")
    parser.add_argument("--quiet", action="store_true",
                        help="Suprime logs no stdout")
    
    args = parser.parse_args()

    if args.quiet:
        QUIET = True
    
    # 1. Sincronização Inicial (Bloqueante)
    # Ex: [2026-02-08 21:30:13] Sync iniciado | modo=serve | SO=Windows
    modo_str = "serve" if args.serve else ("loop" if args.loop else "once")
    if not QUIET:
        log(f"Sync iniciado | modo={modo_str} | SO={platform.system()}")

    # Garantir que tabelas existam
    # inicializar_sqlite() (Handled via Drizzle)
    
    # Passar args para sincronizar
    sucesso = sincronizar(data_inicial=args.desde)
    
    # 2. Configurar Loop (Thread se Serve, Main se Loop-Only)
    should_loop = args.loop is not None or args.serve
    intervalo = args.loop if args.loop else 300

    if should_loop:
        if args.loop or args.serve:
             if args.loop:
                 log(f"Modo Loop ativado: {intervalo} segundos")
        
        def loop_sync_internal(): 
            while True:
                time.sleep(intervalo)
                sincronizar()
        
        if args.serve:
            # Thread para o loop, Main para o servidor
            t = threading.Thread(target=loop_sync_internal, daemon=True)
            t.start()
        else:
            # Main para o loop
            try:
                loop_sync_internal()
            except KeyboardInterrupt:
                if not args.quiet:
                    log("\nLoop interrompido pelo usuário.")

    # 3. Servidor Web
    if args.serve:
        iniciar_servidor()
        # Apenas Uma Execução
        if not sucesso:
            sys.exit(1)
            
if __name__ == "__main__":
    main()
