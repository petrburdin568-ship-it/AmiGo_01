import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, FriendRecord, FriendRequestRecord, UserProfile } from "@/lib/types";
import {
  type FriendRequestRow,
  type FriendshipRow,
  type MessageRow,
  type ProfileRow,
  type PublicProfileRow,
  mapFriendRecord,
  mapFriendRequestRecord,
  mapMessageRow,
  mapProfileRow,
  mapPublicProfileRow,
  profileToUpsertRow
} from "@/lib/supabase/types";

export async function getProfileByUserId(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function upsertProfile(supabase: SupabaseClient, profile: UserProfile) {
  const row = profileToUpsertRow(profile);

  const { data, error } = await supabase
    .from("profiles")
    .upsert(row)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapProfileRow(data as ProfileRow);
}

export async function setActiveProfileTitle(
  supabase: SupabaseClient,
  titleId: string
) {
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

export async function listDirectoryProfiles(supabase: SupabaseClient, currentUserId: string) {
  const { data, error } = await supabase.rpc("list_directory_profiles", {
    current_actor: currentUserId
  });

  if (error) {
    throw error;
  }

  return (data as PublicProfileRow[]).map(mapPublicProfileRow);
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

export async function requestFriendship(
  supabase: SupabaseClient,
  currentUserId: string,
  friendUserId: string
) {
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

export async function acceptFriendRequest(
  supabase: SupabaseClient,
  requestId: string
) {
  const { data, error } = await supabase.rpc("accept_friend_request", {
    target_request: requestId
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function listFriendRequests(
  supabase: SupabaseClient,
  currentUserId: string
) {
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

  const targetIds = requestRows.map((item) =>
    item.requester_id === currentUserId ? item.recipient_id : item.requester_id
  );

  const { data: profiles, error: profilesError } = await supabase.rpc("get_directory_profiles_by_ids", {
    target_ids: targetIds
  });

  if (profilesError) {
    throw profilesError;
  }

  const profileRows = (profiles ?? []) as PublicProfileRow[];
  const profileMap = new Map(
    profileRows.map((profile) => [profile.id, mapPublicProfileRow(profile)])
  );

  return requestRows
    .map((request) => {
      const targetId = request.requester_id === currentUserId ? request.recipient_id : request.requester_id;
      const profile = profileMap.get(targetId);
      if (!profile) {
        return null;
      }

      return mapFriendRequestRecord(
        request,
        request.recipient_id === currentUserId ? "incoming" : "outgoing",
        profile
      );
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

  const friendIds = friendshipRows.map((item: FriendshipRow) =>
    item.user_one === currentUserId ? item.user_two : item.user_one
  );

  const { data: profiles, error: profilesError } = await supabase
    .rpc("get_directory_profiles_by_ids", {
      target_ids: friendIds
    });

  if (profilesError) {
    throw profilesError;
  }

  const profileRows = (profiles ?? []) as PublicProfileRow[];
  const profileMap = new Map(
    profileRows.map((profile: PublicProfileRow) => [profile.id, mapPublicProfileRow(profile)])
  );

  return friendshipRows
    .map((friendship: FriendshipRow) => {
      const friendId = friendship.user_one === currentUserId ? friendship.user_two : friendship.user_one;
      const profile = profileMap.get(friendId);
      return profile ? mapFriendRecord(friendship, profile) : null;
    })
    .filter((item: FriendRecord | null): item is FriendRecord => item !== null);
}

export async function getFriendshipDetails(
  supabase: SupabaseClient,
  currentUserId: string,
  friendshipId: string
) {
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

  const friendId =
    friendshipRow.user_one === currentUserId ? friendshipRow.user_two : friendshipRow.user_one;
  if (!friendId || (friendshipRow.user_one !== currentUserId && friendshipRow.user_two !== currentUserId)) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .rpc("get_directory_profiles_by_ids", {
      target_ids: [friendId]
    });

  if (profileError) {
    throw profileError;
  }

  const safeProfile = Array.isArray(profile) ? profile[0] : profile;

  if (!safeProfile) {
    return null;
  }

  return mapFriendRecord(friendshipRow, mapPublicProfileRow(safeProfile as PublicProfileRow));
}

export async function listMessages(
  supabase: SupabaseClient,
  friendshipId: string,
  currentUserId: string
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("friendship_id", friendshipId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MessageRow[]).map((row: MessageRow) => mapMessageRow(row, currentUserId));
}

export async function sendMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  text: string
) {
  const { error } = await supabase.from("messages").insert({
    friendship_id: friendshipId,
    sender_id: senderId,
    body: text.trim(),
    message_type: "text",
    media_url: null,
    media_path: null
  });

  if (error) {
    throw error;
  }
}

export async function sendStickerMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  sticker: string
) {
  const { error } = await supabase.from("messages").insert({
    friendship_id: friendshipId,
    sender_id: senderId,
    body: sticker,
    message_type: "sticker",
    media_url: null,
    media_path: null
  });

  if (error) {
    throw error;
  }
}

function buildChatImagePath(friendshipId: string, senderId: string, file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined;
  const safeExtension = extension && extension.length <= 8 ? extension.replace(/[^a-z0-9]/g, "") : "jpg";
  return `${friendshipId}/${senderId}/${Date.now()}-${crypto.randomUUID()}.${safeExtension || "jpg"}`;
}

async function sendMediaMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File,
  type: "image" | "video"
) {
  const path = buildChatImagePath(friendshipId, senderId, file);
  const bucket = supabase.storage.from("chat-media");

  const { error: uploadError } = await bucket.upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || (type === "video" ? "video/mp4" : "image/jpeg"),
    upsert: false
  });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl }
  } = bucket.getPublicUrl(path);

  const { error } = await supabase.from("messages").insert({
    friendship_id: friendshipId,
    sender_id: senderId,
    body: type,
    message_type: type,
    media_url: publicUrl,
    media_path: path
  });

  if (error) {
    throw error;
  }
}

export async function sendImageMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File
) {
  await sendMediaMessage(supabase, friendshipId, senderId, file, "image");
}

export async function sendVideoMessage(
  supabase: SupabaseClient,
  friendshipId: string,
  senderId: string,
  file: File
) {
  await sendMediaMessage(supabase, friendshipId, senderId, file, "video");
}

export async function deleteOwnMessage(
  supabase: SupabaseClient,
  messageId: string
) {
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId);

  if (error) {
    throw error;
  }
}

export function appendIncomingMessage(
  current: ChatMessage[],
  row: MessageRow,
  currentUserId: string
) {
  if (current.some((item) => item.id === row.id)) {
    return current;
  }

  return [...current, mapMessageRow(row, currentUserId)].sort((left, right) =>
    left.sentAt.localeCompare(right.sentAt)
  );
}
