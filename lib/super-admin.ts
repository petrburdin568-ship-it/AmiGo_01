import type { SupabaseClient } from "@supabase/supabase-js";
import { setCustomTitle } from "@/lib/supabase/queries";
import { resolveAccessProfile } from "@/lib/title-system";
import type { UserProfile } from "@/lib/types";

export class SuperAdmin {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly profile: UserProfile | null,
    private readonly sessionUserId: string | null
  ) {}

  get access() {
    return resolveAccessProfile(this.profile, this.sessionUserId);
  }

  async setCustomTitle(targetUserId: string, titleText: string, titleIcon = "IMP", titleTone = "gold") {
    if (!this.access.canGrantCustomTitles) {
      throw new Error("У этого аккаунта нет доступа к выдаче кастомных титулов.");
    }

    return setCustomTitle(this.supabase, targetUserId, titleText, titleIcon, titleTone);
  }

  resolveCoinBalance(storedBalance: number) {
    return this.access.hasInfiniteWealth ? Number.POSITIVE_INFINITY : storedBalance;
  }

  async terminateSession() {
    if (!this.access.canTerminateSession) {
      throw new Error("У этого аккаунта нет права на принудительное завершение сессий.");
    }

    throw new Error(
      "Принудительное завершение чужих сессий требует отдельного server-side admin канала с service role key."
    );
  }
}
