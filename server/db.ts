import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@shared/schema";

const dbUrl = process.env.SQLITE_URL || "file:wms.db";

const client = createClient({
    url: dbUrl,
});

export const db = drizzle(client, { schema });

// Enable WAL mode and set busy timeout to handle concurrent access
db.$client.execute("PRAGMA journal_mode = WAL");
db.$client.execute("PRAGMA busy_timeout = 5000"); // 5 seconds timeout

// Auto-migration: ensure all schema columns exist (safe to run multiple times)
async function runMigrations() {
    const migrations = [
        "ALTER TABLE orders ADD COLUMN separated_at TEXT",
        "ALTER TABLE products ADD COLUMN box_barcodes TEXT",
        "ALTER TABLE users ADD COLUMN badge_code TEXT",
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
    ];

    for (const sql of migrations) {
        try {
            await db.$client.execute(sql);
        } catch {
            // Column already exists - safe to ignore
        }
    }
}

runMigrations().catch(console.error);
