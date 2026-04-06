"use client";

import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth } from "@/components/auth-provider";
import {
  appendIncomingMessage,
  getFriendshipDetails,
  listMessages,
  sendImageMessage,
  sendMessage,
  sendStickerMessage,
  sendVideoMessage
} from "@/lib/supabase/queries";
import type { MessageRow } from "@/lib/supabase/types";
import { getStickerByValue, STICKER_OPTIONS } from "@/lib/stickers";
import type { ChatMessage, FriendRecord } from "@/lib/types";

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const chatId = typeof params.chatId === "string" ? params.chatId : "";
  const { loading, session, supabase } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [friend, setFriend] = useState<FriendRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);

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

  const canSend = useMemo(() => draft.trim().length > 0 && !uploadingMedia, [draft, uploadingMedia]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canSend) {
      return;
    }

    try {
      await sendMessage(supabase, chatId, session.user.id, draft);
      setDraft("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
    }
  }

  async function handleMediaSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!session || !file) {
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      setMessage("Можно отправлять только изображения и видео.");
      event.target.value = "";
      return;
    }

    setUploadingMedia(true);
    setMessage("");

    try {
      if (isImage) {
        await sendImageMessage(supabase, chatId, session.user.id, file);
      } else {
        await sendVideoMessage(supabase, chatId, session.user.id, file);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить файл.");
    } finally {
      setUploadingMedia(false);
      event.target.value = "";
    }
  }

  async function handleStickerSend(stickerValue: string) {
    if (!session) {
      return;
    }

    try {
      await sendStickerMessage(supabase, chatId, session.user.id, stickerValue);
      setMessage("");
      setStickersOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить стикер.");
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
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

          <div className="tg-chatbar-actions">
            <span className="tg-chatbar-status">в сети для чата</span>
            <Link className="tg-chatbar-profile" href={`/friends/${friend.friendshipId}`}>
              Профиль
            </Link>
          </div>
        </div>

        <div className="tg-chat-messages">
          <div className="tg-service-badge">Сегодня</div>

          {messages.length === 0 ? (
            <div className="tg-chat-empty">
              <strong>Чат открыт</strong>
              <p>Отправь первое сообщение, стикер или медиа.</p>
            </div>
          ) : (
            messages.map((item) => (
              <div
                key={item.id}
                className={`tg-bubble ${item.sender === "me" ? "tg-bubble-out" : "tg-bubble-in"} ${item.type === "sticker" ? "tg-bubble-sticker-shell" : ""}`}
              >
                {item.type === "image" && item.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Вложение" className="tg-bubble-image" src={item.mediaUrl} />
                ) : null}
                {item.type === "video" && item.mediaUrl ? (
                  <video className="tg-bubble-video" controls preload="metadata" src={item.mediaUrl} />
                ) : null}
                {item.type === "sticker" ? (
                  <div aria-label={getStickerByValue(item.text)?.label ?? "Стикер"} className="tg-sticker-bubble" role="img">
                    {getStickerByValue(item.text)?.emoji ?? item.text}
                  </div>
                ) : null}
                {item.type === "text" ? <span>{item.text}</span> : null}
                <div className="tg-bubble-meta">{formatMessageTime(item.sentAt)}</div>
              </div>
            ))
          )}
        </div>

        <form className="tg-chat-compose" onSubmit={handleSubmit}>
          {stickersOpen ? (
            <div className="tg-sticker-panel">
              {STICKER_OPTIONS.map((sticker) => (
                <button
                  key={sticker.id}
                  className="tg-sticker-item"
                  onClick={() => void handleStickerSend(sticker.emoji)}
                  title={sticker.label}
                  type="button"
                >
                  <span aria-label={sticker.label} className="tg-sticker-item-emoji" role="img">
                    {sticker.emoji}
                  </span>
                  <span className="tg-sticker-item-label">{sticker.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <input
            accept="image/*,video/*"
            className="tg-file-input"
            onChange={handleMediaSelect}
            ref={fileInputRef}
            type="file"
          />

          <button
            aria-label="Добавить файл"
            className="tg-compose-icon"
            onClick={openFilePicker}
            type="button"
          >
            +
          </button>

          <button
            aria-label="Открыть стикеры"
            className={`tg-compose-icon ${stickersOpen ? "tg-compose-icon-active" : ""}`}
            onClick={() => setStickersOpen((current) => !current)}
            type="button"
          >
            ☺
          </button>

          <textarea
            onChange={(event) => setDraft(event.target.value)}
            placeholder={uploadingMedia ? "Отправляем файл..." : "Сообщение"}
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
