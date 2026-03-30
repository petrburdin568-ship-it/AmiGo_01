"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { UserAvatar } from "@/components/user-avatar";
import { listFriends } from "@/lib/supabase/queries";
import type { FriendRecord } from "@/lib/types";

export default function ChatsPage() {
  const { loading, session, supabase } = useAuth();
  const { language } = useLanguage();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [message, setMessage] = useState("");

  const copy =
    language === "ru"
      ? {
          title: "Чаты",
          signInPrompt: "Войди в аккаунт, чтобы открыть переписку.",
          signIn: "Войти",
          dialogs: "диалогов",
          empty: "Диалоги появятся после принятия заявок в друзья.",
          chatReady: "Диалог готов к началу общения.",
          profile: "Профиль",
          find: "Найти собеседника",
          loadError: "Не удалось загрузить чаты.",
          locale: "ru-RU"
        }
      : {
          title: "Chats",
          signInPrompt: "Sign in to open your conversations.",
          signIn: "Sign in",
          dialogs: "dialogs",
          empty: "Dialogs will appear after friend requests are accepted.",
          chatReady: "This conversation is ready to start.",
          profile: "Profile",
          find: "Find someone",
          loadError: "Failed to load chats.",
          locale: "en-US"
        };

  useEffect(() => {
    if (!session) {
      setFriends([]);
      return;
    }

    const currentUserId = session.user.id;
    let active = true;

    async function loadFriends() {
      try {
        const friendList = await listFriends(supabase, currentUserId);
        if (active) {
          setFriends(friendList);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : copy.loadError);
        }
      }
    }

    void loadFriends();

    return () => {
      active = false;
    };
  }, [copy.loadError, session, supabase]);

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title={copy.title} description="">
        <section className="reference-sheet dialog-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
          </div>

          <div className="screen-heading-row">
            <h1 className="reference-sheet-heading">{copy.title}</h1>
            <p className="reference-sheet-copy">{copy.signInPrompt}</p>
          </div>

          <div className="reference-empty reference-empty-compact">
            <Link className="button button-primary" href="/auth">
              {copy.signIn}
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="plain" title={copy.title} description="">
      <section className="reference-sheet dialog-sheet stack-lg">
        <div className="reference-sheet-top">
          <span className="reference-brand-label">AmiGo</span>
        </div>

        <div className="screen-heading-row">
          <h1 className="reference-sheet-heading">{copy.title}</h1>
          <div className="reference-inline-pills">
            <span className="reference-meta-pill">
              {friends.length} {copy.dialogs}
            </span>
          </div>
        </div>

        {message ? <div className="reference-sheet-message">{message}</div> : null}

        {friends.length === 0 ? (
          <div className="reference-empty reference-empty-compact">
            <p>{copy.empty}</p>
          </div>
        ) : (
          <div className="reference-dialog-list reference-dialog-list-sheet">
            {friends.map((friend) => (
              <article key={friend.friendshipId} className="reference-dialog-row reference-dialog-row-sheet">
                <Link className="reference-dialog-avatar" href={`/friends/${friend.friendshipId}`}>
                  <UserAvatar name={friend.profile.name} size="sm" src={friend.profile.avatar} />
                </Link>

                <Link className="reference-dialog-main" href={`/chats/${friend.friendshipId}`}>
                  <div className="reference-dialog-top">
                    <strong>{friend.profile.name}</strong>
                    <span>{new Date(friend.createdAt).toLocaleDateString(copy.locale)}</span>
                  </div>
                  <p>{friend.profile.bio || copy.chatReady}</p>
                </Link>

                <Link className="reference-dialog-side" href={`/friends/${friend.friendshipId}`}>
                  {copy.profile}
                </Link>
              </article>
            ))}
          </div>
        )}

        <div className="reference-bottom-action">
          <Link className="button button-primary reference-bottom-button" href="/discover">
            {copy.find}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
