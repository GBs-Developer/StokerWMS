import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@shared/schema";

const dbUrl = process.env.SQLITE_URL || "file:wms.db";

const client = createClient({
    url: dbUrl,
});

export const db = drizzle(client, { schema });

db.$client.execute("PRAGMA journal_mode = WAL");
db.$client.execute("PRAGMA busy_timeout = 5000");

async function runMigrations() {
    const alterMigrations = [
        "ALTER TABLE orders ADD COLUMN separated_at TEXT",
        "ALTER TABLE products ADD COLUMN box_barcodes TEXT",
        "ALTER TABLE users ADD COLUMN badge_code TEXT",
        "ALTER TABLE users ADD COLUMN default_company_id INTEGER",
        "ALTER TABLE users ADD COLUMN allowed_companies TEXT DEFAULT '[1,3]'",
        "ALTER TABLE orders ADD COLUMN company_id INTEGER",
        "ALTER TABLE work_units ADD COLUMN company_id INTEGER",
        "ALTER TABLE sessions ADD COLUMN company_id INTEGER",
        "ALTER TABLE audit_logs ADD COLUMN company_id INTEGER",
    ];

    for (const sql of alterMigrations) {
        try {
            await db.$client.execute(sql);
        } catch {
        }
    }

    const createTableMigrations = [
        `CREATE TABLE IF NOT EXISTS order_volumes (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(id),
            erp_order_id TEXT NOT NULL,
            sacola INTEGER NOT NULL DEFAULT 0,
            caixa INTEGER NOT NULL DEFAULT 0,
            saco INTEGER NOT NULL DEFAULT 0,
            avulso INTEGER NOT NULL DEFAULT 0,
            total_volumes INTEGER NOT NULL DEFAULT 0,
            created_by TEXT REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS product_company_stock (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL REFERENCES products(id),
            company_id INTEGER NOT NULL,
            stock_qty REAL NOT NULL DEFAULT 0,
            erp_updated_at TEXT
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_product_company_stock_unique ON product_company_stock(product_id, company_id)`,
        `CREATE TABLE IF NOT EXISTS wms_addresses (
            id TEXT PRIMARY KEY,
            company_id INTEGER NOT NULL,
            bairro TEXT NOT NULL,
            rua TEXT NOT NULL,
            bloco TEXT NOT NULL,
            nivel TEXT NOT NULL,
            code TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'standard',
            active INTEGER NOT NULL DEFAULT 1,
            created_by TEXT REFERENCES users(id),
            created_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_wms_addresses_company_code ON wms_addresses(company_id, code)`,
        `CREATE TABLE IF NOT EXISTS pallets (
            id TEXT PRIMARY KEY,
            company_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'sem_endereco',
            address_id TEXT REFERENCES wms_addresses(id),
            created_by TEXT REFERENCES users(id),
            created_at TEXT NOT NULL,
            allocated_at TEXT,
            cancelled_at TEXT,
            cancelled_by TEXT REFERENCES users(id),
            cancel_reason TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_pallets_company_status ON pallets(company_id, status)`,
        `CREATE TABLE IF NOT EXISTS pallet_items (
            id TEXT PRIMARY KEY,
            pallet_id TEXT NOT NULL REFERENCES pallets(id),
            product_id TEXT NOT NULL REFERENCES products(id),
            erp_nf_id TEXT,
            quantity REAL NOT NULL,
            lot TEXT,
            expiry_date TEXT,
            fefo_enabled INTEGER NOT NULL DEFAULT 0,
            company_id INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_pallet_items_pallet ON pallet_items(pallet_id)`,
        `CREATE TABLE IF NOT EXISTS pallet_movements (
            id TEXT PRIMARY KEY,
            pallet_id TEXT NOT NULL REFERENCES pallets(id),
            company_id INTEGER NOT NULL,
            movement_type TEXT NOT NULL,
            from_address_id TEXT REFERENCES wms_addresses(id),
            to_address_id TEXT REFERENCES wms_addresses(id),
            from_pallet_id TEXT,
            user_id TEXT REFERENCES users(id),
            notes TEXT,
            created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS nf_cache (
            id TEXT PRIMARY KEY,
            company_id INTEGER NOT NULL,
            nf_number TEXT NOT NULL,
            nf_series TEXT,
            supplier_name TEXT,
            supplier_cnpj TEXT,
            issue_date TEXT,
            total_value REAL,
            status TEXT NOT NULL DEFAULT 'pendente',
            synced_at TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_nf_cache_company_nf ON nf_cache(company_id, nf_number)`,
        `CREATE TABLE IF NOT EXISTS nf_items (
            id TEXT PRIMARY KEY,
            nf_id TEXT NOT NULL REFERENCES nf_cache(id),
            product_id TEXT,
            erp_code TEXT,
            product_name TEXT,
            quantity REAL NOT NULL,
            unit TEXT,
            lot TEXT,
            expiry_date TEXT,
            company_id INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS counting_cycles (
            id TEXT PRIMARY KEY,
            company_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pendente',
            created_by TEXT REFERENCES users(id),
            approved_by TEXT REFERENCES users(id),
            approved_at TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_counting_cycles_company_status ON counting_cycles(company_id, status)`,
        `CREATE TABLE IF NOT EXISTS counting_cycle_items (
            id TEXT PRIMARY KEY,
            cycle_id TEXT NOT NULL REFERENCES counting_cycles(id),
            company_id INTEGER NOT NULL,
            address_id TEXT REFERENCES wms_addresses(id),
            product_id TEXT REFERENCES products(id),
            pallet_id TEXT REFERENCES pallets(id),
            expected_qty REAL,
            counted_qty REAL,
            lot TEXT,
            expiry_date TEXT,
            old_lot TEXT,
            old_expiry_date TEXT,
            status TEXT NOT NULL DEFAULT 'pendente',
            counted_by TEXT REFERENCES users(id),
            counted_at TEXT,
            divergence_pct REAL,
            created_at TEXT NOT NULL
        )`,
    ];

    for (const sql of createTableMigrations) {
        try {
            await db.$client.execute(sql);
        } catch (e: any) {
            if (!e.message?.includes("already exists")) {
                console.error("Migration error:", e.message);
            }
        }
    }
}

runMigrations().catch(console.error);
