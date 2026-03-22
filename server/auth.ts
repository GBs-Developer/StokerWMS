import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { randomUUID, createHash } from "crypto";

const TOKEN_EXPIRY_HOURS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function generateBadgeCode(username: string, passwordPlain: string): string {
  // Return full 32-char MD5 hash. QR Codes can easily handle this length.
  return createHash("md5").update(username + passwordPlain).digest("hex");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return randomUUID();
}

export function generateSessionKey(userId: string): string {
  return `${userId}:${Date.now()}`;
}

export async function createAuthSession(userId: string): Promise<{ token: string; sessionKey: string }> {
  const token = generateToken();
  const sessionKey = generateSessionKey(userId);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await storage.createSession(userId, token, sessionKey, expiresAt);

  return { token, sessionKey };
}

export async function getUserFromToken(token: string) {
  const session = await storage.getSessionByToken(token);
  if (!session) return null;

  const user = await storage.getUser(session.userId);
  if (!user) return null;

  return { user, sessionKey: session.sessionKey };
}

export function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return req.cookies?.authToken || null;
}

export async function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  const result = await getUserFromToken(token);
  if (!result) {
    return res.status(401).json({ error: "Sessão expirada" });
  }

  (req as any).user = result.user;
  (req as any).sessionKey = result.sessionKey;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    next();
  };
}
