import type { Capability, TitleCategory, TitleTone, UserAccessProfile, UserProfile, UserTitle } from "@/lib/types";
import { isPermanentAdminUserId } from "@/lib/admin-access";

export const REGISTRATION_TITLE_ID = "registration-legionnaire";
export const ALPHA_TEST_TITLE_ID = "alpha-pretorian";
export const ADMIN_TITLE_ID = "admin-custom";

export const TITLE_CATEGORY_LABELS: Record<TitleCategory, string> = {
  system: "Системный титул",
  admin: "Титул от администратора"
};

export function makeRegistrationTitle(): UserTitle {
  return {
    id: REGISTRATION_TITLE_ID,
    text: "Легионер",
    category: "system",
    icon: "LEG",
    tone: "silver",
    locked: true,
    grantedBy: null,
    description: "Выдаётся автоматически за регистрацию в AmiGo.",
    acquiredAt: new Date().toISOString()
  };
}

export function makeAlphaTestTitle(): UserTitle {
  return {
    id: ALPHA_TEST_TITLE_ID,
    text: "Преторианец",
    category: "system",
    icon: "PRT",
    tone: "gold",
    locked: true,
    grantedBy: null,
    description: "Выдаётся за участие в раннем альфа-тесте проекта.",
    acquiredAt: new Date().toISOString()
  };
}

export function makeAdminTitle(
  text: string,
  icon = "ADM",
  tone: TitleTone = "gold",
  grantedBy: string | null = null,
  description: string | null = null
): UserTitle {
  return {
    id: ADMIN_TITLE_ID,
    text: text.trim(),
    category: "admin",
    icon: icon.trim().toUpperCase() || "ADM",
    tone,
    locked: true,
    grantedBy,
    description: description?.trim() || "Выдан администратором вручную.",
    acquiredAt: new Date().toISOString()
  };
}

export function getDefaultTitles() {
  return [makeRegistrationTitle()];
}

export function resolveTitleToneClass(tone: TitleTone) {
  return `title-badge-${tone}`;
}

export function isEmperorProfile(profile: UserProfile | null, sessionUserId?: string | null) {
  void profile;
  return isPermanentAdminUserId(sessionUserId);
}

function isValidCategory(value: unknown): value is TitleCategory {
  return value === "system" || value === "admin";
}

function isValidTone(value: unknown): value is TitleTone {
  return value === "silver" || value === "gold" || value === "cyan" || value === "royal";
}

export function normalizeTitles(rawTitles: unknown): UserTitle[] {
  const fallback = getDefaultTitles();
  if (!Array.isArray(rawTitles)) {
    return fallback;
  }

  const normalized = rawTitles
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Partial<UserTitle>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
      const icon = typeof candidate.icon === "string" ? candidate.icon.trim().toUpperCase() : "";

      if (!id || !text) {
        return null;
      }

      return {
        id,
        text,
        category: isValidCategory(candidate.category) ? candidate.category : "system",
        icon: icon || "TAG",
        tone: isValidTone(candidate.tone) ? candidate.tone : "silver",
        locked: candidate.locked !== false,
        grantedBy: typeof candidate.grantedBy === "string" ? candidate.grantedBy : null,
        description: typeof candidate.description === "string" ? candidate.description.trim() : null,
        acquiredAt: typeof candidate.acquiredAt === "string" ? candidate.acquiredAt : null
      } satisfies UserTitle;
    })
    .filter((item): item is UserTitle => item !== null);

  const withFallback = normalized.some((title) => title.id === REGISTRATION_TITLE_ID)
    ? normalized
    : [makeRegistrationTitle(), ...normalized];

  const unique = new Map<string, UserTitle>();
  for (const title of withFallback) {
    unique.set(title.id, title);
  }

  return Array.from(unique.values());
}

export function resolveActiveTitle(
  titles: UserTitle[],
  activeTitleId: string | null | undefined
): UserTitle {
  return titles.find((title) => title.id === activeTitleId) ?? titles[0] ?? makeRegistrationTitle();
}

export function formatTitleDate(value: string | null) {
  if (!value) {
    return "Дата не указана";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function getTitleWidgetMeta(title: UserTitle) {
  return {
    toneClass: resolveTitleToneClass(title.tone),
    categoryLabel: TITLE_CATEGORY_LABELS[title.category],
    description: title.description ?? "Подробности по титулу пока не указаны.",
    acquiredAtLabel: formatTitleDate(title.acquiredAt)
  };
}

export function resolveAccessProfile(
  profile: UserProfile | null,
  sessionUserId?: string | null
): UserAccessProfile {
  const emperor = isEmperorProfile(profile, sessionUserId);
  const capabilities = [...new Set(profile?.capabilityFlags ?? [])] as Capability[];
  const isAdmin = emperor || capabilities.includes("title_grantor") || capabilities.includes("ban_hammer");
  const hasInfiniteWealth = emperor || capabilities.includes("infinite_wealth");

  return {
    isAdmin,
    isSuperAdmin: emperor,
    immuneToRestrictions: emperor,
    capabilities,
    canGrantCustomTitles: emperor || capabilities.includes("title_grantor"),
    canTerminateSession: emperor || capabilities.includes("ban_hammer"),
    hasInfiniteWealth,
    resolvedCoinBalance: hasInfiniteWealth ? Number.POSITIVE_INFINITY : profile?.coinBalance ?? 0
  };
}
