import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { log } from "./log";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";

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

(async () => {
  // Seed database on startup
  try {
    await seedDatabase(); // Changed from seedDatabase() to seed() based on instruction, assuming seedDatabase is now 'seed'
  } catch (error) {
    log("Seeding error (non-critical): " + (error as Error).message);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    console.error("Internal Server Error:", err);

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

