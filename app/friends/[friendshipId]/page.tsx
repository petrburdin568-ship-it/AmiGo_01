"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TitleBadge } from "@/components/title-badge";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth } from "@/components/auth-provider";
import { getInterestLabels } from "@/lib/constants";
import { getFriendshipDetails } from "@/lib/supabase/queries";
import type { FriendRecord } from "@/lib/types";

export default function FriendProfilePage() {
  const params = useParams<{ friendshipId: string }>();
  const friendshipId = typeof params.friendshipId === "string" ? params.friendshipId : "";
  const { loading, session, supabase } = useAuth();
  const [friend, setFriend] = useState<FriendRecord | null>(null);
  const [message, setMessage] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (!session || !friendshipId) {
      setFriend(null);
      return;
    }

    const currentUserId = session.user.id;
    let active = true;

    async function loadProfile() {
      setLoadingProfile(true);
      try {
        const data = await getFriendshipDetails(supabase, currentUserId, friendshipId);
        if (active) {
          setFriend(data);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось открыть профиль друга.");
        }
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [friendshipId, session, supabase]);

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Профиль друга" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
            <span className="reference-sheet-label">Профиль друга</span>
          </div>
          <div className="reference-bottom-action reference-bottom-action-left">
            <Link className="button button-primary" href="/auth">
              Войти
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  if (loadingProfile) {
    return (
      <AppShell mode="plain" title="Профиль друга" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
            <span className="reference-sheet-label">Профиль друга</span>
          </div>
          <div className="reference-sheet-block stack-sm">
            <h1 className="reference-sheet-heading">Профиль</h1>
            <p className="reference-sheet-copy">Открываем профиль друга.</p>
          </div>
        </section>
      </AppShell>
    );
  }

  if (!friend) {
    return (
      <AppShell mode="plain" title="Профиль друга" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
            <span className="reference-sheet-label">Профиль друга</span>
          </div>
          {message ? <div className="reference-sheet-message">{message}</div> : null}
          <div className="reference-bottom-action reference-bottom-action-left">
            <Link className="button button-primary" href="/friends">
              Вернуться к чатам
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="plain" title={friend.profile.name} description="">
      <section className="reference-sheet profile-sheet stack-lg">
        <div className="reference-sheet-top">
          <span className="reference-brand-label">AmiGo</span>
          <span className="reference-sheet-label">Профиль друга</span>
        </div>

        <div className="reference-sheet-block stack-sm">
          <h1 className="reference-sheet-heading">Профиль</h1>
          <p className="reference-sheet-copy">Публичная анкета принятого друга.</p>
        </div>

        <div className="reference-divider" />

        <div className="reference-sheet-block">
          <div className="reference-profile-hero reference-profile-hero-sheet">
            <div className="reference-profile-left">
              <UserAvatar className="profile-sheet-avatar" name={friend.profile.name} size="lg" src={friend.profile.avatar} />

              <div className="reference-identity">
                <strong>{friend.profile.name}</strong>
                <span>id: {friend.profile.amigoId}</span>
              </div>
            </div>

            <div className="reference-profile-right">
              <div className="reference-section-kicker">Титул</div>
              <TitleBadge title={friend.profile.activeTitle} />
            </div>
          </div>
        </div>

        <div className="reference-divider" />

        <div className="reference-sheet-block stack-sm">
          <div className="reference-section-kicker">О себе</div>
          <div className="reference-profile-bio">{friend.profile.bio}</div>
        </div>

        <div className="reference-divider" />

        <div className="reference-sheet-block stack-sm">
          <div className="reference-section-kicker">Интересы</div>
          <div className="tag-cloud">
            {getInterestLabels(friend.profile.interests).map((label) => (
              <span key={label} className="tag">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="reference-divider" />

        <div className="reference-bottom-action">
          <Link className="button button-secondary" href={`/chats/${friend.friendshipId}?startCall=1`}>
            Позвонить
          </Link>
          <Link className="button button-primary" href={`/chats/${friend.friendshipId}`}>
            Открыть чат
          </Link>
          <Link className="button button-secondary" href="/friends">
            Назад
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
