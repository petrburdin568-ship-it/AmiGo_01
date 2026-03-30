"use client";

import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth } from "@/components/auth-provider";
import {
  appendIncomingMessage,
  getFriendshipDetails,
  listMessages,
  sendMessage
} from "@/lib/supabase/queries";
import type { MessageRow } from "@/lib/supabase/types";
import type { ChatMessage, FriendRecord } from "@/lib/types";

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const chatId = typeof params.chatId === "string" ? params.chatId : "";
  const { loading, session, supabase } = useAuth();

  const [friend, setFriend] = useState<FriendRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);

  useEffect(() => {
    if (!session || !chatId) {
      setFriend(null);
      setMessages([]);
      return;
    }

    const userId = session.user.id;
    let active = true;

    async function loadChat() {
      setLoadingChat(true);
      try {
        const [friendRecord, chatMessages] = await Promise.all([
          getFriendshipDetails(supabase, userId, chatId),
          listMessages(supabase, chatId, userId)
        ]);

        if (!active) {
          return;
        }

        setFriend(friendRecord);
        setMessages(chatMessages);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось открыть чат.");
        }
      } finally {
        if (active) {
          setLoadingChat(false);
        }
      }
    }

    void loadChat();

    return () => {
      active = false;
    };
  }, [chatId, session, supabase]);

  useEffect(() => {
    if (!session || !chatId) {
      return;
    }

    const userId = session.user.id;
    const channel = supabase
      .channel(`messages:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `friendship_id=eq.${chatId}`
        },
        (payload: RealtimePostgresInsertPayload<MessageRow>) => {
          setMessages((current) => appendIncomingMessage(current, payload.new, userId));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, session, supabase]);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canSend) {
      return;
    }

    try {
      await sendMessage(supabase, chatId, session.user.id, draft);
      setDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
    }
  }

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Чат" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
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

  if (loadingChat) {
    return (
      <AppShell mode="plain" title="Чат" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
          </div>
          <div className="reference-sheet-block">
            <p className="reference-sheet-copy">Загружаем переписку...</p>
          </div>
        </section>
      </AppShell>
    );
  }

  if (!friend) {
    return (
      <AppShell mode="plain" title="Чат" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
          </div>
          {message ? <div className="reference-sheet-message">{message}</div> : null}
          <div className="reference-bottom-action reference-bottom-action-left">
            <Link className="button button-primary" href="/chats">
              Вернуться к чатам
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="chat" title="" description="">
      {message ? <div className="toast-panel tg-chat-toast">{message}</div> : null}

      <section className="tg-chat-shell">
        <div className="tg-chatbar">
          <div className="tg-chatbar-main">
            <Link className="tg-chatbar-back" href="/chats">
              Назад
            </Link>

            <Link className="tg-chatbar-user" href={`/friends/${friend.friendshipId}`}>
              <UserAvatar className="tg-chat-avatar" name={friend.profile.name} size="sm" src={friend.profile.avatar} />
              <div className="tg-chatbar-copy">
                <strong>{friend.profile.name}</strong>
                <span>{friend.profile.amigoId}</span>
              </div>
            </Link>
          </div>

          <Link className="tg-chatbar-profile" href={`/friends/${friend.friendshipId}`}>
            Профиль
          </Link>
        </div>

        <div className="tg-chat-messages">
          {messages.length === 0 ? (
            <div className="tg-service-badge">Напиши первое сообщение</div>
          ) : (
            messages.map((item) => (
              <div key={item.id} className={`tg-bubble ${item.sender === "me" ? "tg-bubble-out" : "tg-bubble-in"}`}>
                {item.text}
              </div>
            ))
          )}
        </div>

        <form className="tg-chat-compose" onSubmit={handleSubmit}>
          <button aria-label="Добавить" className="tg-compose-icon" type="button">
            +
          </button>
          <textarea
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Сообщение"
            rows={1}
            value={draft}
          />
          <button className="tg-compose-send" disabled={!canSend} type="submit">
            Отпр.
          </button>
        </form>
      </section>
    </AppShell>
  );
}
