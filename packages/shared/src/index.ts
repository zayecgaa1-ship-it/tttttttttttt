export const ZARK_IDENTITY = {
  name: "Zark LFG System",
  tagline: process.env.ZARK_TAGLINE ?? "Zark LFG System — فريقك أقرب مما تتخيل",
} as const;

export type LiveRoom = {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatarUrl?: string;
  lfgGameId: string;
  gameSlug: string;
  gameName: string;
  gameIcon?: string;
  title?: string;
  status: "SCHEDULED" | "OPEN" | "FULL" | "ACTIVE" | "COMPLETED" | "CLOSED";
  currentPlayers: number;
  maxPlayers: number;
  durationMinutes: number;
  createdAt: string;
  scheduledFor?: string;
  readyNotifiedAt?: string;
  reminderDeliveredAt?: string;
  startedAt?: string;
  playEndsAt?: string;
  completedAt?: string;
  autoDeleteAt?: string;
  needsVoice: boolean;
  locked: boolean;
  roomEmoji?: string;
  accentColor: string;
  gameMode?: string;
  mapName?: string;
  description?: string;
  textChannelId?: string;
  voiceChannelId?: string;
  categoryId?: string;
  controlMessageId?: string;
  listingChannelId?: string;
  listingMessageId?: string;
  members: Array<{ id: string; displayName: string; avatarUrl?: string; voiceActive: boolean; voiceSeconds: number }>;
};

export type DailyChallenge = {
  id: string;
  gameSlug: string;
  gameName: string;
  prompt: string;
  basePoints: number;
  startedAt: string;
  endsAt: string;
};

export type ZarkGameSummary = {
  slug: string;
  name: string;
  description?: string;
  kind: "RACE" | "DUEL" | "CHAIN" | "POLL";
  enabled: boolean;
  icon?: string;
  category: string;
  aliases: string[];
};

export type LfgGameSummary = {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  category?: string;
};

export type GuildRuntimeSettings = {
  guildId: string;
  botName: string;
  tagline: string;
  lfgChannelId?: string;
  lfgCategoryId?: string;
  publicChannelId?: string;
  dailyChannelId?: string;
  leaderboardChannelId?: string;
  reportChannelId?: string;
  websiteUrl: string;
  dmNotificationsEnabled: boolean;
  quickMatchEnabled: boolean;
  ratingsEnabled: boolean;
  reportsEnabled: boolean;
  autoCreateRoomChannels: boolean;
  maxDmPerDay: number;
  notificationCooldownMinutes: number;
  maxActiveRoomsPerUser: number;
  defaultRoomDurationMinutes: number;
  roomGraceMinutes: number;
  aiChatEnabled: boolean;
  aiDailyMessagesPerUser: number;
  aiGlobalDailyMessages: number;
  aiDailyTokenBudgetPerUser: number;
  aiGlobalDailyTokenBudget: number;
  aiMaxOutputTokens: number;
};

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  gamePoints: number;
  engagementPoints: number;
  xp: number;
  wins: number;
};

export type ZarkEvent =
  | { type: "zark.match_started"; matchId: string; seriesId: string; gameSlug: string; channelId?: string; roundNumber: number; totalRounds: number }
  | { type: "zark.match_answered"; matchId: string; userId: string; displayName: string; points: number; rank: number }
  | { type: "zark.series_completed"; seriesId: string; channelId?: string; totalRounds: number }
  | { type: "daily.answer"; userId: string; displayName: string; points: number }
  | { type: "leaderboard.updated" }
  | { type: "lfg.created"; room: LiveRoom }
  | { type: "lfg.updated"; room: LiveRoom }
  | { type: "lfg.member_joined"; room: LiveRoom }
  | { type: "lfg.member_left"; room: LiveRoom; userId: string }
  | { type: "lfg.room_created"; room: LiveRoom }
  | { type: "lfg.room_ready"; room: LiveRoom }
  | { type: "lfg.started"; room: LiveRoom }
  | { type: "lfg.voice_joined"; room: LiveRoom; userId: string }
  | { type: "lfg.voice_left"; room: LiveRoom; userId: string }
  | { type: "lfg.host_changed"; roomId: string; previousHostId: string; newHostId: string }
  | { type: "lfg.completed"; roomId: string; room: LiveRoom }
  | { type: "lfg.closed"; roomId: string; room: LiveRoom }
  | { type: "user.interest_changed"; userId: string; gameSlug: string; interested: boolean; notificationsEnabled: boolean }
  | { type: "user.notification_changed"; userId: string; gameSlug: string; notificationsEnabled: boolean }
  | { type: "rating.created"; roomId: string; raterId: string; ratedId: string; stars: number }
  | { type: "report.created"; reportId: string; reportKind: "PLAYER" | "BUG"; reporterId: string; reportedId?: string }
  | { type: "report.message_created"; reportId: string; reportKind: "PLAYER" | "BUG"; authorId: string; recipientId?: string; authorRole: "USER" | "ADMIN" }
  | { type: "report.status_changed"; reportId: string; reportKind: "PLAYER" | "BUG"; adminId: string; status: string; reporterId?: string }
  | { type: "report.deleted"; reportId: string; reportKind: "PLAYER" | "BUG"; adminId: string }
  | { type: "guild.settings_updated"; adminId: string; settings: GuildRuntimeSettings };

export type DomainEventEnvelope = {
  eventId: string;
  eventType: ZarkEvent["type"];
  version: 1;
  timestamp: string;
  guildId: string;
  actorId?: string;
  resourceId: string;
  payload: ZarkEvent;
};
