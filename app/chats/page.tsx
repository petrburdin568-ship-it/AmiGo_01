"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { UserAvatar } from "@/components/user-avatar";
import { listFriends } from "@/lib/supabase/queries";
import type { ChatMessageType, FriendRecord } from "@/lib/types";

function getChatPreview(type: ChatMessageType, text: string, language: "ru" | "en") {
  if (type === "image") {
    return language === "ru" ? "Фотография" : "Photo";
  }

  if (type === "video") {
    return language === "ru" ? "Видео" : "Video";
  }

  if (type === "sticker") {
    return language === "ru" ? "Стикер" : "Sticker";
  }

  if (type === "voice") {
    return language === "ru" ? "Голосовое" : "Voice message";
  }

  if (type === "video-note") {
    return language === "ru" ? "Кружок" : "Video note";
  }

  return text;
}

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
          you: "Ты: ",
          unread: "Новых",
          locale: "ru-RU" as const
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
          you: "You: ",
          unread: "New",
          locale: "en-US" as const
        };

  useEffect(() => {
    if (!session) {
      setFriends([]);
      return;
    }

    const currentUserId = session.user.id;
    let active = true;

    async function loadFriendsList() {
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

    void loadFriendsList();

    const channel = supabase
      .channel(`chat-list:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void loadFriendsList();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [copy.loadError, session, supabase]);

  const sortedFriends = useMemo(() => {
    return [...friends].sort((left, right) => {
      const leftDate = left.lastMessage?.sentAt ?? left.createdAt;
      const rightDate = right.lastMessage?.sentAt ?? right.createdAt;
      return rightDate.localeCompare(leftDate);
    });
  }, [friends]);

  if (!session && !loading) {
    return (
      <AppShell description="" mode="plain" title={copy.title}>
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
    <AppShell description="" mode="plain" title={copy.title}>
      <section className="tg-home">
        <header className="tg-home-header">
          <div className="tg-home-header-copy">
            <h1>{copy.title}</h1>
            <p>{copy.hint}</p>
          </div>

          <div className="modern-meta-pills">
            <span className="reference-meta-pill modern-meta-pill">
              {sortedFriends.length} {copy.dialogs}
            </span>
          </div>
        </header>

        {message ? <div className="reference-sheet-message">{message}</div> : null}

        <div className="tg-list-panel">
          {sortedFriends.length === 0 ? (
            <div className="tg-empty-screen">
              <h2>{copy.inbox}</h2>
              <p>{copy.empty}</p>
            </div>
          ) : (
            <div className="tg-dialog-list">
              {sortedFriends.map((friend) => {
                const preview = friend.lastMessage
                  ? `${friend.lastMessage.sender === "me" ? copy.you : ""}${getChatPreview(
                      friend.lastMessage.type,
                      friend.lastMessage.text,
                      language
                    )}`
                  : friend.profile.bio || copy.chatReady;

                return (
                  <article key={friend.friendshipId} className="tg-dialog-row">
                    <Link className="tg-dialog-avatar" href={`/friends/${friend.friendshipId}`}>
                      <UserAvatar name={friend.profile.name} size="sm" src={friend.profile.avatar} />
                    </Link>

                    <Link className="tg-dialog-main" href={`/chats/${friend.friendshipId}`}>
                      <div className="tg-dialog-top">
                        <strong>{friend.profile.name}</strong>
                        <span>{new Date(friend.lastMessage?.sentAt ?? friend.createdAt).toLocaleDateString(copy.locale)}</span>
                      </div>

                      <div className="tg-dialog-bottom">
                        <p className={friend.unreadCount > 0 ? "tg-dialog-preview-unread" : ""}>{preview}</p>
                        {friend.unreadCount > 0 ? (
                          <span className="tg-dialog-badge" aria-label={`${copy.unread}: ${friend.unreadCount}`}>
                            {friend.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </Link>

                    <Link className="tg-dialog-side" href={`/friends/${friend.friendshipId}`}>
                      {copy.profile}
                    </Link>
                  </article>
                );
              })}
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
