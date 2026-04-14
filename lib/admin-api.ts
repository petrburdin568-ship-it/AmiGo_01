"use client";

import type { Session } from "@supabase/supabase-js";
import type { TitleTone } from "@/lib/types";

const ADMIN_SESSION_STORAGE_KEY = "amigo-admin-session-token";
const ADMIN_SESSION_HEADER = "x-amigo-admin-session";

type JsonHeaders = Record<string, string>;

function getConfiguredAdminOrigin() {
  const value = process.env.NEXT_PUBLIC_ADMIN_API_ORIGIN?.trim();
  return value ? value.replace(/\/$/, "") : "";
}

function getAdminApiUrl(path: string) {
  const origin = getConfiguredAdminOrigin();
  const basePath = `/api/admin/${path}`;
  return origin ? `${origin}${basePath}` : basePath;
}

function getStoredAdminSessionToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
}

function setStoredAdminSessionToken(token: string | null | undefined) {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}

function createAdminHeaders(session: Session | null, includeJsonContentType = false): JsonHeaders {
  const headers: JsonHeaders = {};

  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const adminSessionToken = getStoredAdminSessionToken();
  if (adminSessionToken) {
    headers[ADMIN_SESSION_HEADER] = adminSessionToken;
  }

  return headers;
}

export async function fetchAdminAccess(session: Session | null) {
  if (!session?.access_token) {
    return false;
  }

  try {
    const response = await fetch(getAdminApiUrl("status"), {
      headers: createAdminHeaders(session)
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { unlocked?: boolean };
    return payload.unlocked === true;
  } catch {
    return false;
  }
}

export async function unlockAdminAccess(params: { keys: string[]; session: Session | null }) {
  const response = await fetch(getAdminApiUrl("unlock"), {
    method: "POST",
    headers: createAdminHeaders(params.session, true),
    body: JSON.stringify({
      keys: params.keys
    })
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    message?: string;
    adminSessionToken?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Не удалось подтвердить админский доступ.");
  }

  if (payload.adminSessionToken) {
    setStoredAdminSessionToken(payload.adminSessionToken);
  }

  return payload;
}

export async function grantAdminTitle(params: {
  amigoId: string;
  titleText: string;
  reason: string;
  tone: TitleTone;
  session: Session | null;
}) {
  const response = await fetch(getAdminApiUrl("grant-title"), {
    method: "POST",
    headers: createAdminHeaders(params.session, true),
    body: JSON.stringify({
      amigoId: params.amigoId,
      titleText: params.titleText,
      reason: params.reason,
      tone: params.tone
    })
  });

  const payload = (await response.json()) as { ok?: boolean; message?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Не удалось выдать титул.");
  }

  return payload;
}

export function clearStoredAdminAccess() {
  setStoredAdminSessionToken(null);
}
