"use client";

import type { RealtimeChannel, RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { UserAvatar } from "@/components/user-avatar";
import {
  appendIncomingMessage,
  deleteOwnMessage,
  getFriendshipDetails,
  listMessages,
  markFriendshipRead,
  sendImageMessage,
  sendMessage,
  sendStickerMessage,
  sendVideoMessage,
  sendVideoNoteMessage,
  sendVoiceMessage
} from "@/lib/supabase/queries";
import type { MessageRow } from "@/lib/supabase/types";
import { getStickerByValue, STICKER_OPTIONS } from "@/lib/stickers";
import type { ChatMessage, ChatMessageReply, FriendRecord } from "@/lib/types";

type MediaPreviewState = { url: string; type: "image" | "video" } | null;
type RecordingKind = "voice" | "video-note" | null;

type ContextMenuState = {
  messageId: string;
  sender: "me" | "them";
  x: number;
  y: number;
  text: string;
  type: ChatMessage["type"];
  mediaUrl: string | null;
};

type PresenceMeta = {
  userId?: string;
  typing?: boolean;
};

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

function getReplyLabel(reply: ChatMessageReply | null) {
  if (!reply) {
    return "Сообщение недоступно";
  }

  if (reply.type === "image") {
    return "Фотография";
  }

  if (reply.type === "video") {
    return "Видео";
  }

  if (reply.type === "voice") {
    return "Голосовое";
  }

  if (reply.type === "video-note") {
    return "Кружок";
  }

  if (reply.type === "sticker") {
    return "Стикер";
  }

  return reply.text;
}

function handleMediaKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, openPreview: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openPreview();
  }
}

function getSupportedRecorderMime(kind: "voice" | "video-note") {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates =
    kind === "voice"
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
}

function formatRecordingTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const chatId = typeof params.chatId === "string" ? params.chatId : "";
  const { loading, session, supabase } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recordingKindRef = useRef<RecordingKind>(null);

  const [friend, setFriend] = useState<FriendRecord | null>(null);
  const [rawMessages, setRawMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [preview, setPreview] = useState<MediaPreviewState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [recordingKind, setRecordingKind] = useState<RecordingKind>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);

  const messages = useMemo(() => {
    const messageMap = new Map(rawMessages.map((item) => [item.id, item]));

    return rawMessages.map((item) => ({
      ...item,
      replyPreview: item.replyToMessageId
        ? (() => {
            const replied = messageMap.get(item.replyToMessageId);
            if (!replied) {
              return null;
            }

            return {
              id: replied.id,
              sender: replied.sender,
              type: replied.type,
              text: replied.text,
              mediaUrl: replied.mediaUrl,
              sentAt: replied.sentAt
            };
          })()
        : null
    }));
  }, [rawMessages]);

  useEffect(() => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = cameraPreviewStream;
    }
  }, [cameraPreviewStream]);

  useEffect(() => {
    if (!recordingKind) {
      setRecordingSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [recordingKind]);

  useEffect(() => {
    if (!session || !chatId) {
      setFriend(null);
      setRawMessages([]);
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
        setRawMessages(chatMessages);
        await markFriendshipRead(supabase, chatId);
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
        async (payload: RealtimePostgresInsertPayload<MessageRow>) => {
          setRawMessages((current) => appendIncomingMessage(current, payload.new, userId));

          if (payload.new.sender_id !== userId) {
            try {
              await markFriendshipRead(supabase, chatId);
            } catch {
              // best effort
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, session, supabase]);

  useEffect(() => {
    if (!session || !chatId) {
      return;
    }

    const userId = session.user.id;
    const channel = supabase.channel(`typing:${chatId}`, {
      config: {
        presence: {
          key: userId
        }
      }
    });

    typingChannelRef.current = channel;

    function syncTypingState() {
      const state = channel.presenceState() as Record<string, PresenceMeta[]>;
      const isTyping = Object.values(state).some((entries) =>
        entries.some((entry) => entry.userId !== userId && entry.typing)
      );
      setOtherTyping(isTyping);
    }

    channel.on("presence", { event: "sync" }, syncTypingState);

    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          userId,
          typing: false
        });
      }
    });

    return () => {
      if (typingResetRef.current) {
        clearTimeout(typingResetRef.current);
      }

      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [chatId, session, supabase]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function closeMenu() {
      setContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const canSend = useMemo(() => draft.trim().length > 0 && !uploadingMedia && !recordingKind, [draft, recordingKind, uploadingMedia]);

  async function setTypingState(value: boolean) {
    const channel = typingChannelRef.current;
    const userId = session?.user.id;
    if (!channel || !userId) {
      return;
    }

    await channel.track({
      userId,
      typing: value
    });
  }

  function handleDraftChange(nextValue: string) {
    setDraft(nextValue);

    if (!session) {
      return;
    }

    void setTypingState(nextValue.trim().length > 0);

    if (typingResetRef.current) {
      clearTimeout(typingResetRef.current);
    }

    typingResetRef.current = setTimeout(() => {
      void setTypingState(false);
    }, 1400);
  }

  function clearReply() {
    setReplyTarget(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canSend) {
      return;
    }

    try {
      await sendMessage(supabase, chatId, session.user.id, draft, {
        replyToMessageId: replyTarget?.id ?? null
      });
      setDraft("");
      setMessage("");
      clearReply();
      await setTypingState(false);
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
        await sendImageMessage(supabase, chatId, session.user.id, file, {
          replyToMessageId: replyTarget?.id ?? null
        });
      } else {
        await sendVideoMessage(supabase, chatId, session.user.id, file, {
          replyToMessageId: replyTarget?.id ?? null
        });
      }
      clearReply();
      await setTypingState(false);
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
      await sendStickerMessage(supabase, chatId, session.user.id, stickerValue, {
        replyToMessageId: replyTarget?.id ?? null
      });
      setMessage("");
      setStickersOpen(false);
      clearReply();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить стикер.");
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!session) {
      return;
    }

    setDeletingMessageId(messageId);
    setMessage("");

    try {
      await deleteOwnMessage(supabase, messageId);
      setRawMessages((current) => current.filter((item) => item.id !== messageId));
      if (replyTarget?.id === messageId) {
        clearReply();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить сообщение.");
    } finally {
      setDeletingMessageId("");
    }
  }

  async function handleCopyFromMenu() {
    if (!contextMenu) {
      return;
    }

    const copyValue =
      contextMenu.type === "text" || contextMenu.type === "sticker" ? contextMenu.text : contextMenu.mediaUrl ?? "";

    if (!copyValue) {
      setContextMenu(null);
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      setMessage("Скопировано.");
    } catch {
      setMessage("Не удалось скопировать.");
    } finally {
      setContextMenu(null);
    }
  }

  function handleReplyFromMenu() {
    if (!contextMenu) {
      return;
    }

    const target = messages.find((item) => item.id === contextMenu.messageId);
    if (target) {
      setReplyTarget(target);
    }

    setContextMenu(null);
  }

  async function handleDeleteFromMenu() {
    if (!contextMenu || contextMenu.sender !== "me") {
      return;
    }

    setContextMenu(null);
    await handleDeleteMessage(contextMenu.messageId);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function openContextMenuAt(x: number, y: number, item: ChatMessage) {
    setContextMenu({
      messageId: item.id,
      sender: item.sender,
      x,
      y,
      text: item.text,
      type: item.type,
      mediaUrl: item.mediaUrl
    });
  }

  function openContextMenu(event: ReactMouseEvent<HTMLDivElement>, item: ChatMessage) {
    event.preventDefault();
    openContextMenuAt(event.clientX, event.clientY, item);
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>, item: ChatMessage) {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      openContextMenuAt(touch.clientX, touch.clientY, item);
      longPressTimerRef.current = null;
    }, 420);
  }

  function clearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  async function finishRecording(kind: "voice" | "video-note", blob: Blob) {
    if (!session) {
      return;
    }

    const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File([blob], `${kind}-${Date.now()}.${extension}`, {
      type: blob.type || (kind === "voice" ? "audio/webm" : "video/webm")
    });

    setUploadingMedia(true);
    setMessage("");

    try {
      if (kind === "voice") {
        await sendVoiceMessage(supabase, chatId, session.user.id, file, {
          replyToMessageId: replyTarget?.id ?? null
        });
      } else {
        await sendVideoNoteMessage(supabase, chatId, session.user.id, file, {
          replyToMessageId: replyTarget?.id ?? null
        });
      }
      clearReply();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить запись.");
    } finally {
      setUploadingMedia(false);
      setRecordingSeconds(0);
    }
  }

  function cleanupRecording() {
    mediaRecorderRef.current = null;
    mediaChunksRef.current = [];
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setCameraPreviewStream(null);
  }

  async function startRecording(kind: "voice" | "video-note") {
    if (!session || recordingKind || uploadingMedia) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("На этом устройстве запись недоступна.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "voice"
          ? { audio: true }
          : {
              audio: true,
              video: {
                facingMode: "user",
                width: { ideal: 720 },
                height: { ideal: 720 }
              }
            }
      );

      const mimeType = getSupportedRecorderMime(kind);
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      mediaChunksRef.current = [];
      recordingKindRef.current = kind;
      setRecordingKind(kind);
      setRecordingSeconds(0);
      setMessage("");
      setStickersOpen(false);

      if (kind === "video-note") {
        setCameraPreviewStream(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const nextKind = recordingKindRef.current;
        const blob = new Blob(mediaChunksRef.current, {
          type: mediaChunksRef.current[0]?.type || (nextKind === "voice" ? "audio/webm" : "video/webm")
        });
        cleanupRecording();
        recordingKindRef.current = null;
        if (blob.size > 0 && nextKind) {
          void finishRecording(nextKind, blob);
        } else {
          setRecordingSeconds(0);
        }
      };

      recorder.start();
    } catch (error) {
      cleanupRecording();
      setRecordingKind(null);
      setRecordingSeconds(0);
      setMessage(error instanceof Error ? error.message : "Не удалось запустить запись.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupRecording();
      setRecordingKind(null);
      return;
    }

    setRecordingKind(null);
    recorder.stop();
  }

  async function toggleVoiceRecording() {
    if (recordingKind === "voice") {
      stopRecording();
      return;
    }

    if (recordingKind === "video-note") {
      setMessage("Сначала завершите запись кружка.");
      return;
    }

    await startRecording("voice");
  }

  async function toggleVideoNoteRecording() {
    if (recordingKind === "video-note") {
      stopRecording();
      return;
    }

    if (recordingKind === "voice") {
      setMessage("Сначала завершите запись голосового.");
      return;
    }

    await startRecording("video-note");
  }

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Чат" description="">
        <section className="stack-lg">
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
        <section className="stack-lg">
          <p className="reference-sheet-copy">Загружаем переписку...</p>
        </section>
      </AppShell>
    );
  }

  if (!friend) {
    return (
      <AppShell mode="plain" title="Чат" description="">
        <section className="stack-lg">
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

      {preview ? (
        <div className="tg-media-viewer" onClick={() => setPreview(null)} role="dialog">
          <button aria-label="Закрыть просмотр" className="tg-media-viewer-close" onClick={() => setPreview(null)} type="button">
            Закрыть
          </button>

          <div className="tg-media-viewer-surface" onClick={(event) => event.stopPropagation()}>
            {preview.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Просмотр изображения" className="tg-media-viewer-image" src={preview.url} />
            ) : (
              <video autoPlay className="tg-media-viewer-video" controls preload="metadata" src={preview.url} />
            )}
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div className="tg-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="tg-context-item" onClick={() => handleReplyFromMenu()} type="button">
            Ответить
          </button>
          <button className="tg-context-item" onClick={() => void handleCopyFromMenu()} type="button">
            Копировать
          </button>
          {contextMenu.sender === "me" ? (
            <button
              className="tg-context-item tg-context-item-danger"
              disabled={deletingMessageId === contextMenu.messageId}
              onClick={() => void handleDeleteFromMenu()}
              type="button"
            >
              {deletingMessageId === contextMenu.messageId ? "Удаляем..." : "Удалить"}
            </button>
          ) : null}
        </div>
      ) : null}

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
                <span>{otherTyping ? "печатает..." : friend.profile.amigoId}</span>
              </div>
            </Link>
          </div>

          <div className="tg-chatbar-actions">
            <span className="tg-chatbar-status">{otherTyping ? "печатает..." : "Готов к переписке"}</span>
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
              <p>Отправь первое сообщение, стикер, голосовое, кружок или медиа.</p>
            </div>
          ) : (
            messages.map((item) => (
              <div
                key={item.id}
                className={`tg-bubble ${item.sender === "me" ? "tg-bubble-out" : "tg-bubble-in"} ${item.type === "sticker" ? "tg-bubble-sticker-shell" : ""} ${item.type === "video-note" ? "tg-bubble-video-note-shell" : ""}`}
                onContextMenu={(event) => openContextMenu(event, item)}
                onTouchCancel={clearLongPress}
                onTouchEnd={clearLongPress}
                onTouchStart={(event) => handleTouchStart(event, item)}
              >
                {item.replyPreview ? (
                  <div className="tg-bubble-reply">
                    <strong>{item.replyPreview.sender === "me" ? "Ты" : friend.profile.name}</strong>
                    <span>{getReplyLabel(item.replyPreview)}</span>
                  </div>
                ) : null}

                {item.type === "image" && item.mediaUrl ? (
                  <div
                    aria-label="Открыть изображение"
                    className="tg-media-tap"
                    onClick={() => setPreview({ url: item.mediaUrl!, type: "image" })}
                    onKeyDown={(event) => handleMediaKeyDown(event, () => setPreview({ url: item.mediaUrl!, type: "image" }))}
                    role="button"
                    tabIndex={0}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="Вложение" className="tg-bubble-image" src={item.mediaUrl} />
                  </div>
                ) : null}

                {item.type === "video" && item.mediaUrl ? (
                  <div
                    aria-label="Открыть видео"
                    className="tg-media-tap"
                    onClick={() => setPreview({ url: item.mediaUrl!, type: "video" })}
                    onKeyDown={(event) => handleMediaKeyDown(event, () => setPreview({ url: item.mediaUrl!, type: "video" }))}
                    role="button"
                    tabIndex={0}
                  >
                    <video className="tg-bubble-video" controls preload="metadata" src={item.mediaUrl} />
                  </div>
                ) : null}

                {item.type === "voice" && item.mediaUrl ? (
                  <audio className="tg-bubble-audio" controls preload="metadata" src={item.mediaUrl} />
                ) : null}

                {item.type === "video-note" && item.mediaUrl ? (
                  <div
                    aria-label="Открыть кружок"
                    className="tg-media-tap tg-video-note"
                    onClick={() => setPreview({ url: item.mediaUrl!, type: "video" })}
                    onKeyDown={(event) => handleMediaKeyDown(event, () => setPreview({ url: item.mediaUrl!, type: "video" }))}
                    role="button"
                    tabIndex={0}
                  >
                    <video className="tg-bubble-video-note" loop muted playsInline preload="metadata" src={item.mediaUrl} />
                    <span className="tg-video-note-ring" />
                  </div>
                ) : null}

                {item.type === "sticker" ? (
                  <div aria-label={getStickerByValue(item.text)?.label ?? "Стикер"} className="tg-sticker-bubble" role="img">
                    {getStickerByValue(item.text)?.emoji ?? item.text}
                  </div>
                ) : null}

                {item.type === "text" ? <div className="tg-bubble-text">{item.text}</div> : null}

                <div className="tg-bubble-footer">
                  <div className="tg-bubble-meta">{formatMessageTime(item.sentAt)}</div>
                </div>
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

          {replyTarget ? (
            <div className="tg-reply-bar">
              <div className="tg-reply-bar-copy">
                <strong>{replyTarget.sender === "me" ? "Ответ себе" : `Ответ ${friend.profile.name}`}</strong>
                <span>{getReplyLabel(replyTarget)}</span>
              </div>
              <button className="tg-reply-bar-close" onClick={() => clearReply()} type="button">
                ×
              </button>
            </div>
          ) : null}

          {recordingKind ? (
            <div className="tg-recording-bar">
              <div className="tg-recording-copy">
                <strong>{recordingKind === "voice" ? "Идёт запись голосового" : "Идёт запись кружка"}</strong>
                <span>{formatRecordingTime(recordingSeconds)}</span>
              </div>

              {recordingKind === "video-note" ? (
                <div className="tg-recording-preview">
                  <video autoPlay className="tg-recording-preview-video" muted playsInline ref={videoPreviewRef} />
                </div>
              ) : null}

              <button className="tg-recording-stop" onClick={() => stopRecording()} type="button">
                Отправить
              </button>
            </div>
          ) : null}

          <input accept="image/*,video/*" className="tg-file-input" onChange={handleMediaSelect} ref={fileInputRef} type="file" />

          <button aria-label="Добавить файл" className="tg-compose-icon" onClick={openFilePicker} type="button">
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

          <button
            aria-label={recordingKind === "voice" ? "Остановить запись голосового" : "Записать голосовое"}
            className={`tg-compose-icon ${recordingKind === "voice" ? "tg-compose-icon-active" : ""}`}
            onClick={() => void toggleVoiceRecording()}
            type="button"
          >
            🎙
          </button>

          <button
            aria-label={recordingKind === "video-note" ? "Остановить запись кружка" : "Записать кружок"}
            className={`tg-compose-icon ${recordingKind === "video-note" ? "tg-compose-icon-active" : ""}`}
            onClick={() => void toggleVideoNoteRecording()}
            type="button"
          >
            ◉
          </button>

          <textarea
            onChange={(event) => handleDraftChange(event.target.value)}
            placeholder={uploadingMedia ? "Отправляем файл..." : recordingKind ? "Сначала заверши запись" : "Сообщение"}
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
