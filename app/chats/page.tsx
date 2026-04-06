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
          inbox: "Твои диалоги",
          hint: "Все активные переписки в одном месте.",
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
          inbox: "Your conversations",
          hint: "All active conversations in one place.",
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
        <section className="tg-home">
          <header className="tg-home-header">
            <div className="tg-home-header-copy">
              <h1>{copy.title}</h1>
              <p>{copy.signInPrompt}</p>
            </div>
          </header>

          <div className="tg-list-panel">
            <div className="tg-empty-screen">
              <Link className="button button-primary" href="/auth">
                {copy.signIn}
              </Link>
            </div>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="plain" title={copy.title} description="">
      <section className="tg-home">
        <header className="tg-home-header">
          <div className="tg-home-header-copy">
            <h1>{copy.title}</h1>
            <p>{copy.hint}</p>
          </div>

          <div className="modern-meta-pills">
            <span className="reference-meta-pill modern-meta-pill">
              {friends.length} {copy.dialogs}
            </span>
          </div>
        </header>

        {message ? <div className="reference-sheet-message">{message}</div> : null}

        <div className="tg-list-panel">
          {friends.length === 0 ? (
            <div className="tg-empty-screen">
              <h2>{copy.inbox}</h2>
              <p>{copy.empty}</p>
            </div>
          ) : (
            <div className="tg-dialog-list">
              {friends.map((friend) => (
                <article key={friend.friendshipId} className="tg-dialog-row">
                  <Link className="tg-dialog-avatar" href={`/friends/${friend.friendshipId}`}>
                    <UserAvatar name={friend.profile.name} size="sm" src={friend.profile.avatar} />
                  </Link>

                  <Link className="tg-dialog-main" href={`/chats/${friend.friendshipId}`}>
                    <div className="tg-dialog-top">
                      <strong>{friend.profile.name}</strong>
                      <span>{new Date(friend.createdAt).toLocaleDateString(copy.locale)}</span>
                    </div>
                    <p>{friend.profile.bio || copy.chatReady}</p>
                  </Link>

                  <Link className="tg-dialog-side" href={`/friends/${friend.friendshipId}`}>
                    {copy.profile}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>

        <Link className="tg-fab" href="/discover">
          {copy.find}
        </Link>
      </section>
    </AppShell>
  );
}
