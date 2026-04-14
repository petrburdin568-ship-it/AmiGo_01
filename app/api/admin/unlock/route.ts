import { createHash, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { handleAdminOptions, withAdminCors } from "@/lib/admin-api-server";
import { createAdminSessionToken, getAdminCookieName } from "@/lib/admin-session";

const attempts = new Map<string, { count: number; expiresAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function fingerprint(values: string[]) {
  return createHash("sha256").update(values.join("|")).digest("hex");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function resolveSessionUserId(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

export function OPTIONS(request: Request) {
  return handleAdminOptions(request);
}

export async function POST(request: Request) {
  const headerStore = headers();
  const ipHeader = headerStore.get("x-forwarded-for") ?? headerStore.get("x-real-ip") ?? "local";
  const ip = ipHeader.split(",")[0]?.trim() || "local";
  const userAgent = headerStore.get("user-agent") ?? "unknown";
  const attemptKey = fingerprint([ip, userAgent]);
  const now = Date.now();
  const currentAttempt = attempts.get(attemptKey);

  if (currentAttempt && currentAttempt.expiresAt > now && currentAttempt.count >= MAX_ATTEMPTS) {
    return withAdminCors(
      request,
      NextResponse.json(
        { ok: false, message: "Слишком много попыток. Подожди 10 минут и попробуй снова." },
        { status: 429 }
      )
    );
  }

  const userId = await resolveSessionUserId(request);
  if (!userId) {
    return withAdminCors(
      request,
      NextResponse.json(
        { ok: false, message: "Сначала войди в профильный аккаунт, затем открывай админ-доступ." },
        { status: 401 }
      )
    );
  }

  const body = (await request.json()) as { keys?: string[] };
  const submittedKeys = body.keys?.map((item) => item.trim()).filter(Boolean) ?? [];

  if (submittedKeys.length !== 3) {
    return withAdminCors(
      request,
      NextResponse.json({ ok: false, message: "Нужно ввести все три ключа." }, { status: 400 })
    );
  }

  const envKeys = [
    process.env.AMIGO_ADMIN_KEY_1,
    process.env.AMIGO_ADMIN_KEY_2,
    process.env.AMIGO_ADMIN_KEY_3
  ];

  if (envKeys.some((item) => !item)) {
    return withAdminCors(
      request,
      NextResponse.json(
        { ok: false, message: "Серверные ключи администратора не настроены." },
        { status: 500 }
      )
    );
  }

  const incomingFingerprint = fingerprint(submittedKeys);
  const expectedFingerprint = fingerprint(envKeys as string[]);
  const valid = safeCompare(incomingFingerprint, expectedFingerprint);

  if (!valid) {
    attempts.set(attemptKey, {
      count: currentAttempt && currentAttempt.expiresAt > now ? currentAttempt.count + 1 : 1,
      expiresAt: now + WINDOW_MS
    });

    return withAdminCors(
      request,
      NextResponse.json({ ok: false, message: "Ключи неверны." }, { status: 401 })
    );
  }

  attempts.delete(attemptKey);

  const adminSessionToken = createAdminSessionToken(userId);

  cookies().set({
    name: getAdminCookieName(),
    value: adminSessionToken,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  return withAdminCors(request, NextResponse.json({ ok: true, adminSessionToken }));
}
