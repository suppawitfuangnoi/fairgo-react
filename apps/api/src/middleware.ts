import { NextRequest, NextResponse } from "next/server";

const PROD_ORIGINS: string[] = [];

// Allow any localhost origin in development (flutter web uses random ports)
function isLocalhostOrigin(origin: string): boolean {
  return /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
}

function getAllowedOrigins(): string[] {
  const origins = [...PROD_ORIGINS];
  if (process.env.ADMIN_WEB_URL) {
    origins.push(process.env.ADMIN_WEB_URL.replace(/\/$/, ""));
  }
  if (process.env.CUSTOMER_APP_URL && process.env.CUSTOMER_APP_URL !== "*") {
    origins.push(process.env.CUSTOMER_APP_URL.replace(/\/$/, ""));
  }
  return origins;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  // Allow localhost in dev: NODE_ENV=development OR explicit ALLOW_LOCALHOST_CORS=true
  const allowLocalhost =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_LOCALHOST_CORS === "true";
  const isAllowed =
    getAllowedOrigins().includes(origin) ||
    !origin ||
    process.env.CUSTOMER_APP_URL === "*" ||
    (allowLocalhost && isLocalhostOrigin(origin));

  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowed) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  // Add CORS headers to all responses
  const response = NextResponse.next();
  if (isAllowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
