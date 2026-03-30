import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "amigo-admin-session";
const ADMIN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getAdminSecret() {
  const parts = [
    process.env.AMIGO_ADMIN_KEY_1,
    process.env.AMIGO_ADMIN_KEY_2,
    process.env.AMIGO_ADMIN_KEY_3
  ];

  if (parts.some((item) => !item)) {
    throw new Error("Admin keys are not configured on the server.");
  }

  return parts.join("::");
}

function signPayload(payload: string) {
  return createHmac("sha256", getAdminSecret()).update(payload).digest("hex");
}

export function getAdminCookieName() {
  return COOKIE_NAME;
}

export function createAdminSessionToken(userId: string) {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const signature = signPayload(payload);
  return Buffer.from(`${payload}.${signature}`, "utf8").toString("base64url");
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [userId, issuedAt, signature] = raw.split(".");

    if (!userId || !issuedAt || !signature) {
      return null;
    }

    const expected = signPayload(`${userId}.${issuedAt}`);
    const left = Buffer.from(signature, "utf8");
    const right = Buffer.from(expected, "utf8");

    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return null;
    }

    const issuedAtNumber = Number(issuedAt);
    if (!Number.isFinite(issuedAtNumber) || Date.now() - issuedAtNumber > ADMIN_SESSION_MAX_AGE_MS) {
      return null;
    }

    return {
      userId,
      issuedAt: issuedAtNumber
    };
  } catch {
    return null;
  }
}
