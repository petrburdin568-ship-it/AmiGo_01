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
  createArenaInvite,
  getArenaMatch,
  getLatestArenaInvite,
  deleteMessageForEveryone,
  forwardMessage,
  getFriendshipDetails,
  listFriends,
  listMessages,
  markFriendshipRead,
  respondArenaInvite,
  sendImageMessage,
  sendMessage,
  sendStickerMessage,
  sendVideoMessage,
  sendVideoNoteMessage,
  sendVoiceMessage
} from "@/lib/supabase/queries";
import type { MessageRow } from "@/lib/supabase/types";
import { getStickerByValue, STICKER_OPTIONS } from "@/lib/stickers";
import type {
  ArenaInvite,
  ArenaMatch,
  ChatMessage,
  ChatMessageReply,
  FriendRecord
} from "@/lib/types";

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

type ForwardState = {
  message: ChatMessage;
  targets: FriendRecord[];
};

type PresenceMeta = {
  userId?: string;
  typing?: boolean;
};

const CONTEXT_MENU_MARGIN = 12;
const CONTEXT_MENU_FALLBACK_WIDTH = 196;
const CONTEXT_MENU_FALLBACK_HEIGHT = 208;

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

function getPresenceLabel(friend: FriendRecord | null, typing: boolean) {
  if (!friend) {
    return "";
  }

  if (typing) {
    return "печатает...";
  }

  if (friend.presence.isOnline) {
    return "в сети";
  }

  if (!friend.presence.lastSeenAt) {
    return "был недавно";
  }

  const seenAt = new Date(friend.presence.lastSeenAt);
  return `был ${seenAt.toLocaleDateString("ru-RU")} ${formatMessageTime(friend.presence.lastSeenAt)}`;
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

function clampContextMenuPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  const maxX = Math.max(CONTEXT_MENU_MARGIN, window.innerWidth - width - CONTEXT_MENU_MARGIN);
  const maxY = Math.max(CONTEXT_MENU_MARGIN, window.innerHeight - height - CONTEXT_MENU_MARGIN);

  return {
    x: Math.min(Math.max(CONTEXT_MENU_MARGIN, x), maxX),
    y: Math.min(Math.max(CONTEXT_MENU_MARGIN, y), maxY)
  };
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
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const recordingKindRef = useRef<RecordingKind>(null);
  const discardRecordingRef = useRef(false);
  const restartVideoNoteRef = useRef(false);
  const cameraFacingRef = useRef<"user" | "environment">("user");

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
  const [forwardState, setForwardState] = useState<ForwardState | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [recordingKind, setRecordingKind] = useState<RecordingKind>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const [arenaInvite, setArenaInvite] = useState<ArenaInvite | null>(null);
  const [arenaMatch, setArenaMatch] = useState<ArenaMatch | null>(null);
  const [arenaMenuOpen, setArenaMenuOpen] = useState(false);
  const [arenaBusy, setArenaBusy] = useState(false);

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
    cameraFacingRef.current = cameraFacingMode;
  }, [cameraFacingMode]);

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
      setArenaInvite(null);
      setArenaMatch(null);
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
      setArenaInvite(null);
      setArenaMatch(null);
      return;
    }

    let active = true;

    async function loadArenaState() {
      try {
        const latestInvite = await getLatestArenaInvite(supabase, chatId);
        if (!active) {
          return;
        }

        setArenaInvite(latestInvite);

        if (latestInvite?.arenaMatchId) {
          const nextMatch = await getArenaMatch(supabase, latestInvite.arenaMatchId);
          if (!active) {
            return;
          }

          setArenaMatch(nextMatch);
        } else {
          setArenaMatch(null);
        }
      } catch {
        if (active) {
          setArenaInvite(null);
          setArenaMatch(null);
        }
      }
    }

    void loadArenaState();

    const invitesChannel = supabase
      .channel(`arena-invites:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arena_invites",
          filter: `friendship_id=eq.${chatId}`
        },
        () => {
          void loadArenaState();
        }
      )
      .subscribe();

    const matchesChannel = supabase
      .channel(`arena-matches:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arena_matches",
          filter: `friendship_id=eq.${chatId}`
        },
        () => {
          void loadArenaState();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(invitesChannel);
      void supabase.removeChannel(matchesChannel);
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `friendship_id=eq.${chatId}`
        },
        async (payload) => {
          const nextRow = payload.new as MessageRow;
          setRawMessages((current) => appendIncomingMessage(current.filter((item) => item.id !== nextRow.id), nextRow, userId));

          if (nextRow.sender_id !== userId) {
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      return;
    }

    const menuRect = contextMenuRef.current.getBoundingClientRect();
    const nextPosition = clampContextMenuPosition(contextMenu.x, contextMenu.y, menuRect.width, menuRect.height);

    if (nextPosition.x !== contextMenu.x || nextPosition.y !== contextMenu.y) {
      setContextMenu((current) =>
        current
          ? {
              ...current,
              x: nextPosition.x,
              y: nextPosition.y
            }
          : current
      );
    }
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
      await deleteMessageForEveryone(supabase, messageId);
      setRawMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                text: "Сообщение удалено",
                type: "text",
                mediaUrl: null,
                replyToMessageId: null,
                deletedForAll: true,
                deletedAt: new Date().toISOString(),
                forwardedFromMessageId: null
              }
            : item
        )
      );
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

  async function handleForwardFromMenu() {
    if (!contextMenu || !session) {
      return;
    }

    const targetMessage = messages.find((item) => item.id === contextMenu.messageId);
    if (!targetMessage) {
      setContextMenu(null);
      return;
    }

    setContextMenu(null);

    try {
      const targets = await listFriends(supabase, session.user.id);
      setForwardState({
        message: targetMessage,
        targets: targets.filter((item) => item.friendshipId !== chatId)
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось открыть пересылку.");
    }
  }

  async function handleForwardSelect(targetFriendshipId: string) {
    if (!session || !forwardState) {
      return;
    }

    setForwarding(true);
    try {
      await forwardMessage(supabase, targetFriendshipId, session.user.id, forwardState.message);
      setForwardState(null);
      setMessage("Сообщение переслано.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось переслать сообщение.");
    } finally {
      setForwarding(false);
    }
  }

  function openFilePicker() {
    setStickersOpen(false);
    fileInputRef.current?.click();
  }

  function openContextMenuAt(x: number, y: number, item: ChatMessage) {
    const nextPosition = clampContextMenuPosition(
      x,
      y,
      CONTEXT_MENU_FALLBACK_WIDTH,
      CONTEXT_MENU_FALLBACK_HEIGHT
    );

    setContextMenu({
      messageId: item.id,
      sender: item.sender,
      x: nextPosition.x,
      y: nextPosition.y,
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
                facingMode: cameraFacingRef.current,
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
        const shouldDiscard = discardRecordingRef.current;
        const shouldRestart = restartVideoNoteRef.current;
        const blob = new Blob(mediaChunksRef.current, {
          type: mediaChunksRef.current[0]?.type || (nextKind === "voice" ? "audio/webm" : "video/webm")
        });
        cleanupRecording();
        recordingKindRef.current = null;
        discardRecordingRef.current = false;
        restartVideoNoteRef.current = false;
        if (shouldRestart) {
          setRecordingSeconds(0);
          setTimeout(() => {
            void startRecording("video-note");
          }, 0);
          return;
        }
        if (!shouldDiscard && blob.size > 0 && nextKind) {
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

  function stopRecording(send = true) {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupRecording();
      setRecordingKind(null);
      return;
    }

    if (!send) {
      discardRecordingRef.current = true;
    }

    setRecordingKind(null);
    recorder.stop();
  }

  function cancelRecording() {
    stopRecording(false);
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

  function toggleMediaMenu() {
    setStickersOpen((current) => !current);
  }

  async function handleVoiceAction() {
    setStickersOpen(false);
    await toggleVoiceRecording();
  }

  async function handleVideoNoteAction() {
    setStickersOpen(false);
    await toggleVideoNoteRecording();
  }

  function handleFileAction() {
    openFilePicker();
  }

  function switchCameraMode() {
    const nextFacing = cameraFacingRef.current === "user" ? "environment" : "user";
    cameraFacingRef.current = nextFacing;
    setCameraFacingMode(nextFacing);

    if (recordingKind === "video-note" && mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      discardRecordingRef.current = true;
      restartVideoNoteRef.current = true;
      setRecordingKind(null);
      mediaRecorderRef.current.stop();
    }
  }

  async function handleCreateArenaInvite() {
    if (!session) {
      return;
    }

    setArenaBusy(true);
    setMessage("");

    try {
      const invite = await createArenaInvite(supabase, chatId);
      setArenaInvite(invite);
      setArenaMenuOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить вызов на арену.");
    } finally {
      setArenaBusy(false);
    }
  }

  async function handleArenaInviteResponse(nextStatus: "accepted" | "declined" | "cancelled") {
    if (!arenaInvite) {
      return;
    }

    setArenaBusy(true);
    setMessage("");

    try {
      const invite = await respondArenaInvite(supabase, arenaInvite.id, nextStatus);
      setArenaInvite(invite);
      if (invite.arenaMatchId) {
        const match = await getArenaMatch(supabase, invite.arenaMatchId);
        setArenaMatch(match);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить приглашение на арену.");
    } finally {
      setArenaBusy(false);
    }
  }

  const isArenaSender = arenaInvite?.senderId === session?.user.id;
  const isArenaRecipient = arenaInvite?.recipientId === session?.user.id;
  const hasArenaMatch = Boolean(arenaInvite?.arenaMatchId);

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
        <div className="tg-context-layer" onClick={() => setContextMenu(null)}>
          <div
            className="tg-context-menu"
            onClick={(event) => event.stopPropagation()}
            ref={contextMenuRef}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button className="tg-context-item" onClick={() => handleReplyFromMenu()} type="button">
              Ответить
            </button>
            <button className="tg-context-item" onClick={() => void handleForwardFromMenu()} type="button">
              Переслать
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
                {deletingMessageId === contextMenu.messageId ? "Удаляем..." : "Удалить у всех"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {forwardState ? (
        <div className="tg-forward-overlay" onClick={() => (forwarding ? undefined : setForwardState(null))} role="dialog">
          <div className="tg-forward-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="tg-forward-head">
              <strong>Переслать сообщение</strong>
              <button className="tg-forward-close" onClick={() => setForwardState(null)} type="button">
                ×
              </button>
            </div>

            <div className="tg-forward-list">
              {forwardState.targets.length === 0 ? (
                <p className="tg-forward-empty">Пока некуда переслать это сообщение.</p>
              ) : (
                forwardState.targets.map((item) => (
                  <button
                    key={item.friendshipId}
                    className="tg-forward-row"
                    disabled={forwarding}
                    onClick={() => void handleForwardSelect(item.friendshipId)}
                    type="button"
                  >
                    <UserAvatar name={item.profile.name} size="sm" src={item.profile.avatar} />
                    <span>{item.profile.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {arenaMenuOpen ? (
        <div className="tg-forward-overlay" onClick={() => (arenaBusy ? undefined : setArenaMenuOpen(false))} role="dialog">
          <div className="tg-forward-sheet tg-arena-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="tg-forward-head">
              <strong>Арена</strong>
              <button className="tg-forward-close" onClick={() => setArenaMenuOpen(false)} type="button">
                ×
              </button>
            </div>

            <div className="tg-arena-sheet-copy">
              <p>Вызови собеседника на дуэль. После принятия приглашения вы оба настроите бойца и начнёте пошаговый бой.</p>
            </div>

            <button className="button button-primary tg-arena-call" disabled={arenaBusy} onClick={() => void handleCreateArenaInvite()} type="button">
              {arenaBusy ? "Отправляем..." : "Вызвать на арену"}
            </button>
          </div>
        </div>
      ) : null}

      {recordingKind === "video-note" ? (
        <div className="tg-video-note-recorder" role="dialog">
          <div className="tg-video-note-recorder-surface">
            <div className="tg-video-note-recorder-head">
              <strong>Запись кружка</strong>
              <span>{formatRecordingTime(recordingSeconds)}</span>
            </div>

            <div className="tg-video-note-recorder-preview">
              <video autoPlay className="tg-video-note-recorder-video" muted playsInline ref={videoPreviewRef} />
              <span className="tg-video-note-recorder-ring" />
            </div>

            <div className="tg-video-note-recorder-actions">
              <button className="tg-video-note-recorder-button" onClick={() => switchCameraMode()} type="button">
                {cameraFacingMode === "user" ? "Задняя камера" : "Фронтальная камера"}
              </button>
              <button className="tg-video-note-recorder-button tg-video-note-recorder-button-muted" onClick={() => cancelRecording()} type="button">
                Отмена
              </button>
              <button className="tg-video-note-recorder-button tg-video-note-recorder-button-primary" onClick={() => stopRecording()} type="button">
                Отправить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="tg-chat-shell">
        <div className="tg-chat-top">
          <div className="tg-chatbar">
            <div className="tg-chatbar-main">
              <Link className="tg-chatbar-back" href="/chats">
                Назад
              </Link>

              <Link className="tg-chatbar-user" href={`/friends/${friend.friendshipId}`}>
                <UserAvatar className="tg-chat-avatar" name={friend.profile.name} size="sm" src={friend.profile.avatar} />
                <div className="tg-chatbar-copy">
                  <strong>{friend.profile.name}</strong>
                  <span>{getPresenceLabel(friend, otherTyping)}</span>
                </div>
              </Link>
            </div>

            <div className="tg-chatbar-actions">
              <span className="tg-chatbar-status">{getPresenceLabel(friend, otherTyping)}</span>
              <Link className="tg-chatbar-profile" href={`/friends/${friend.friendshipId}`}>
                Профиль
              </Link>
            </div>
          </div>

          {arenaInvite ? (
            <div className="tg-arena-banner">
              <div className="tg-arena-banner-copy">
                <strong>
                  {arenaInvite.status === "pending"
                    ? isArenaSender
                      ? "Вызов на арену отправлен"
                      : "Тебя вызвали на арену"
                    : arenaInvite.status === "accepted"
                      ? "Арена готова"
                      : arenaInvite.status === "declined"
                        ? "Вызов на арену отклонён"
                        : "Вызов на арену отменён"}
                </strong>
                <span>
                  {arenaInvite.status === "pending"
                    ? isArenaSender
                      ? "Ждём, пока соперник примет дуэль."
                      : "Прими вызов и подготовь своего бойца."
                    : arenaInvite.status === "accepted"
                      ? arenaMatch?.status === "finished"
                        ? "Бой завершён. Результат всё ещё можно открыть."
                        : "Открой арену и продолжай бой."
                      : "Можно отправить новый вызов в любой момент."}
                </span>
              </div>

              <div className="tg-arena-banner-actions">
                {arenaInvite.status === "pending" && isArenaRecipient ? (
                  <>
                    <button className="tg-arena-inline-action tg-arena-inline-action-primary" disabled={arenaBusy} onClick={() => void handleArenaInviteResponse("accepted")} type="button">
                      Принять
                    </button>
                    <button className="tg-arena-inline-action" disabled={arenaBusy} onClick={() => void handleArenaInviteResponse("declined")} type="button">
                      Отклонить
                    </button>
                  </>
                ) : null}

                {arenaInvite.status === "pending" && isArenaSender ? (
                  <button className="tg-arena-inline-action" disabled={arenaBusy} onClick={() => void handleArenaInviteResponse("cancelled")} type="button">
                    Отменить
                  </button>
                ) : null}

                {arenaInvite.status === "accepted" && hasArenaMatch ? (
                  <Link className="tg-arena-inline-action tg-arena-inline-action-primary" href={`/arena/${arenaInvite.arenaMatchId}`}>
                    Открыть арену
                  </Link>
                ) : null}

                {arenaInvite.status !== "pending" ? (
                  <button className="tg-arena-inline-action" onClick={() => setArenaMenuOpen(true)} type="button">
                    Новая дуэль
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
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
                {item.forwardedFromMessageId ? <div className="tg-bubble-forwarded">Переслано</div> : null}

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
                    <video autoPlay className="tg-bubble-video-note" loop muted playsInline preload="metadata" src={item.mediaUrl} />
                    <span className="tg-video-note-play">▶</span>
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
            <div className="tg-media-panel">
              <div className="tg-media-actions">
                <button className="tg-media-action" onClick={() => handleFileAction()} type="button">
                  <span>🖼</span>
                  <strong>Фото и видео</strong>
                </button>
                <button className="tg-media-action" onClick={() => void handleVoiceAction()} type="button">
                  <span>🎙</span>
                  <strong>Голосовое</strong>
                </button>
                <button className="tg-media-action" onClick={() => void handleVideoNoteAction()} type="button">
                  <span>◉</span>
                  <strong>Кружок</strong>
                </button>
              </div>

              <div className="tg-media-stickers">
                <div className="tg-media-panel-title">Стикеры</div>
                <div className="tg-sticker-grid">
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
              </div>
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

          {recordingKind && recordingKind !== "video-note" ? (
            <div className="tg-recording-bar">
              <div className="tg-recording-copy">
                <strong>{recordingKind === "voice" ? "Идёт запись голосового" : "Идёт запись кружка"}</strong>
                <span>{formatRecordingTime(recordingSeconds)}</span>
              </div>

              <button className="tg-recording-stop" onClick={() => stopRecording()} type="button">
                Отправить
              </button>
              <button className="tg-recording-switch" onClick={() => cancelRecording()} type="button">
                Отмена
              </button>
            </div>
          ) : null}

          <input accept="image/*,video/*" className="tg-file-input" onChange={handleMediaSelect} ref={fileInputRef} type="file" />

          <button
            aria-label="Открыть арену"
            className={`tg-compose-icon tg-compose-swords ${arenaInvite?.status === "pending" ? "tg-compose-icon-active" : ""}`}
            onClick={() => setArenaMenuOpen(true)}
            type="button"
          >
            ⚔
          </button>

          <button
            aria-label="Открыть меню вложений"
            className={`tg-compose-icon ${stickersOpen ? "tg-compose-icon-active" : ""}`}
            onClick={() => toggleMediaMenu()}
            type="button"
          >
            +
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
