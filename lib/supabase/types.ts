import type {
  Capability,
  ChatMessage,
  CommunicationFormat,
  FriendshipGoal,
  FriendRecord,
  FriendRequestDirection,
  FriendRequestRecord,
  Interest,
  PersonalityTag,
  UserTitle,
  UserProfile
} from "@/lib/types";
import { normalizeTitles, resolveActiveTitle } from "@/lib/title-system";

export type ProfileRow = {
  id: string;
  state_id: string;
  amigo_id: string;
  name: string;
  age: number;
  bio: string;
  avatar_url: string;
  interests: string[];
  friendship_goal: FriendshipGoal;
  communication_formats: string[];
  personality_tags: string[];
  icebreaker: string;
  availability: UserProfile["availability"];
  titles: UserTitle[] | null;
  active_title_id: string | null;
  capability_flags: string[];
  coin_balance: number | string;
  created_at: string;
  updated_at: string;
};

export type PublicProfileRow = Omit<ProfileRow, "state_id" | "capability_flags" | "coin_balance">;

export type FriendshipRow = {
  id: string;
  user_one: string;
  user_two: string;
  created_by: string;
  created_at: string;
};

export type FriendshipMemberRow = {
  friendship_id: string;
  user_id: string;
  last_read_at: string | null;
};

export type MessageRow = {
  id: string;
  friendship_id: string;
  sender_id: string;
  body: string;
  message_type: "text" | "image" | "video" | "sticker" | "voice" | "video-note";
  media_url: string | null;
  media_path: string | null;
  reply_to_message_id: string | null;
  created_at: string;
};

export type FriendRequestRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  updated_at: string;
};

export function mapProfileRow(row: ProfileRow): UserProfile {
  const titles = normalizeTitles(row.titles);
  const activeTitle = resolveActiveTitle(titles, row.active_title_id);

  return {
    id: row.id,
    stateId: row.state_id,
    amigoId: row.amigo_id,
    name: row.name,
    age: row.age,
    bio: row.bio,
    avatar: row.avatar_url,
    interests: row.interests as Interest[],
    friendshipGoal: row.friendship_goal,
    communicationFormats: row.communication_formats as CommunicationFormat[],
    personalityTags: row.personality_tags as PersonalityTag[],
    icebreaker: row.icebreaker,
    availability: row.availability,
    titles,
    activeTitleId: activeTitle.id,
    activeTitle,
    capabilityFlags: row.capability_flags as Capability[],
    coinBalance: Number(row.coin_balance ?? 0)
  };
}

export function mapPublicProfileRow(row: PublicProfileRow): UserProfile {
  const titles = normalizeTitles(row.titles);
  const activeTitle = resolveActiveTitle(titles, row.active_title_id);

  return {
    id: row.id,
    stateId: "",
    amigoId: row.amigo_id,
    name: row.name,
    age: row.age,
    bio: row.bio,
    avatar: row.avatar_url,
    interests: row.interests as Interest[],
    friendshipGoal: row.friendship_goal,
    communicationFormats: row.communication_formats as CommunicationFormat[],
    personalityTags: row.personality_tags as PersonalityTag[],
    icebreaker: row.icebreaker,
    availability: row.availability,
    titles,
    activeTitleId: activeTitle.id,
    activeTitle,
    capabilityFlags: [],
    coinBalance: 0
  };
}

export function profileToUpsertRow(profile: UserProfile) {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    bio: profile.bio,
    avatar_url: profile.avatar,
    interests: profile.interests,
    friendship_goal: profile.friendshipGoal,
    communication_formats: profile.communicationFormats,
    personality_tags: profile.personalityTags,
    icebreaker: profile.icebreaker,
    availability: profile.availability,
    active_title_id: profile.activeTitleId
  };
}

export function mapFriendRecord(
  friendship: FriendshipRow,
  profile: UserProfile,
  state?: Partial<Pick<FriendRecord, "unreadCount" | "lastReadAt" | "lastMessage">>
): FriendRecord {
  return {
    friendshipId: friendship.id,
    profile,
    createdAt: friendship.created_at,
    unreadCount: state?.unreadCount ?? 0,
    lastReadAt: state?.lastReadAt ?? null,
    lastMessage: state?.lastMessage ?? null
  };
}

export function mapFriendRequestRecord(
  request: FriendRequestRow,
  direction: FriendRequestDirection,
  profile: UserProfile
): FriendRequestRecord {
  return {
    requestId: request.id,
    direction,
    profile,
    createdAt: request.created_at
  };
}

export function mapMessageRow(row: MessageRow, currentUserId: string): ChatMessage {
  return {
    id: row.id,
    friendshipId: row.friendship_id,
    sender: row.sender_id === currentUserId ? "me" : "them",
    type: row.message_type ?? "text",
    text: row.body,
    mediaUrl: row.media_url,
    sentAt: row.created_at,
    replyToMessageId: row.reply_to_message_id,
    replyPreview: null
  };
}
