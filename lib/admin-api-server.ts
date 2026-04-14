import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-session";

const ADMIN_SESSION_HEADER = "x-amigo-admin-session";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

function getAllowedOrigins() {
  const configuredOrigins =
    process.env.AMIGO_ADMIN_ALLOWED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  return new Set(
    [
      "http://localhost",
      "https://localhost",
      "capacitor://localhost",
      ...configuredOrigins
    ].map(normalizeOrigin)
  );
}

function resolveRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin ? normalizeOrigin(origin) : null;
}

function isAllowedOrigin(origin: string | null) {
  return Boolean(origin && getAllowedOrigins().has(origin));
}

export function getAdminSessionHeaderName() {
  return ADMIN_SESSION_HEADER;
}

export function resolveAdminSession(request: Request) {
  const headerToken = request.headers.get(ADMIN_SESSION_HEADER);
  const cookieToken = cookies().get(getAdminCookieName())?.value;

  return verifyAdminSessionToken(headerToken ?? cookieToken);
}

export function withAdminCors(request: Request, response: NextResponse) {
  const origin = resolveRequestOrigin(request);

  if (isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin as string);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Amigo-Admin-Session"
    );
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export function handleAdminOptions(request: Request) {
  return withAdminCors(request, new NextResponse(null, { status: 204 }));
}
