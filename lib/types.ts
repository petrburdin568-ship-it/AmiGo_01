export type FriendshipGoal =
  | "casual-talk"
  | "deep-friendship"
  | "free-time-company"
  | "shared-hobbies-online";

export type CommunicationFormat =
  | "text-only"
  | "text-and-voice"
  | "sometimes-calls"
  | "not-daily"
  | "active-chat";

export type PersonalityTag =
  | "calm"
  | "social"
  | "introvert"
  | "extrovert"
  | "funny"
  | "deep-talks"
  | "light-talks";

export type TitleCategory = "system" | "admin";

export type TitleTone = "silver" | "gold" | "cyan" | "royal";

export type Capability = "title_grantor" | "infinite_wealth" | "ban_hammer";

export type UserTitle = {
  id: string;
  text: string;
  category: TitleCategory;
  icon: string;
  tone: TitleTone;
  locked: boolean;
  grantedBy: string | null;
  description: string | null;
  acquiredAt: string | null;
};

export type UserAccessProfile = {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  immuneToRestrictions: boolean;
  capabilities: Capability[];
  canGrantCustomTitles: boolean;
  canTerminateSession: boolean;
  hasInfiniteWealth: boolean;
  resolvedCoinBalance: number;
};

export type UserProfile = {
  id: string;
  stateId: string;
  amigoId: string;
  name: string;
  age: number;
  bio: string;
  avatar: string;
  friendshipGoal: FriendshipGoal;
  communicationFormats: CommunicationFormat[];
  personalityTags: PersonalityTag[];
  icebreaker: string;
  availability: "slow-replies" | "active-now" | "late-evenings";
  titles: UserTitle[];
  activeTitleId: string | null;
  activeTitle: UserTitle;
  capabilityFlags: Capability[];
  coinBalance: number;
};

export type ChatMessageType = "text" | "image" | "video" | "sticker" | "voice" | "video-note";

export type ChatMessageReply = {
  id: string;
  sender: "me" | "them";
  type: ChatMessageType;
  text: string;
  mediaUrl: string | null;
  sentAt: string;
};

export type FriendPresence = {
  isOnline: boolean;
  lastSeenAt: string | null;
};

export type FriendRecord = {
  friendshipId: string;
  profile: UserProfile;
  createdAt: string;
  unreadCount: number;
  lastReadAt: string | null;
  presence: FriendPresence;
  lastMessage: {
    id: string;
    sender: "me" | "them";
    type: ChatMessageType;
    text: string;
    mediaUrl: string | null;
    sentAt: string;
  } | null;
};

export type FriendRequestDirection = "incoming" | "outgoing";

export type FriendRequestRecord = {
  requestId: string;
  direction: FriendRequestDirection;
  profile: UserProfile;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  friendshipId: string;
  sender: "me" | "them";
  type: ChatMessageType;
  text: string;
  mediaUrl: string | null;
  sentAt: string;
  replyToMessageId: string | null;
  replyPreview: ChatMessageReply | null;
  deletedForAll: boolean;
  deletedAt: string | null;
  forwardedFromMessageId: string | null;
};
