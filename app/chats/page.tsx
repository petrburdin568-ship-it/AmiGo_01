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
          inbox: "Твой список диалогов",
          hint: "Чистый современный экран со всеми активными переписками.",
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
          inbox: "Your conversation list",
          hint: "A clean modern screen for all active conversations.",
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
        <section className="modern-screen modern-screen-chats">
          <header className="modern-screen-head">
            <div className="modern-head-copy">
              <span className="modern-kicker">AmiGo</span>
              <h1 className="modern-screen-title">{copy.title}</h1>
              <p className="modern-screen-text">{copy.signInPrompt}</p>
            </div>
          </header>

          <div className="modern-empty-state">
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
      <section className="modern-screen modern-screen-chats">
        <header className="modern-screen-head">
          <div className="modern-head-copy">
            <span className="modern-kicker">{copy.inbox}</span>
            <h1 className="modern-screen-title">{copy.title}</h1>
            <p className="modern-screen-text">{copy.hint}</p>
          </div>

          <div className="modern-meta-pills">
            <span className="reference-meta-pill modern-meta-pill">
              {friends.length} {copy.dialogs}
            </span>
          </div>
        </header>

        {message ? <div className="reference-sheet-message">{message}</div> : null}

        {friends.length === 0 ? (
          <div className="modern-empty-state modern-empty-state-wide">
            <p>{copy.empty}</p>
          </div>
        ) : (
          <div className="modern-chat-list">
            {friends.map((friend) => (
              <article key={friend.friendshipId} className="modern-chat-row">
                <Link className="modern-chat-avatar-link" href={`/friends/${friend.friendshipId}`}>
                  <UserAvatar name={friend.profile.name} size="sm" src={friend.profile.avatar} />
                </Link>

                <Link className="modern-chat-main" href={`/chats/${friend.friendshipId}`}>
                  <div className="modern-chat-top">
                    <strong>{friend.profile.name}</strong>
                    <span>{new Date(friend.createdAt).toLocaleDateString(copy.locale)}</span>
                  </div>
                  <p className="modern-chat-preview">{friend.profile.bio || copy.chatReady}</p>
                </Link>

                <Link className="button button-secondary modern-chat-side" href={`/friends/${friend.friendshipId}`}>
                  {copy.profile}
                </Link>
              </article>
            ))}
          </div>
        )}

        <div className="modern-action-bar">
          <Link className="button button-primary reference-bottom-button" href="/discover">
            {copy.find}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
