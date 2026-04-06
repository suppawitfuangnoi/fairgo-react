import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";

const DEFAULT_ACCESS_SECRET  = "fairgo-dev-secret-key-change-in-production";
const DEFAULT_REFRESH_SECRET = "fairgo-dev-refresh-secret-change-in-production";

const JWT_SECRET         = process.env.JWT_SECRET         || DEFAULT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || DEFAULT_REFRESH_SECRET;

// ── Production safety check ────────────────────────────────────────────────
// Warn loudly if the server is running in production with default dev secrets.
// An attacker who knows the default secret can forge arbitrary JWTs.
if (process.env.NODE_ENV === "production") {
  if (JWT_SECRET === DEFAULT_ACCESS_SECRET) {
    console.error(
      "[SECURITY] CRITICAL: JWT_SECRET is not set (using insecure default). " +
      "Set JWT_SECRET to a random 64+ character string in your environment."
    );
  }
  if (JWT_REFRESH_SECRET === DEFAULT_REFRESH_SECRET) {
    console.error(
      "[SECURITY] CRITICAL: JWT_REFRESH_SECRET is not set (using insecure default). " +
      "Set JWT_REFRESH_SECRET to a random 64+ character string in your environment."
    );
  }
}

export interface JwtPayload {
  userId: string;
  role: string;
  type: "access" | "refresh";
}

export function generateAccessToken(userId: string, role: string): string {
  return jwt.sign(
    { userId, role, type: "access" } satisfies JwtPayload,
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}

export function generateRefreshToken(userId: string, role: string): string {
  return jwt.sign(
    { userId, role, type: "refresh" } satisfies JwtPayload,
    JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
}

export function generateRefreshTokenId(): string {
  return nanoid(64);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
}
