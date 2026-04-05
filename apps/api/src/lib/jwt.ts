import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";

const JWT_SECRET = process.env.JWT_SECRET || "fairgo-dev-secret-key-change-in-production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "fairgo-dev-refresh-secret-change-in-production";

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
