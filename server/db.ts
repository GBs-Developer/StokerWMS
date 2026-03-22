import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@shared/schema";

const client = createClient({
    url: process.env.DATABASE_URL || "file:database.db",
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
