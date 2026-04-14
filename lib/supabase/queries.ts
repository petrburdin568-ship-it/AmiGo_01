import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArenaAction,
  ArenaAppearance,
  ArenaWeapon,
  ChatMessage,
  FriendRecord,
  FriendRequestRecord,
  UserProfile
} from "@/lib/types";
import {
  type ArenaInviteRow,
  type ArenaMatchRow,
  type FriendRequestRow,
  type FriendshipMemberRow,
  type FriendshipRow,
  type MessageRow,
  type ProfileRow,
  type PublicProfileRow,
  type UserPresenceRow,
  mapArenaInviteRow,
  mapArenaMatchRow,
  mapFriendRecord,
  mapFriendRequestRecord,
  mapMessageRow,
  mapPresenceRow,
  mapProfileRow,
  mapPublicProfileRow,
  profileToUpsertRow
} from "@/lib/supabase/types";

export async function getProfileByUserId(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function upsertProfile(supabase: SupabaseClient, profile: UserProfile) {
  const row = profileToUpsertRow(profile);

  const { data, error } = await supabase.from("profiles").upsert(row).select("*").single();

  if (error) {
    throw error;
  }

  return mapProfileRow(data as ProfileRow);
}

export async function setActiveProfileTitle(supabase: SupabaseClient, titleId: string) {
  const { data, error } = await supabase.rpc("set_active_profile_title", {
    next_title_id: titleId
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function setCustomTitle(
  supabase: SupabaseClient,
  targetUserId: string,
  titleText: string,
  titleIcon = "IMP",
  titleTone = "gold"
) {
  const { data, error } = await supabase.rpc("set_custom_title", {
    target_user: targetUserId,
    next_title_text: titleText.trim(),
    next_title_icon: titleIcon.trim(),
    next_title_tone: titleTone
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function getProfileByAmigoId(supabase: SupabaseClient, amigoId: string) {
  const { data, error } = await supabase.rpc("get_directory_profile_by_amigo_id", {
    target_amigo_id: amigoId.trim().toUpperCase()
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapPublicProfileRow(row as PublicProfileRow) : null;
}

export async function requestFriendship(supabase: SupabaseClient, currentUserId: string, friendUserId: string) {
  const { data, error } = await supabase.rpc("request_friendship", {
    target_user: friendUserId
  });

  if (error) {
    throw error;
  }

  return data as {
    request_id: string | null;
    became_friends: boolean;
    friendship_id: string | null;
  };
}

export async function acceptFriendRequest(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase.rpc("accept_friend_request", {
    target_request: requestId
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function listFriendRequests(supabase: SupabaseClient, currentUserId: string) {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("status", "pending")
    .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const requestRows = (data ?? []) as FriendRequestRow[];

  if (requestRows.length === 0) {
    return [] as FriendRequestRecord[];
  }

  const targetIds = requestRows.map((item) => (item.requester_id === currentUserId ? item.recipient_id : item.requester_id));

  const { data: profiles, error: profilesError } = await supabase.rpc("get_directory_profiles_by_ids", {
    target_ids: targetIds
  });

  if (profilesError) {
    throw profilesError;
  }

  const profileRows = (profiles ?? []) as PublicProfileRow[];
  const profileMap = new Map(profileRows.map((profile) => [profile.id, mapPublicProfileRow(profile)]));

  return requestRows
    .map((request) => {
      const targetId = request.requester_id === currentUserId ? request.recipient_id : request.requester_id;
      const profile = profileMap.get(targetId);
      if (!profile) {
        return null;
      }

      return mapFriendRequestRecord(request, request.recipient_id === currentUserId ? "incoming" : "outgoing", profile);
    })
    .filter((item): item is FriendRequestRecord => item !== null);
}

export async function listFriends(supabase: SupabaseClient, currentUserId: string) {
  const { data: friendships, error: friendshipsError } = await supabase
    .from("friendships")
    .select("*")
    .or(`user_one.eq.${currentUserId},user_two.eq.${currentUserId}`)
    .order("created_at", { ascending: false });

  if (friendshipsError) {
    throw friendshipsError;
  }

  const friendshipRows = (friendships ?? []) as FriendshipRow[];

  if (friendshipRows.length === 0) {
    return [] as FriendRecord[];
  }

  const friendshipIds = friendshipRows.map((item) => item.id);
  const friendIds = friendshipRows.map((item) => (item.user_one === currentUserId ? item.user_two : item.user_one));

  const [
    { data: profiles, error: profilesError },
    { data: memberRows, error: membersError },
    { data: messageRows, error: messagesError },
    { data: presenceRows, error: presenceError }
  ] =
    await Promise.all([
      supabase.rpc("get_directory_profiles_by_ids", { target_ids: friendIds }),
      supabase
        .from("friendship_members")
        .select("*")
        .eq("user_id", currentUserId)
        .in("friendship_id", friendshipIds),
      supabase
        .from("messages")
        .select("*")
        .in("friendship_id", friendshipIds)
        .order("created_at", { ascending: false }),
      supabase.from("user_presence").select("*").in("user_id", friendIds)
    ]);

  if (profilesError) {
    throw profilesError;
  }

  if (membersError) {
    throw membersError;
  }

  if (messagesError) {
    throw messagesError;
  }

  if (presenceError) {
    throw presenceError;
  }

  const profileMap = new Map(((profiles ?? []) as PublicProfileRow[]).map((profile) => [profile.id, mapPublicProfileRow(profile)]));
  const memberMap = new Map(((memberRows ?? []) as FriendshipMemberRow[]).map((item) => [item.friendship_id, item]));
  const presenceMap = new Map(((presenceRows ?? []) as UserPresenceRow[]).map((item) => [item.user_id, mapPresenceRow(item)]));
  const messagesByFriendship = new Map<string, MessageRow[]>();

  for (const row of (messageRows ?? []) as MessageRow[]) {
    const current = messagesByFriendship.get(row.friendship_id) ?? [];
    current.push(row);
    messagesByFriendship.set(row.friendship_id, current);
  }

  return friendshipRows
    .map((friendship) => {
      const friendId = friendship.user_one === currentUserId ? friendship.user_two : friendship.user_one;
      const profile = profileMap.get(friendId);
      if (!profile) {
        return null;
      }

      const memberState = memberMap.get(friendship.id);
      const rows = messagesByFriendship.get(friendship.id) ?? [];
      const latest = rows[0];
      const lastReadAt = memberState?.last_read_at ?? null;
      const unreadCount = rows.filter((row) => row.sender_id !== currentUserId && (!lastReadAt || row.created_at > lastReadAt)).length;

      return mapFriendRecord(friendship, profile, {
        lastReadAt,
        unreadCount,
        presence: presenceMap.get(friendId),
        lastMessage: latest
          ? {
              id: latest.id,
              sender: latest.sender_id === currentUserId ? "me" : "them",
              type: latest.message_type,
              text: latest.body,
              mediaUrl: latest.media_url,
              sentAt: latest.created_at
            }
          : null
      });
    })
    .filter((item: FriendRecord | null): item is FriendRecord => item !== null);
}

export async function getFriendshipDetails(supabase: SupabaseClient, currentUserId: string, friendshipId: string) {
  const { data: friendship, error: friendshipError } = await supabase
    .from("friendships")
    .select("*")
    .eq("id", friendshipId)
    .maybeSingle();

  if (friendshipError) {
    throw friendshipError;
  }

  const friendshipRow = friendship as FriendshipRow | null;

  if (!friendshipRow) {
    return null;
  }

  const friendId = friendshipRow.user_one === currentUserId ? friendshipRow.user_two : friendshipRow.user_one;
  if (!friendId || (friendshipRow.user_one !== currentUserId && friendshipRow.user_two !== currentUserId)) {
    return null;
  }

  const [
    { data: profile, error: profileError },
    { data: memberState, error: memberError },
    { data: latestMessage, error: latestMessageError },
    { data: presenceRow, error: presenceError }
  ] =
    await Promise.all([
      supabase.rpc("get_directory_profiles_by_ids", {
        target_ids: [friendId]
      }),
      supabase
        .from("friendship_members")
        .select("*")
        .eq("friendship_id", friendshipId)
        .eq("user_id", currentUserId)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("*")
        .eq("friendship_id", friendshipId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("user_presence").select("*").eq("user_id", friendId).maybeSingle()
    ]);

  if (profileError) {
    throw profileError;
  }

  if (memberError) {
    throw memberError;
  }

  if (latestMessageError) {
    throw latestMessageError;
  }

  if (presenceError) {
    throw presenceError;
  }

  const safeProfile = Array.isArray(profile) ? profile[0] : profile;

  if (!safeProfile) {
    return null;
  }

  return mapFriendRecord(friendshipRow, mapPublicProfileRow(safeProfile as PublicProfileRow), {
    lastReadAt: (memberState as FriendshipMemberRow | null)?.last_read_at ?? null,
    unreadCount: 0,
    presence: mapPresenceRow((presenceRow as UserPresenceRow | null) ?? null),
    lastMessage: latestMessage
      ? {
          id: (latestMessage as MessageRow).id,
          sender: (latestMessage as MessageRow).sender_id === currentUserId ? "me" : "them",
          type: (latestMessage as MessageRow).message_type,
          text: (latestMessage as MessageRow).body,
          mediaUrl: (latestMessage as MessageRow).media_url,
          sentAt: (latestMessage as MessageRow).created_at
        }
      : null
  });
}

function enrichReplies(messages: ChatMessage[]) {
  const messageMap = new Map(messages.map((item) => [item.id, item]));

  return messages.map((item) => ({
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
}

export async function listMessages(supabase: SupabaseClient, friendshipId: string, currentUserId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("friendship_id", friendshipId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return enrichReplies(((data ?? []) as MessageRow[]).map((row) => mapMessageRow(row, currentUserId)));
}

type SendMessageOptions = {
  replyToMessageId?: string | null;
};

export async function sendMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  text: string,
  options: SendMessageOptions = {}
) {
  const { error } = await supabase.from("messages").insert({
    friendship_id: friendshipId,
    sender_id: senderId,
    body: text.trim(),
    message_type: "text",
    media_url: null,
    media_path: null,
    reply_to_message_id: options.replyToMessageId ?? null
  });

  if (error) {
    throw error;
  }
}

async function insertMessageRow(
  supabase: SupabaseClient,
  row: {
    friendship_id: string;
    sender_id: string;
    body: string;
    message_type: MessageRow["message_type"];
    media_url: string | null;
    media_path: string | null;
    reply_to_message_id: string | null;
    forwarded_from_message_id?: string | null;
  }
) {
  const { error } = await supabase.from("messages").insert(row);

  if (error) {
    throw error;
  }
}

export async function sendStickerMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  sticker: string,
  options: SendMessageOptions = {}
) {
  await insertMessageRow(supabase, {
    friendship_id: friendshipId,
    sender_id: senderId,
    body: sticker,
    message_type: "sticker",
    media_url: null,
    media_path: null,
    reply_to_message_id: options.replyToMessageId ?? null
  });
}

function inferMediaExtension(type: "image" | "video" | "voice" | "video-note", file: File) {
  const originalExtension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined;
  const safeOriginal = originalExtension && originalExtension.length <= 8 ? originalExtension.replace(/[^a-z0-9]/g, "") : "";

  if (safeOriginal) {
    return safeOriginal;
  }

  if (type === "image") {
    return "jpg";
  }

  if (file.type.includes("webm")) {
    return "webm";
  }

  if (file.type.includes("ogg")) {
    return "ogg";
  }

  if (file.type.includes("mp4")) {
    return "mp4";
  }

  if (type === "voice") {
    return "webm";
  }

  return "mp4";
}

function buildChatMediaPath(friendshipId: string, senderId: string, file: File, type: "image" | "video" | "voice" | "video-note") {
  const extension = inferMediaExtension(type, file);
  return `${friendshipId}/${senderId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

async function sendMediaMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File,
  type: "image" | "video" | "voice" | "video-note",
  options: SendMessageOptions = {}
) {
  const path = buildChatMediaPath(friendshipId, senderId, file, type);
  const bucket = supabase.storage.from("chat-media");
  const fallbackContentType =
    type === "image"
      ? "image/jpeg"
      : type === "voice"
        ? "audio/webm"
        : "video/webm";

  const { error: uploadError } = await bucket.upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || fallbackContentType,
    upsert: false
  });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl }
  } = bucket.getPublicUrl(path);

  await insertMessageRow(supabase, {
    friendship_id: friendshipId,
    sender_id: senderId,
    body: type,
    message_type: type,
    media_url: publicUrl,
    media_path: path,
    reply_to_message_id: options.replyToMessageId ?? null
  });
}

export async function sendImageMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File,
  options: SendMessageOptions = {}
) {
  await sendMediaMessage(supabase, friendshipId, senderId, file, "image", options);
}

export async function sendVideoMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File,
  options: SendMessageOptions = {}
) {
  await sendMediaMessage(supabase, friendshipId, senderId, file, "video", options);
}

export async function sendVoiceMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File,
  options: SendMessageOptions = {}
) {
  await sendMediaMessage(supabase, friendshipId, senderId, file, "voice", options);
}

export async function sendVideoNoteMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File,
  options: SendMessageOptions = {}
) {
  await sendMediaMessage(supabase, friendshipId, senderId, file, "video-note", options);
}

export async function markFriendshipRead(supabase: SupabaseClient, friendshipId: string) {
  const { data, error } = await supabase.rpc("mark_friendship_read", {
    target_friendship: friendshipId
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function deleteMessageForEveryone(supabase: SupabaseClient, messageId: string) {
  const { data, error } = await supabase.rpc("delete_message_for_everyone", {
    target_message: messageId
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function touchPresence(supabase: SupabaseClient, isOnline = true) {
  const { error } = await supabase.rpc("touch_presence", {
    next_online: isOnline
  });

  if (error) {
    throw error;
  }
}

export async function forwardMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  message: ChatMessage
) {
  if (message.deletedForAll) {
    throw new Error("Удалённое сообщение нельзя переслать.");
  }

  await insertMessageRow(supabase, {
    friendship_id: friendshipId,
    sender_id: senderId,
    body: message.text,
    message_type: message.type,
    media_url: message.mediaUrl,
    media_path: null,
    reply_to_message_id: null,
    forwarded_from_message_id: message.id
  });
}

export async function getLatestArenaInvite(supabase: SupabaseClient, friendshipId: string) {
  const { data, error } = await supabase
    .from("arena_invites")
    .select("*")
    .eq("friendship_id", friendshipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapArenaInviteRow(data as ArenaInviteRow) : null;
}

export async function createArenaInvite(supabase: SupabaseClient, friendshipId: string) {
  const { data, error } = await supabase.rpc("create_arena_invite", {
    target_friendship: friendshipId
  });

  if (error) {
    throw error;
  }

  return mapArenaInviteRow(data as ArenaInviteRow);
}

export async function respondArenaInvite(
  supabase: SupabaseClient,
  inviteId: string,
  nextStatus: "accepted" | "declined" | "cancelled"
) {
  const { data, error } = await supabase.rpc("respond_arena_invite", {
    target_invite: inviteId,
    next_status: nextStatus
  });

  if (error) {
    throw error;
  }

  return mapArenaInviteRow(data as ArenaInviteRow);
}

export async function getArenaMatch(supabase: SupabaseClient, matchId: string) {
  const { data, error } = await supabase.from("arena_matches").select("*").eq("id", matchId).maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapArenaMatchRow(data as ArenaMatchRow) : null;
}

export async function saveArenaLoadout(
  supabase: SupabaseClient,
  matchId: string,
  appearance: ArenaAppearance,
  weapon: ArenaWeapon
) {
  const { data, error } = await supabase.rpc("submit_arena_loadout", {
    target_match: matchId,
    next_appearance: appearance,
    next_weapon: weapon
  });

  if (error) {
    throw error;
  }

  return mapArenaMatchRow(data as ArenaMatchRow);
}

export async function performArenaAction(supabase: SupabaseClient, matchId: string, nextAction: ArenaAction) {
  const { data, error } = await supabase.rpc("perform_arena_action", {
    target_match: matchId,
    next_action: nextAction
  });

  if (error) {
    throw error;
  }

  return mapArenaMatchRow(data as ArenaMatchRow);
}

export function appendIncomingMessage(current: ChatMessage[], row: MessageRow, currentUserId: string) {
  if (current.some((item) => item.id === row.id)) {
    return current;
  }

  const next = [...current, mapMessageRow(row, currentUserId)].sort((left, right) => left.sentAt.localeCompare(right.sentAt));
  return enrichReplies(next);
}
