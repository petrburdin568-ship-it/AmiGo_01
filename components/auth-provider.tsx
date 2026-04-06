"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getProfileByUserId, touchPresence } from "@/lib/supabase/queries";
import { resolveAccessProfile } from "@/lib/title-system";
import type { Capability, UserAccessProfile, UserProfile } from "@/lib/types";

type AuthContextValue = {
  supabase: SupabaseClient;
  session: Session | null;
  profile: UserProfile | null;
  access: UserAccessProfile;
  adminUnlocked: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshAdminAccess: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchAdminAccess(session: Session | null) {
  if (!session?.access_token) {
    return false;
  }

  try {
    const response = await fetch("/api/admin/status", {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => getSupabaseBrowserClient());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    try {
      const nextProfile = await getProfileByUserId(supabase, userId);
      setProfile(nextProfile);
    } catch {
      setProfile(null);
    }
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      setSession(currentSession);
      await loadProfile(currentSession?.user.id ?? null);
      setAdminUnlocked(await fetchAdminAccess(currentSession));
      if (active) {
        setLoading(false);
      }
    }

    void bootstrap();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user.id ?? null);
      void fetchAdminAccess(nextSession).then((value) => setAdminUnlocked(value));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, supabase]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;

    async function syncPresence(nextOnline: boolean) {
      try {
        await touchPresence(supabase, nextOnline);
      } catch {
        // best effort
      }
    }

    void syncPresence(true);

    const interval = setInterval(() => {
      if (active && document.visibilityState === "visible") {
        void syncPresence(true);
      }
    }, 25000);

    function handleVisibility() {
      void syncPresence(document.visibilityState === "visible");
    }

    function handlePageHide() {
      void syncPresence(false);
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      void syncPresence(false);
    };
  }, [session, supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      supabase,
      session,
      profile,
      access: (() => {
        const baseAccess = resolveAccessProfile(profile, session?.user.id ?? null);
        if (!adminUnlocked) {
          return baseAccess;
        }

        const capabilities = Array.from(
          new Set([...baseAccess.capabilities, "title_grantor", "ban_hammer"])
        ) as Capability[];

        return {
          ...baseAccess,
          isAdmin: true,
          capabilities,
          canGrantCustomTitles: true,
          canTerminateSession: true
        };
      })(),
      adminUnlocked,
      loading,
      refreshProfile: async () => {
        await loadProfile(session?.user.id ?? null);
      },
      refreshAdminAccess: async () => {
        setAdminUnlocked(await fetchAdminAccess(session));
      },
      signOut: async () => {
        await touchPresence(supabase, false).catch(() => undefined);
        await supabase.auth.signOut();
        setProfile(null);
        setAdminUnlocked(false);
      }
    }),
    [adminUnlocked, loadProfile, loading, profile, session, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
