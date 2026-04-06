/**
 * middleware.ts — Next.js edge middleware
 *
 * Responsibilities:
 *  1. CORS: validate Origin against allowlist; reflect only when allowed
 *  2. Security headers: applied to every API response
 *  3. Wildcard CORS guard: reject CUSTOMER_APP_URL=* in production
 */
import { NextRequest, NextResponse } from "next/server";

// ── Security headers added to every API response ──────────────────────────
// Content-Security-Policy is intentionally omitted for the API server;
// add it to the client apps via their own build config.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options":          "nosniff",
  "X-Frame-Options":                 "DENY",
  "X-XSS-Protection":                "1; mode=block",
  "Referrer-Policy":                 "strict-origin-when-cross-origin",
  "Permissions-Policy":              "camera=(), microphone=(), geolocation=(self)",
  "Strict-Transport-Security":       "max-age=31536000; includeSubDomains",
};

// ── Origin allowlist ───────────────────────────────────────────────────────
const PROD_ORIGINS: string[] = [];

function isLocalhostOrigin(origin: string): boolean {
  return (
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  );
}

function getAllowedOrigins(): string[] {
  const origins = [...PROD_ORIGINS];
  if (process.env.ADMIN_WEB_URL) {
    origins.push(process.env.ADMIN_WEB_URL.replace(/\/$/, ""));
  }
  if (
    process.env.CUSTOMER_APP_URL &&
    process.env.CUSTOMER_APP_URL !== "*"
  ) {
    origins.push(process.env.CUSTOMER_APP_URL.replace(/\/$/, ""));
  }
  if (
    process.env.DRIVER_APP_URL &&
    process.env.DRIVER_APP_URL !== "*"
  ) {
    origins.push(process.env.DRIVER_APP_URL.replace(/\/$/, ""));
  }
  return origins;
}

// Warn once at startup if wildcard CORS is enabled in production
if (
  process.env.NODE_ENV === "production" &&
  process.env.CUSTOMER_APP_URL === "*"
) {
  console.error(
    "[SECURITY] CRITICAL: CUSTOMER_APP_URL=* is not allowed in production. " +
    "Set CUSTOMER_APP_URL to the actual origin of the customer app. " +
    "Wildcard CORS is disabled in production."
  );
}

function applySecurityHeaders(response: NextResponse): void {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") || "";

  // In production, never honour CUSTOMER_APP_URL=*
  const isProduction = process.env.NODE_ENV === "production";
  const wildcardAllowed =
    !isProduction && process.env.CUSTOMER_APP_URL === "*";

  // Allow localhost in dev unless we are explicitly in production mode
  const allowLocalhost =
    !isProduction || process.env.ALLOW_LOCALHOST_CORS === "true";

  const isAllowed =
    getAllowedOrigins().includes(origin) ||
    !origin ||
    wildcardAllowed ||
    (allowLocalhost && isLocalhostOrigin(origin));

  // ── Preflight OPTIONS ────────────────────────────────────────────────────
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowed) {
      response.headers.set("Access-Control-Allow-Origin", origin || "*");
    }
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    response.headers.set("Access-Control-Max-Age", "86400");
    applySecurityHeaders(response);
    return response;
  }

  // ── Regular requests ─────────────────────────────────────────────────────
  const response = NextResponse.next();
  if (isAllowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
