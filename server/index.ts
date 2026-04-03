import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { log } from "./log";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { setupPrintAgentWS } from "./print-agent";
import { setupScanningWS } from "./ws-scanning";

// ── Guardas globais contra crashes ────────────────────────────────────────────
// Impede que erros em subsistemas (ex: agente de impressão WebSocket)
// derrubem o processo principal do servidor.
process.on("uncaughtException", (err) => {
  log(`[server] Exceção não capturada (não-fatal): ${err.message}\n${err.stack ?? ""}`, "express");
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log(`[server] Promise rejeitada não tratada (não-fatal): ${msg}`, "express");
});

const app = express();
const httpServer = createServer(app);

app.set('trust proxy', 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "2mb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Limite de requisições excedido. Tente novamente em breve." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/badge-login", loginLimiter);
app.use("/api/sql-query", rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: "Limite de consultas SQL excedido." } }));
app.use("/api/", apiLimiter);



app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // Special handling for auth routes
      if (path === "/api/auth/login" && res.statusCode === 200 && capturedJsonResponse?.user) {
        const username = capturedJsonResponse.user.username || capturedJsonResponse.user.name || "User";
        logLine = `${username} is log in`;
        // log(logLine);
      } else if (path === "/api/auth/logout" && (req as any).user) {
        const username = (req as any).user.username || (req as any).user.name || "User";
        logLine = `${username} is log out`;
        // log(logLine);
      } else {
        // Filter out non-critical errors (4xx) and GET/OPTIONS
        // Only log:
        // 1. Critical Errors (>= 500)
        // 2. Successful Mutations (POST, PUT, PATCH, DELETE with status < 400)
        const isCriticalError = res.statusCode >= 500;
        // Não logar mutations de sucesso (POST/PUT/DELETE com sucesso)
        const isSuccessMutation = false; // Desabilitado completamente conforme solicitado pelo usuário

        if (isCriticalError || isSuccessMutation) {
          if (isCriticalError && capturedJsonResponse) {
            logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
          }
          log(logLine);
        }
      }
    }
  });

  next();
});

/** Garante que colunas novas do schema existam no banco sem quebrar dados existentes. */
async function runSafeMigrations() {
  const migrations: { table: string; column: string; type: string }[] = [
    // users
    { table: "users", column: "allowed_reports",   type: "jsonb" },
    { table: "users", column: "allowed_modules",   type: "jsonb" },
    { table: "users", column: "allowed_companies", type: "jsonb" },
    { table: "users", column: "default_company_id",type: "integer" },
    { table: "users", column: "badge_code",        type: "text" },
    { table: "users", column: "settings",          type: "jsonb" },
    // pallets — colunas adicionadas em versões recentes
    { table: "pallets", column: "allocated_at",   type: "text" },
    { table: "pallets", column: "cancelled_at",   type: "text" },
    { table: "pallets", column: "cancelled_by",   type: "text" },
    { table: "pallets", column: "cancel_reason",  type: "text" },
    { table: "pallets", column: "notes",          type: "text" },
    { table: "pallets", column: "work_unit_id",   type: "text" },
    { table: "pallets", column: "nf_id",          type: "text" },
    // pallet_items
    { table: "pallet_items", column: "erp_nf_id",    type: "text" },
    { table: "pallet_items", column: "expiry_date",   type: "text" },
    { table: "pallet_items", column: "fefo_enabled",  type: "boolean DEFAULT false" },
    { table: "pallet_items", column: "company_id",    type: "integer" },
    { table: "pallet_items", column: "unit",          type: "text" },
    { table: "pallet_items", column: "nf_item_id",    type: "text" },
    { table: "pallet_items", column: "nf_id",         type: "text" },
    // pallet_movements
    { table: "pallet_movements", column: "from_pallet_id", type: "text" },
    { table: "pallet_movements", column: "company_id",     type: "integer" },
    { table: "pallet_movements", column: "movement_type",  type: "text" },
    // counting_cycles
    { table: "counting_cycles", column: "name",        type: "text" },
    { table: "counting_cycles", column: "approved_by", type: "text" },
    { table: "counting_cycles", column: "approved_at", type: "text" },
    { table: "counting_cycles", column: "notes",       type: "text" },
    { table: "counting_cycles", column: "completed_at",type: "text" },
    // counting_cycle_items
    { table: "counting_cycle_items", column: "old_lot",         type: "text" },
    { table: "counting_cycle_items", column: "old_expiry_date", type: "text" },
    { table: "counting_cycle_items", column: "divergence_pct",  type: "double precision" },
    { table: "counting_cycle_items", column: "notes",           type: "text" },
    // nf_cache — novos nomes de colunas (versão antiga usava numero/serie/emitente)
    { table: "nf_cache", column: "nf_number",     type: "text" },
    { table: "nf_cache", column: "nf_series",     type: "text" },
    { table: "nf_cache", column: "supplier_name", type: "text" },
    { table: "nf_cache", column: "supplier_cnpj", type: "text" },
    { table: "nf_cache", column: "issue_date",    type: "text" },
    { table: "nf_cache", column: "total_value",   type: "double precision" },
    { table: "nf_cache", column: "synced_at",     type: "text" },
    { table: "nf_cache", column: "received_by",   type: "text" },
    { table: "nf_cache", column: "received_at",   type: "text" },
    { table: "nf_cache", column: "notes",         type: "text" },
    // nf_items
    { table: "nf_items", column: "company_id",   type: "integer" },
    { table: "nf_items", column: "expiry_date",  type: "text" },
    { table: "nf_items", column: "unit_cost",    type: "double precision" },
    { table: "nf_items", column: "total_cost",   type: "double precision" },
    { table: "nf_items", column: "barcode",      type: "text" },
    // products
    { table: "products", column: "box_barcodes",    type: "jsonb" },
    { table: "products", column: "box_barcode",     type: "text" },
    // orders
    { table: "orders", column: "observation2",    type: "text" },
    { table: "orders", column: "pickup_points",   type: "jsonb" },
    { table: "orders", column: "separation_code", type: "text" },
    { table: "orders", column: "load_code",       type: "text" },
    // section_groups
    { table: "section_groups", column: "updated_at", type: "text" },
    // product_company_stock
    { table: "product_company_stock", column: "palletized_stock", type: "double precision" },
    { table: "product_company_stock", column: "picking_stock",    type: "double precision" },
    { table: "product_company_stock", column: "unit",             type: "text" },
    // db2_mappings
    { table: "db2_mappings", column: "extra", type: "jsonb" },
    // wms_addresses
    { table: "wms_addresses", column: "capacity",     type: "integer" },
    { table: "wms_addresses", column: "description",  type: "text" },
    // print_agents — coluna adicionada para persistir lista de impressoras entre reinicializações
    { table: "print_agents", column: "printers", type: "text" },
    // orders — suporte multi-empresa e status financeiro
    { table: "orders", column: "financial_status", type: "text DEFAULT 'pendente'" },
    { table: "orders", column: "company_id",       type: "integer" },
    // work_units — suporte multi-empresa
    { table: "work_units", column: "company_id", type: "integer" },
    // exceptions — campos de autorização adicionados como feature
    { table: "exceptions", column: "authorized_by",      type: "text" },
    { table: "exceptions", column: "authorized_by_name", type: "text" },
    { table: "exceptions", column: "authorized_at",      type: "text" },
    // sessions — suporte multi-empresa
    { table: "sessions", column: "company_id", type: "integer" },
    // companies — CNPJ
    { table: "companies", column: "cnpj", type: "text" },
    // pickup_points — flag de ativo/inativo
    { table: "pickup_points", column: "active", type: "boolean DEFAULT true" },
  ];

  for (const m of migrations) {
    try {
      await db.execute(
        sql.raw(`ALTER TABLE ${m.table} ADD COLUMN IF NOT EXISTS "${m.column}" ${m.type}`)
      );
    } catch {
      // coluna já existe ou tipo incompatível — ignorar
    }
  }

  // Tabelas que podem não existir em bancos mais antigos
  const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS print_agents (
      id text PRIMARY KEY,
      company_id integer NOT NULL,
      name text NOT NULL,
      machine_id text NOT NULL DEFAULT '',
      token_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at text NOT NULL DEFAULT '',
      last_seen_at text,
      printers text
    )`,
    `CREATE TABLE IF NOT EXISTS product_addresses (
      id text PRIMARY KEY,
      product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      company_id integer NOT NULL,
      address_id text NOT NULL REFERENCES wms_addresses(id) ON DELETE CASCADE,
      created_at text NOT NULL DEFAULT ''
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS product_addresses_unique_idx
      ON product_addresses (product_id, company_id, address_id)`,
    `CREATE INDEX IF NOT EXISTS idx_product_addresses_product_company
      ON product_addresses (product_id, company_id)`,

    `CREATE TABLE IF NOT EXISTS address_picking_log (
      id text PRIMARY KEY,
      company_id integer NOT NULL,
      address_id text NOT NULL REFERENCES wms_addresses(id),
      address_code text NOT NULL,
      product_id text NOT NULL REFERENCES products(id),
      product_name text,
      erp_code text,
      quantity integer NOT NULL,
      order_id text,
      erp_order_id text,
      work_unit_id text,
      user_id text NOT NULL,
      user_name text,
      created_at text NOT NULL DEFAULT '',
      notes text
    )`,
    // Tabelas de features adicionadas após o deploy inicial
    `CREATE TABLE IF NOT EXISTS order_volumes (
      id text PRIMARY KEY,
      order_id text NOT NULL,
      erp_order_id text NOT NULL,
      sacola integer NOT NULL DEFAULT 0,
      caixa integer NOT NULL DEFAULT 0,
      saco integer NOT NULL DEFAULT 0,
      avulso integer NOT NULL DEFAULT 0,
      total_volumes integer NOT NULL DEFAULT 0,
      created_by text,
      created_at text NOT NULL DEFAULT '',
      updated_at text NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS system_settings (
      id text PRIMARY KEY DEFAULT 'global',
      separation_mode text NOT NULL DEFAULT 'by_order',
      updated_at text NOT NULL DEFAULT '',
      updated_by text
    )`,
    `CREATE TABLE IF NOT EXISTS manual_qty_rules (
      id text PRIMARY KEY,
      rule_type text NOT NULL,
      value text NOT NULL,
      description text,
      active boolean NOT NULL DEFAULT true,
      created_by text,
      created_at text NOT NULL DEFAULT ''
    )`,
  ];

  for (const ddl of tables) {
    try {
      await db.execute(sql.raw(ddl));
    } catch {
      // tabela/índice já existe — ignorar
    }
  }
}

(async () => {
  // Migrações seguras antes do seed
  await runSafeMigrations();

  // Seed database on startup
  try {
    await seedDatabase();
  } catch (error) {
    log("Seeding error (non-critical): " + (error as Error).message);
  }

  await registerRoutes(httpServer, app);

  try {
    setupPrintAgentWS(httpServer);
  } catch (e: any) {
    log(`[agent] Falha ao iniciar WebSocket (não crítico): ${e.message}`, "print");
  }

  try {
    setupScanningWS(httpServer);
  } catch (e: any) {
    log(`[scanning-ws] Falha ao iniciar WebSocket (não crítico): ${e.message}`, "express");
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    log(`Internal Server Error: ${err?.message ?? err}`, "error");

    if (res.headersSent) {
      return next(err);
    }

    const message = status >= 500 ? "Erro interno do servidor" : (err.message || "Erro desconhecido");
    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  if (process.env.NODE_ENV !== "test") {
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
      },
      () => {
        log(`Servidor iniciado na porta ${port}`);
      },
    );
  }
})();

export { app, httpServer };

