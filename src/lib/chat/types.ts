// Types shared by the chat server functions and the chat screens. No code that
// touches the database or Node lives here, so client files can import it freely.

export type ChatRole = "owner" | "manager" | "technician";

export type ChatPerson = {
  id: string;
  name: string;
  role: ChatRole;
  /** What the buddy list shows next to the name. */
  title: string;
  shopId: string;
  shopName: string;
};

export type ChatMe = {
  personId: string;
  name: string;
  title: string;
  role: ChatRole;
};

export type ChatRoomInfo = {
  id: string;
  kind: "channel" | "group" | "dm";
  name: string;
  audience: "everyone" | "managers" | "members";
  /** Person ids in a group or direct message. Empty for channels. */
  members: string[];
  unread: number;
  muted: boolean;
  canPost: boolean;
  last: { id: number; authorId: string; text: string; photo: boolean; at: string } | null;
};

export type ChatMessageInfo = {
  id: number;
  roomId: string;
  authorId: string;
  body: string;
  photoId: string | null;
  photoState: "none" | "ok" | "expired";
  createdAt: string;
  /** Hidden by its author. Only Darin and Arun ever receive the original text. */
  deleted: boolean;
  deletedBy: string | null;
  deletedAt: string | null;
  kept: boolean;
};

export type ChatState = "online" | "offline" | "under_car" | "with_client";

export type ChatPresence = Record<string, { state: ChatState; away: string }>;

export type ChatSettings = {
  meetUrl: string;
  pushPreview: "full" | "neutral";
  everyone: boolean;
  access: string[];
};

export type ChatStatus =
  | { allowed: false }
  | { allowed: true; me: ChatMe };

export type ChatBootstrap = {
  me: ChatMe;
  people: ChatPerson[];
  rooms: ChatRoomInfo[];
  presence: ChatPresence;
  avatars: Record<string, string>;
  meetUrl: string;
  vapidPublicKey: string;
  serverTime: string;
};

export type ChatPollInput = {
  roomId: string | null;
  after: number;
  since: string | null;
};

export type ChatPollResult = {
  rooms: ChatRoomInfo[];
  presence: ChatPresence;
  messages: ChatMessageInfo[];
  /** Messages that changed since the last poll (hidden by their author). */
  changed: ChatMessageInfo[];
  typing: string[];
  avatarStamp: string;
  meetUrl: string;
  serverTime: string;
};
