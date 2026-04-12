"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { UserAvatar } from "@/components/user-avatar";
import { showBrowserNotification } from "@/lib/browser-notifications";
import {
  CALL_RINGTONE_CHANGE_EVENT,
  getStoredCallRingtoneVolume,
  getStoredCallVibrationEnabled,
  resolveCallRingtoneSource
} from "@/lib/call-ringtone";
import { listFriendRequests, listFriends } from "@/lib/supabase/queries";
import type { ChatMessageType, FriendRecord, FriendRequestRecord } from "@/lib/types";

type CallRejectReason = "declined" | "busy";

type CallSignalPayload = {
  type: "invite" | "accept" | "reject" | "offer" | "answer" | "ice" | "end";
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  reason?: CallRejectReason;
};

type ActivityToast = {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction?: () => void;
};

type PendingIncomingCall = {
  friendshipId: string;
  friendUserId: string;
  friendName: string;
  friendAvatar: string;
  sessionId: string;
  fromUserId: string;
};

const CALL_SIGNAL_EVENT = "signal";
const ACTIVITY_TOAST_LIMIT = 4;

function describeIncomingMessage(type: ChatMessageType, language: "ru" | "en", body: string) {
  const dictionary: Record<ChatMessageType, string> =
    language === "ru"
      ? {
          text: body,
          image: "Фотография",
          video: "Видео",
          sticker: "Стикер",
          voice: "Голосовое сообщение",
          "video-note": "Кружок"
        }
      : {
          text: body,
          image: "Photo",
          video: "Video",
          sticker: "Sticker",
          voice: "Voice message",
          "video-note": "Video note"
        };

  return dictionary[type];
}

export function GlobalActivity() {
  const { session, supabase } = useAuth();
  const { language } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [toasts, setToasts] = useState<ActivityToast[]>([]);
  const [incomingCall, setIncomingCall] = useState<PendingIncomingCall | null>(null);
  const [ringtoneSrc, setRingtoneSrc] = useState("/sounds/soft-ping-loop.mp3");

  const friendsRef = useRef<FriendRecord[]>([]);
  const knownRequestIdsRef = useRef(new Set<string>());
  const knownMessageIdsRef = useRef(new Set<string>());
  const incomingCallRef = useRef<PendingIncomingCall | null>(null);
  const callChannelsRef = useRef(new Map<string, RealtimeChannel>());
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneCleanupRef = useRef<(() => void) | null>(null);

  const currentUserId = session?.user.id ?? "";
  const activeChatFriendshipId = pathname.startsWith("/chats/") ? pathname.split("/")[2] ?? "" : "";

  const copy = useMemo(
    () =>
      language === "ru"
        ? {
            incomingCallTitle: "Входящий звонок",
            answer: "Ответить",
            decline: "Отклонить",
            openChat: "Открыть чат",
            openRequests: "Открыть заявки",
            newRequestTitle: "Новая заявка в друзья",
            newMessageTitle: "Новое сообщение",
            callMissed: "Звонок завершён",
            callingYou: "звонит тебе",
            sentMessage: "отправил сообщение",
            sentRequest: "хочет добавить тебя в друзья"
          }
        : {
            incomingCallTitle: "Incoming call",
            answer: "Answer",
            decline: "Decline",
            openChat: "Open chat",
            openRequests: "Open requests",
            newRequestTitle: "New friend request",
            newMessageTitle: "New message",
            callMissed: "Call ended",
            callingYou: "is calling you",
            sentMessage: "sent a message",
            sentRequest: "wants to add you"
          },
    [language]
  );

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((item) => item.id !== toastId));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ActivityToast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setToasts((current) => [{ ...toast, id }, ...current].slice(0, ACTIVITY_TOAST_LIMIT));

      window.setTimeout(() => {
        dismissToast(id);
      }, 6400);
    },
    [dismissToast]
  );

  const refreshFriends = useCallback(async () => {
    if (!currentUserId) {
      friendsRef.current = [];
      setFriends([]);
      return [] as FriendRecord[];
    }

    const nextFriends = await listFriends(supabase, currentUserId);
    friendsRef.current = nextFriends;
    setFriends(nextFriends);

    nextFriends.forEach((friend) => {
      if (friend.lastMessage?.id) {
        knownMessageIdsRef.current.add(friend.lastMessage.id);
      }
    });

    return nextFriends;
  }, [currentUserId, supabase]);

  const refreshRequests = useCallback(async () => {
    if (!currentUserId) {
      knownRequestIdsRef.current = new Set();
      return [] as FriendRequestRecord[];
    }

    const requests = await listFriendRequests(supabase, currentUserId);
    knownRequestIdsRef.current = new Set(requests.map((item) => item.requestId));
    return requests;
  }, [currentUserId, supabase]);

  const stopIncomingAlert = useCallback(() => {
    ringtoneAudioRef.current?.pause();
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.currentTime = 0;
    }

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(0);
    }
  }, []);

  const clearIncomingCall = useCallback(() => {
    incomingCallRef.current = null;
    setIncomingCall(null);
    stopIncomingAlert();
  }, [stopIncomingAlert]);

  const showBrowserActivity = useCallback(
    (title: string, body: string, onClick?: () => void, tag?: string) => {
      if (document.visibilityState === "visible") {
        return;
      }

      showBrowserNotification({
        title,
        body,
        onClick,
        tag
      });
    },
    []
  );

  const answerIncomingCall = useCallback(() => {
    const pendingCall = incomingCallRef.current;
    if (!pendingCall) {
      return;
    }

    clearIncomingCall();
    router.push(
      `/chats/${pendingCall.friendshipId}?incomingSessionId=${encodeURIComponent(pendingCall.sessionId)}&incomingFromUserId=${encodeURIComponent(pendingCall.fromUserId)}`
    );
  }, [clearIncomingCall, router]);

  const rejectIncomingCall = useCallback(
    async (reason: CallRejectReason) => {
      const pendingCall = incomingCallRef.current;
      if (!pendingCall || !currentUserId) {
        clearIncomingCall();
        return;
      }

      const channel = callChannelsRef.current.get(pendingCall.friendshipId);

      try {
        if (channel) {
          await channel.send({
            type: "broadcast",
            event: CALL_SIGNAL_EVENT,
            payload: {
              type: "reject",
              sessionId: pendingCall.sessionId,
              fromUserId: currentUserId,
              toUserId: pendingCall.fromUserId,
              reason
            } satisfies CallSignalPayload
          });
        }
      } catch {
        // best effort
      } finally {
        clearIncomingCall();
      }
    },
    [clearIncomingCall, currentUserId]
  );

  useEffect(() => {
    if (!session) {
      friendsRef.current = [];
      setFriends([]);
      setToasts([]);
      clearIncomingCall();
      knownRequestIdsRef.current = new Set();
      knownMessageIdsRef.current = new Set();
      return;
    }

    void refreshFriends().catch(() => undefined);
    void refreshRequests().catch(() => undefined);
  }, [clearIncomingCall, refreshFriends, refreshRequests, session]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let active = true;

    async function syncRingtoneSource() {
      const previousCleanup = ringtoneCleanupRef.current;
      ringtoneCleanupRef.current = null;
      previousCleanup?.();

      const resolved = await resolveCallRingtoneSource();
      if (!active) {
        resolved.revoke?.();
        return;
      }

      ringtoneCleanupRef.current = resolved.revoke ?? null;
      setRingtoneSrc(resolved.src);
    }

    const handleRingtoneChanged = () => {
      void syncRingtoneSource();
    };

    void syncRingtoneSource();
    window.addEventListener(CALL_RINGTONE_CHANGE_EVENT, handleRingtoneChanged);
    window.addEventListener("focus", handleRingtoneChanged);

    return () => {
      active = false;
      window.removeEventListener(CALL_RINGTONE_CHANGE_EVENT, handleRingtoneChanged);
      window.removeEventListener("focus", handleRingtoneChanged);
      const cleanup = ringtoneCleanupRef.current;
      ringtoneCleanupRef.current = null;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const ringtone = ringtoneAudioRef.current;
    if (!ringtone) {
      return;
    }

    ringtone.volume = getStoredCallRingtoneVolume();

    if (!incomingCall) {
      ringtone.pause();
      ringtone.currentTime = 0;
      return;
    }

    ringtone.currentTime = 0;
    void ringtone.play().catch(() => undefined);
  }, [incomingCall, ringtoneSrc]);

  useEffect(() => {
    if (!incomingCall || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }

    if (!getStoredCallVibrationEnabled()) {
      navigator.vibrate(0);
      return;
    }

    const pattern = [300, 180, 300, 900] as const;
    navigator.vibrate(pattern);
    const interval = window.setInterval(() => {
      navigator.vibrate(pattern);
    }, 1680);

    return () => {
      window.clearInterval(interval);
      navigator.vibrate(0);
    };
  }, [incomingCall]);

  useEffect(() => {
    return () => {
      stopIncomingAlert();
      const cleanup = ringtoneCleanupRef.current;
      ringtoneCleanupRef.current = null;
      cleanup?.();
    };
  }, [stopIncomingAlert]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const channel = supabase
      .channel(`global-activity:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async ({ new: row }) => {
        const message = row as {
          id: string;
          friendship_id: string;
          sender_id: string;
          body: string;
          message_type: ChatMessageType;
        };

        if (message.sender_id === currentUserId || knownMessageIdsRef.current.has(message.id)) {
          return;
        }

        knownMessageIdsRef.current.add(message.id);

        const friend =
          friendsRef.current.find((item) => item.friendshipId === message.friendship_id) ??
          (await refreshFriends().catch(() => [] as FriendRecord[])).find((item) => item.friendshipId === message.friendship_id);

        if (!friend || pathname === `/chats/${message.friendship_id}`) {
          return;
        }

        const body = describeIncomingMessage(message.message_type, language, message.body);

        pushToast({
          title: `${copy.newMessageTitle}: ${friend.profile.name}`,
          body,
          actionLabel: copy.openChat,
          onAction: () => {
            router.push(`/chats/${friend.friendshipId}`);
          }
        });

        showBrowserActivity(
          `${copy.newMessageTitle}: ${friend.profile.name}`,
          body,
          () => router.push(`/chats/${friend.friendshipId}`),
          `message-${message.id}`
        );

        void refreshFriends().catch(() => undefined);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void refreshFriends().catch(() => undefined);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "friend_requests" }, async ({ new: row }) => {
        const request = row as {
          id: string;
          recipient_id: string;
          status: string;
        };

        if (request.recipient_id !== currentUserId || request.status !== "pending" || knownRequestIdsRef.current.has(request.id)) {
          return;
        }

        const requests = await listFriendRequests(supabase, currentUserId).catch(() => [] as FriendRequestRecord[]);
        knownRequestIdsRef.current = new Set(requests.map((item) => item.requestId));
        const incomingRequest = requests.find((item) => item.requestId === request.id);

        if (!incomingRequest || pathname === "/requests") {
          return;
        }

        pushToast({
          title: `${copy.newRequestTitle}: ${incomingRequest.profile.name}`,
          body: incomingRequest.profile.amigoId,
          actionLabel: copy.openRequests,
          onAction: () => {
            router.push("/requests");
          }
        });

        showBrowserActivity(
          `${copy.newRequestTitle}: ${incomingRequest.profile.name}`,
          incomingRequest.profile.amigoId,
          () => router.push("/requests"),
          `request-${request.id}`
        );
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [copy.newMessageTitle, copy.newRequestTitle, copy.openChat, copy.openRequests, currentUserId, language, pathname, pushToast, refreshFriends, router, showBrowserActivity, supabase]);

  useEffect(() => {
    callChannelsRef.current.forEach((channel) => {
      void supabase.removeChannel(channel);
    });
    callChannelsRef.current = new Map();

    if (!currentUserId || friends.length === 0) {
      return;
    }

    const channels = friends
      .filter((friend) => friend.friendshipId !== activeChatFriendshipId)
      .map((friend) => {
      const channel = supabase.channel(`global-call:${friend.friendshipId}`, {
        config: {
          broadcast: {
            self: false
          }
        }
      });

      channel
        .on("broadcast", { event: CALL_SIGNAL_EVENT }, async ({ payload }) => {
          const signal = payload as CallSignalPayload;

          if (signal.toUserId !== currentUserId) {
            return;
          }

          if (signal.type === "invite") {
            if (incomingCallRef.current && incomingCallRef.current.sessionId !== signal.sessionId) {
              try {
                await channel.send({
                  type: "broadcast",
                  event: CALL_SIGNAL_EVENT,
                  payload: {
                    type: "reject",
                    sessionId: signal.sessionId,
                    fromUserId: currentUserId,
                    toUserId: signal.fromUserId,
                    reason: "busy"
                  } satisfies CallSignalPayload
                });
              } catch {
                // best effort
              }

              return;
            }

            const nextCall: PendingIncomingCall = {
              friendshipId: friend.friendshipId,
              friendUserId: friend.profile.id,
              friendName: friend.profile.name,
              friendAvatar: friend.profile.avatar,
              sessionId: signal.sessionId,
              fromUserId: signal.fromUserId
            };

            incomingCallRef.current = nextCall;
            setIncomingCall(nextCall);

            pushToast({
              title: `${copy.incomingCallTitle}: ${friend.profile.name}`,
              body: friend.profile.amigoId,
              actionLabel: copy.answer,
              onAction: () => {
                answerIncomingCall();
              }
            });

            showBrowserActivity(
              `${copy.incomingCallTitle}: ${friend.profile.name}`,
              friend.profile.amigoId,
              () => answerIncomingCall(),
              `call-${signal.sessionId}`
            );

            return;
          }

          if (!incomingCallRef.current || incomingCallRef.current.sessionId !== signal.sessionId) {
            return;
          }

          if (signal.type === "reject" || signal.type === "end") {
            clearIncomingCall();
            pushToast({
              title: copy.callMissed,
              body: friend.profile.name,
              actionLabel: copy.openChat,
              onAction: () => {
                router.push(`/chats/${friend.friendshipId}`);
              }
            });
          }
        })
        .subscribe();

      callChannelsRef.current.set(friend.friendshipId, channel);
      return channel;
    });

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
      callChannelsRef.current = new Map();
    };
  }, [activeChatFriendshipId, answerIncomingCall, clearIncomingCall, copy.answer, copy.callMissed, copy.incomingCallTitle, copy.openChat, currentUserId, friends, pushToast, router, showBrowserActivity, supabase]);

  if (!session) {
    return null;
  }

  return (
    <>
      <audio hidden loop preload="auto" ref={ringtoneAudioRef} src={ringtoneSrc} />

      {toasts.length > 0 ? (
        <div className="tg-activity-stack" role="status">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast-panel tg-activity-toast">
              <div className="tg-activity-toast-copy">
                <strong>{toast.title}</strong>
                <span>{toast.body}</span>
              </div>

              <div className="tg-activity-toast-actions">
                {toast.onAction ? (
                  <button
                    className="tg-activity-toast-button tg-activity-toast-button-primary"
                    onClick={() => {
                      toast.onAction?.();
                      dismissToast(toast.id);
                    }}
                    type="button"
                  >
                    {toast.actionLabel}
                  </button>
                ) : null}
                <button className="tg-activity-toast-button" onClick={() => dismissToast(toast.id)} type="button">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {incomingCall ? (
        <div className="tg-call-overlay" role="dialog">
          <div className="tg-call-card tg-global-call-card">
            <div className="tg-call-card-avatar">
              <UserAvatar name={incomingCall.friendName} size="lg" src={incomingCall.friendAvatar} />
            </div>

            <div className="tg-call-card-copy">
              <strong>{incomingCall.friendName}</strong>
              <span>{copy.incomingCallTitle}</span>
            </div>

            <div className="tg-call-card-actions">
              <button className="tg-call-action tg-call-action-muted" onClick={() => void rejectIncomingCall("declined")} type="button">
                {copy.decline}
              </button>
              <button className="tg-call-action tg-call-action-primary" onClick={answerIncomingCall} type="button">
                {copy.answer}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
