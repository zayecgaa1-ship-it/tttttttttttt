--
-- PostgreSQL database dump
--

\restrict ugOSSPUD2xyxur7gLZCgjLIcha3X2Flm1M3I2BKrLXtlmq3b2yzIducm96ddb2a

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AvailabilityActivity; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AvailabilityActivity" AS ENUM (
    'FREE',
    'PLAYING',
    'STUDYING',
    'WORKING',
    'BUSY',
    'AWAY'
);


ALTER TYPE public."AvailabilityActivity" OWNER TO postgres;

--
-- Name: BugReportStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BugReportStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED'
);


ALTER TYPE public."BugReportStatus" OWNER TO postgres;

--
-- Name: GameInterestStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."GameInterestStatus" AS ENUM (
    'INTERESTED',
    'NOT_INTERESTED'
);


ALTER TYPE public."GameInterestStatus" OWNER TO postgres;

--
-- Name: LfgMemberStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."LfgMemberStatus" AS ENUM (
    'ACTIVE',
    'LEFT',
    'COMPLETED',
    'KICKED'
);


ALTER TYPE public."LfgMemberStatus" OWNER TO postgres;

--
-- Name: MatchStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."MatchStatus" AS ENUM (
    'OPEN',
    'COMPLETED',
    'EXPIRED',
    'CANCELLED'
);


ALTER TYPE public."MatchStatus" OWNER TO postgres;

--
-- Name: MentionPolicy; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."MentionPolicy" AS ENUM (
    'EVERYONE',
    'INTERESTED_ONLY',
    'NOBODY'
);


ALTER TYPE public."MentionPolicy" OWNER TO postgres;

--
-- Name: NotificationDeliveryStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."NotificationDeliveryStatus" AS ENUM (
    'RESERVED',
    'SENT',
    'IGNORED',
    'FAILED'
);


ALTER TYPE public."NotificationDeliveryStatus" OWNER TO postgres;

--
-- Name: QuestionMediaType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."QuestionMediaType" AS ENUM (
    'TEXT',
    'IMAGE'
);


ALTER TYPE public."QuestionMediaType" OWNER TO postgres;

--
-- Name: ReportStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ReportStatus" AS ENUM (
    'PENDING',
    'REVIEWED',
    'RESOLVED',
    'REJECTED',
    'DISMISSED'
);


ALTER TYPE public."ReportStatus" OWNER TO postgres;

--
-- Name: RoomStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."RoomStatus" AS ENUM (
    'OPEN',
    'FULL',
    'ACTIVE',
    'COMPLETED',
    'CLOSED',
    'SCHEDULED'
);


ALTER TYPE public."RoomStatus" OWNER TO postgres;

--
-- Name: ZarkGameKind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ZarkGameKind" AS ENUM (
    'RACE',
    'DUEL',
    'CHAIN',
    'POLL'
);


ALTER TYPE public."ZarkGameKind" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AiUsageDaily; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AiUsageDaily" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "dayKey" text NOT NULL,
    "requestCount" integer DEFAULT 0 NOT NULL,
    "inputTokens" integer DEFAULT 0 NOT NULL,
    "outputTokens" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "reservedTokens" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."AiUsageDaily" OWNER TO postgres;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "adminId" text NOT NULL,
    action text NOT NULL,
    "targetId" text,
    details jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO postgres;

--
-- Name: BotIdentity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BotIdentity" (
    id integer DEFAULT 1 NOT NULL,
    name text DEFAULT 'Zark LFG System'::text NOT NULL,
    tagline text DEFAULT 'Zark LFG System — فريقك أقرب مما تتخيل'::text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."BotIdentity" OWNER TO postgres;

--
-- Name: BugReport; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BugReport" (
    id text NOT NULL,
    "reporterId" text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    context text,
    status public."BugReportStatus" DEFAULT 'OPEN'::public."BugReportStatus" NOT NULL,
    "resolvedBy" text,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."BugReport" OWNER TO postgres;

--
-- Name: DailyAnswer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."DailyAnswer" (
    id text NOT NULL,
    "challengeId" text NOT NULL,
    "userId" text NOT NULL,
    rank integer NOT NULL,
    "elapsedMs" integer NOT NULL,
    points integer NOT NULL,
    "answeredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."DailyAnswer" OWNER TO postgres;

--
-- Name: DailyChallenge; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."DailyChallenge" (
    id text NOT NULL,
    "dayKey" text NOT NULL,
    "gameId" text NOT NULL,
    prompt text NOT NULL,
    answer text NOT NULL,
    "basePoints" integer DEFAULT 100 NOT NULL,
    "durationMs" integer DEFAULT 60000 NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endsAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."DailyChallenge" OWNER TO postgres;

--
-- Name: EngagementPoint; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."EngagementPoint" (
    id text NOT NULL,
    "userId" text NOT NULL,
    points integer NOT NULL,
    source text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."EngagementPoint" OWNER TO postgres;

--
-- Name: GameProfile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GameProfile" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "gameId" text NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    streak integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GameProfile" OWNER TO postgres;

--
-- Name: GameQuestion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GameQuestion" (
    id text NOT NULL,
    "gameId" text NOT NULL,
    prompt text NOT NULL,
    "acceptedAnswers" text[],
    "mediaType" public."QuestionMediaType" DEFAULT 'TEXT'::public."QuestionMediaType" NOT NULL,
    "mediaUrl" text,
    difficulty integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GameQuestion" OWNER TO postgres;

--
-- Name: GuildSettings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GuildSettings" (
    "guildId" text NOT NULL,
    "lfgChannelId" text,
    "publicChannelId" text,
    "dailyChannelId" text,
    "leaderboardChannelId" text,
    "dmNotificationsEnabled" boolean DEFAULT true NOT NULL,
    "quickMatchEnabled" boolean DEFAULT true NOT NULL,
    "ratingsEnabled" boolean DEFAULT true NOT NULL,
    "reportsEnabled" boolean DEFAULT true NOT NULL,
    "maxDmPerDay" integer DEFAULT 3 NOT NULL,
    "notificationCooldownMinutes" integer DEFAULT 20 NOT NULL,
    "maxActiveRoomsPerUser" integer DEFAULT 1 NOT NULL,
    "updatedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "aiChatEnabled" boolean DEFAULT true NOT NULL,
    "aiDailyMessagesPerUser" integer DEFAULT 5 NOT NULL,
    "aiGlobalDailyMessages" integer DEFAULT 100 NOT NULL,
    "aiMaxOutputTokens" integer DEFAULT 250 NOT NULL,
    "autoCreateRoomChannels" boolean DEFAULT true NOT NULL,
    "defaultRoomDurationMinutes" integer DEFAULT 60 NOT NULL,
    "lfgCategoryId" text,
    "roomGraceMinutes" integer DEFAULT 5 NOT NULL,
    "aiDailyTokenBudgetPerUser" integer DEFAULT 3000 NOT NULL,
    "aiGlobalDailyTokenBudget" integer DEFAULT 100000 NOT NULL
);


ALTER TABLE public."GuildSettings" OWNER TO postgres;

--
-- Name: LfgGameCatalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."LfgGameCatalog" (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    category text,
    "categoryId" text,
    "minPlayers" integer DEFAULT 2 NOT NULL,
    "maxPlayers" integer DEFAULT 10 NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."LfgGameCatalog" OWNER TO postgres;

--
-- Name: LfgGameCategory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."LfgGameCategory" (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    icon text,
    "sortOrder" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."LfgGameCategory" OWNER TO postgres;

--
-- Name: LfgMember; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."LfgMember" (
    "roomId" text NOT NULL,
    "userId" text NOT NULL,
    status public."LfgMemberStatus" DEFAULT 'ACTIVE'::public."LfgMemberStatus" NOT NULL,
    "joinedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "leftAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    played boolean DEFAULT false NOT NULL,
    "voiceJoinedAt" timestamp(3) without time zone,
    "voiceSeconds" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."LfgMember" OWNER TO postgres;

--
-- Name: LfgRoom; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."LfgRoom" (
    id text NOT NULL,
    "hostId" text NOT NULL,
    "lfgGameId" text NOT NULL,
    title text,
    description text,
    "gameMode" text,
    "needsVoice" boolean DEFAULT true NOT NULL,
    "maxPlayers" integer DEFAULT 2 NOT NULL,
    "memberCount" integer DEFAULT 1 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status public."RoomStatus" DEFAULT 'OPEN'::public."RoomStatus" NOT NULL,
    "voiceChannelId" text,
    "textChannelId" text,
    "categoryId" text,
    "controlMessageId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "closedAt" timestamp(3) without time zone,
    "listingChannelId" text,
    "listingMessageId" text,
    "accentColor" text DEFAULT '#e50914'::text NOT NULL,
    "autoDeleteAt" timestamp(3) without time zone,
    "channelsDeletedAt" timestamp(3) without time zone,
    "durationMinutes" integer DEFAULT 60 NOT NULL,
    "emptySince" timestamp(3) without time zone,
    locked boolean DEFAULT false NOT NULL,
    "playEndsAt" timestamp(3) without time zone,
    "roomEmoji" text DEFAULT '🎮'::text,
    "readyNotifiedAt" timestamp(3) without time zone,
    "scheduledFor" timestamp(3) without time zone,
    "reminderDeliveredAt" timestamp(3) without time zone,
    "mapName" text,
    "ratingRequestedAt" timestamp(3) without time zone
);


ALTER TABLE public."LfgRoom" OWNER TO postgres;

--
-- Name: LfgRoomRating; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."LfgRoomRating" (
    id text NOT NULL,
    "roomId" text NOT NULL,
    "raterId" text NOT NULL,
    stars integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."LfgRoomRating" OWNER TO postgres;

--
-- Name: NotificationDelivery; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."NotificationDelivery" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "lfgGameId" text NOT NULL,
    "roomId" text NOT NULL,
    status public."NotificationDeliveryStatus" DEFAULT 'RESERVED'::public."NotificationDeliveryStatus" NOT NULL,
    "dedupeKey" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sentAt" timestamp(3) without time zone,
    "ignoredAt" timestamp(3) without time zone
);


ALTER TABLE public."NotificationDelivery" OWNER TO postgres;

--
-- Name: Rating; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Rating" (
    id text NOT NULL,
    "raterId" text NOT NULL,
    "ratedId" text NOT NULL,
    "sessionId" text NOT NULL,
    stars integer NOT NULL,
    tags text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Rating" OWNER TO postgres;

--
-- Name: Report; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Report" (
    id text NOT NULL,
    "reporterId" text NOT NULL,
    "reportedId" text NOT NULL,
    "sessionId" text,
    reason text NOT NULL,
    description text,
    status public."ReportStatus" DEFAULT 'PENDING'::public."ReportStatus" NOT NULL,
    "resolvedBy" text,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Report" OWNER TO postgres;

--
-- Name: ServiceHeartbeat; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ServiceHeartbeat" (
    service text NOT NULL,
    "instanceId" text,
    metadata jsonb,
    "lastSeenAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ServiceHeartbeat" OWNER TO postgres;

--
-- Name: TrustScore; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."TrustScore" (
    "userId" text NOT NULL,
    score double precision DEFAULT 1 NOT NULL,
    "rejectedReports" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."TrustScore" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "displayName" text NOT NULL,
    "avatarUrl" text,
    xp integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    streak integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "activityVisible" boolean DEFAULT true NOT NULL,
    bio text,
    "profileAccent" text DEFAULT '#e50914'::text NOT NULL,
    "rivalNotificationsEnabled" boolean DEFAULT true NOT NULL,
    "activityNote" text,
    "activityUntil" timestamp(3) without time zone,
    "currentActivity" public."AvailabilityActivity" DEFAULT 'AWAY'::public."AvailabilityActivity" NOT NULL,
    "mentionPolicy" public."MentionPolicy" DEFAULT 'INTERESTED_ONLY'::public."MentionPolicy" NOT NULL
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: UserAvailability; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UserAvailability" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "startMinute" integer NOT NULL,
    "endMinute" integer NOT NULL,
    activity public."AvailabilityActivity" DEFAULT 'FREE'::public."AvailabilityActivity" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UserAvailability" OWNER TO postgres;

--
-- Name: UserGamePreference; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UserGamePreference" (
    "userId" text NOT NULL,
    "lfgGameId" text NOT NULL,
    "interestStatus" public."GameInterestStatus" DEFAULT 'INTERESTED'::public."GameInterestStatus" NOT NULL,
    "notificationsEnabled" boolean DEFAULT true NOT NULL,
    "mutedUntil" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UserGamePreference" OWNER TO postgres;

--
-- Name: ZarkGame; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ZarkGame" (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    kind public."ZarkGameKind" NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "basePoints" integer DEFAULT 100 NOT NULL,
    icon text,
    category text DEFAULT 'RACE'::text NOT NULL,
    aliases text[] DEFAULT ARRAY[]::text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ZarkGame" OWNER TO postgres;

--
-- Name: ZarkMatch; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ZarkMatch" (
    id text NOT NULL,
    "gameId" text NOT NULL,
    prompt text NOT NULL,
    answer text NOT NULL,
    "mediaUrl" text,
    status public."MatchStatus" DEFAULT 'OPEN'::public."MatchStatus" NOT NULL,
    "durationMs" integer DEFAULT 60000 NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endsAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ZarkMatch" OWNER TO postgres;

--
-- Name: ZarkMatchResult; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ZarkMatchResult" (
    id text NOT NULL,
    "matchId" text NOT NULL,
    "userId" text NOT NULL,
    rank integer NOT NULL,
    "elapsedMs" integer NOT NULL,
    points integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ZarkMatchResult" OWNER TO postgres;

--
-- Data for Name: AiUsageDaily; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AiUsageDaily" (id, "userId", "dayKey", "requestCount", "inputTokens", "outputTokens", "createdAt", "updatedAt", "reservedTokens") FROM stdin;
cmteddqwr02huuwg865mfk5eg	492368135144603658	2026-08-29	5	0	0	2026-08-29 12:41:40.731	2026-08-29 13:21:45.199	0
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AuditLog" (id, "adminId", action, "targetId", details, "createdAt") FROM stdin;
cmte4ioto0090uwrsdm0d9bw1	492368135144603658	guild.settings_updated	492370023722123272	{"botName": "Zark LFG System", "tagline": "Zark LFG System — فريقك أقرب مما تتخيل", "maxDmPerDay": 3, "lfgChannelId": "1509960019637043270", "dailyChannelId": null, "ratingsEnabled": true, "reportsEnabled": true, "publicChannelId": null, "quickMatchEnabled": true, "leaderboardChannelId": null, "maxActiveRoomsPerUser": 1, "dmNotificationsEnabled": true, "notificationCooldownMinutes": 20}	2026-08-29 08:33:34.763
\.


--
-- Data for Name: BotIdentity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BotIdentity" (id, name, tagline, "updatedAt") FROM stdin;
1	Zark LFG System	Zark LFG System — فريقك أقرب مما تتخيل	2026-08-29 08:33:34.763
\.


--
-- Data for Name: BugReport; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BugReport" (id, "reporterId", title, description, context, status, "resolvedBy", "resolvedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: DailyAnswer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."DailyAnswer" (id, "challengeId", "userId", rank, "elapsedMs", points, "answeredAt") FROM stdin;
\.


--
-- Data for Name: DailyChallenge; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."DailyChallenge" (id, "dayKey", "gameId", prompt, answer, "basePoints", "durationMs", "startedAt", "endsAt") FROM stdin;
cmte2xk2r0013uwos4898bsmx	2026-08-29	cmte2xk1z000puwosfx3zqc1v	😀 ماذا تمثل؟ 🚗⚽🥅	روكيت ليق|||rocket league	100	45000	2026-08-29 07:49:09.218	2026-08-30 00:00:00
\.


--
-- Data for Name: EngagementPoint; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."EngagementPoint" (id, "userId", points, source, "createdAt") FROM stdin;
\.


--
-- Data for Name: GameProfile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GameProfile" (id, "userId", "gameId", xp, wins, losses, streak, "updatedAt") FROM stdin;
cmte4v98s02pquwrscul3oep2	492368135144603658	cmte2xk2d000vuwosbyfxtwk3	85	1	0	0	2026-08-29 08:43:21.1
cmte3n1mq02mfuwkkq7ddmtli	492368135144603658	cmte2xk1o000muwosuurgx2cn	164	3	0	0	2026-08-29 18:53:33.782
cmteqoy0o01vvuwn0qylurbzd	492368135144603658	cmte2xk2d000wuwosa0ihttql	9	1	0	0	2026-08-29 18:54:18.168
\.


--
-- Data for Name: GameQuestion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GameQuestion" (id, "gameId", prompt, "acceptedAnswers", "mediaType", "mediaUrl", difficulty, enabled, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: GuildSettings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GuildSettings" ("guildId", "lfgChannelId", "publicChannelId", "dailyChannelId", "leaderboardChannelId", "dmNotificationsEnabled", "quickMatchEnabled", "ratingsEnabled", "reportsEnabled", "maxDmPerDay", "notificationCooldownMinutes", "maxActiveRoomsPerUser", "updatedBy", "createdAt", "updatedAt", "aiChatEnabled", "aiDailyMessagesPerUser", "aiGlobalDailyMessages", "aiMaxOutputTokens", "autoCreateRoomChannels", "defaultRoomDurationMinutes", "lfgCategoryId", "roomGraceMinutes", "aiDailyTokenBudgetPerUser", "aiGlobalDailyTokenBudget") FROM stdin;
492370023722123272	1509960019637043270	\N	\N	\N	t	t	t	t	3	20	1	492368135144603658	2026-08-29 08:32:45.05	2026-08-29 08:33:34.763	t	5	100	250	t	60	\N	5	3000	100000
\.


--
-- Data for Name: LfgGameCatalog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LfgGameCatalog" (id, slug, name, description, icon, category, "categoryId", "minPlayers", "maxPlayers", "sortOrder", enabled, "createdAt", "updatedAt") FROM stdin;
cmtecvjaw0012uwg82fjhgf10	apex-legends	Apex Legends	\N	🔺	باتل رويال	cmte2xjzu0003uwos3ckvuwsc	2	3	0	t	2026-08-29 12:27:31.065	2026-08-29 18:55:06.35
cmte2xk15000juwosl08qwabh	gta-v	GTA V	\N	🚗	Open World	cmte2xjzy0004uwosu6513zk5	2	8	0	t	2026-08-29 07:49:09.161	2026-08-29 18:55:06.42
cmtecvjb30016uwg83g2m1d6w	red-dead-online	Red Dead Online	\N	🤠	عالم مفتوح	cmte2xjzy0004uwosu6513zk5	2	7	0	t	2026-08-29 12:27:31.071	2026-08-29 18:55:06.358
cmte2xk1a000luwosfc0nswv7	rocket-league	Rocket League	\N	⚽	رياضة وسباقات	cmte2xk020005uwosxdss4jc2	2	6	0	t	2026-08-29 07:49:09.166	2026-08-29 18:55:06.362
cmtecvjba001auwg8hz23gj3a	ea-sports-fc	EA SPORTS FC	\N	🥅	رياضة وسباقات	cmte2xk020005uwosxdss4jc2	2	4	0	t	2026-08-29 12:27:31.079	2026-08-29 18:55:06.366
cmtecvjbe001cuwg8my4n7ucx	forza-horizon-5	Forza Horizon 5	\N	🏎️	رياضة وسباقات	cmte2xk020005uwosxdss4jc2	2	12	0	t	2026-08-29 12:27:31.082	2026-08-29 18:55:06.37
cmtecvjbh001euwg8pcuxbyhn	league-of-legends	League of Legends	\N	⚔️	MOBA وتنافس جماعي	cmtecvj970006uwg8u3o3kqtq	2	5	0	t	2026-08-29 12:27:31.086	2026-08-29 18:55:06.374
cmtecvjbl001guwg8a1o38k1d	dota-2	Dota 2	\N	🗡️	MOBA وتنافس جماعي	cmtecvj970006uwg8u3o3kqtq	2	5	0	t	2026-08-29 12:27:31.089	2026-08-29 18:55:06.378
cmte2xk0f0009uwosp3gzgkzw	roblox	Roblox	\N	🟥	عالم مفتوح وبناء	cmte2xjzg0000uwosnklhzew9	2	12	0	t	2026-08-29 07:49:09.135	2026-08-29 18:55:06.297
cmtecvj9o000euwg82r6a6jlz	terraria	Terraria	\N	🌲	عالم مفتوح وبناء	cmte2xjzg0000uwosnklhzew9	2	8	0	t	2026-08-29 12:27:31.02	2026-08-29 18:55:06.301
cmte2xk0q000duwosqmuimdql	cs2	Counter-Strike 2	\N	🔫	تصويب وتكتيك	cmte2xjzn0001uwosqctep6e4	2	5	0	t	2026-08-29 07:49:09.147	2026-08-29 18:55:06.309
cmtecvjbo001iuwg83vgu18kw	among-us	Among Us	\N	🚀	اجتماعية وParty	cmtecvj990007uwg831wwcsvq	4	15	0	t	2026-08-29 12:27:31.093	2026-08-29 18:55:06.382
cmtecvjbs001kuwg8ncjl3qz0	fall-guys	Fall Guys	\N	🎉	اجتماعية وParty	cmtecvj990007uwg831wwcsvq	2	8	0	t	2026-08-29 12:27:31.096	2026-08-29 18:55:06.386
cmtecvja0000kuwg8l0h75txz	overwatch-2	Overwatch 2	\N	🛡️	تصويب وتكتيك	cmte2xjzn0001uwosqctep6e4	2	5	0	t	2026-08-29 12:27:31.032	2026-08-29 18:55:06.314
cmtecvja4000muwg89g14r4ez	rainbow-six-siege	Rainbow Six Siege	\N	🧨	تصويب وتكتيك	cmte2xjzn0001uwosqctep6e4	2	5	0	t	2026-08-29 12:27:31.036	2026-08-29 18:55:06.318
cmtecvja7000ouwg8n72eq3ox	warzone	Call of Duty: Warzone	\N	🪖	تصويب وتكتيك	cmte2xjzn0001uwosqctep6e4	2	4	0	t	2026-08-29 12:27:31.039	2026-08-29 18:55:06.322
cmtecvjaf000suwg8mgxoyls0	ark-survival-ascended	ARK: Survival Ascended	\N	🦖	بقاء	cmte2xjzr0002uwoshtxslel0	2	10	0	t	2026-08-29 12:27:31.047	2026-08-29 18:55:06.33
cmtecvjai000uuwg8cz3czti5	palworld	Palworld	\N	🐾	بقاء	cmte2xjzr0002uwoshtxslel0	2	8	0	t	2026-08-29 12:27:31.05	2026-08-29 18:55:06.334
cmtecvjal000wuwg8g5bslu7m	dead-by-daylight	Dead by Daylight	\N	🪝	بقاء	cmte2xjzr0002uwoshtxslel0	2	5	0	t	2026-08-29 12:27:31.054	2026-08-29 18:55:06.338
cmtecvjat0010uwg8rf74ucdv	pubg	PUBG: Battlegrounds	\N	🪂	باتل رويال	cmte2xjzu0003uwos3ckvuwsc	2	4	0	t	2026-08-29 12:27:31.061	2026-08-29 18:55:06.346
cmte2xk0v000fuwosc35c8o79	rust	Rust	\N	🛠️	Survival	cmte2xjzr0002uwoshtxslel0	2	10	0	t	2026-08-29 07:49:09.152	2026-08-29 18:55:06.42
cmte2xk10000huwosexyp8uce	fortnite	Fortnite	\N	🏝️	Battle Royale	cmte2xjzu0003uwos3ckvuwsc	2	4	0	t	2026-08-29 07:49:09.157	2026-08-29 18:55:06.42
cmte2xk080007uwosgxqy4g53	minecraft	Minecraft	\N	⛏️	Sandbox	cmte2xjzg0000uwosnklhzew9	2	10	0	t	2026-08-29 07:49:09.128	2026-08-29 18:55:06.42
cmte2xk0l000buwosx0zw4mua	valorant	Valorant	\N	🎯	FPS	cmte2xjzn0001uwosqctep6e4	2	5	0	t	2026-08-29 07:49:09.141	2026-08-29 18:55:06.42
\.


--
-- Data for Name: LfgGameCategory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LfgGameCategory" (id, slug, name, icon, "sortOrder") FROM stdin;
cmte2xjzg0000uwosnklhzew9	sandbox	عالم مفتوح وبناء	🧱	1
cmte2xjzn0001uwosqctep6e4	shooter	تصويب وتكتيك	🎯	2
cmte2xjzr0002uwoshtxslel0	survival	بقاء	🛠️	3
cmte2xjzu0003uwos3ckvuwsc	battle-royale	باتل رويال	🏝️	4
cmte2xjzy0004uwosu6513zk5	open-world	عالم مفتوح	🚗	5
cmte2xk020005uwosxdss4jc2	sports	رياضة وسباقات	⚽	6
cmtecvj970006uwg8u3o3kqtq	moba	MOBA وتنافس جماعي	⚔️	7
cmtecvj990007uwg831wwcsvq	party	اجتماعية وParty	🎉	8
cmtecvj9c0008uwg8ols80scj	rpg	RPG ومغامرات	🧙	9
\.


--
-- Data for Name: LfgMember; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LfgMember" ("roomId", "userId", status, "joinedAt", "leftAt", "completedAt", played, "voiceJoinedAt", "voiceSeconds") FROM stdin;
cmte3khz600vluwkk0rxd9aff	492368135144603658	LEFT	2026-08-29 08:06:59.587	2026-08-29 08:07:28.009	\N	f	\N	0
cmte3l6ky01cruwkkh4jk8hrq	492368135144603658	LEFT	2026-08-29 08:07:31.475	2026-08-29 08:07:44.992	\N	f	\N	0
cmte3lspk02iduwkkaevk2al7	492368135144603658	LEFT	2026-08-29 08:08:00.153	2026-08-29 08:11:05.482	\N	f	\N	0
cmte3w4ex03mfuwkkhuopbqfu	492368135144603658	LEFT	2026-08-29 08:16:01.881	2026-08-29 08:17:04.904	\N	f	\N	0
cmte3xjpr03zpuwkkwap7c652	492368135144603658	LEFT	2026-08-29 08:17:08.368	2026-08-29 08:19:47.522	\N	f	\N	0
cmte456540055uwkk4ag2s0s4	492368135144603658	LEFT	2026-08-29 08:23:04.025	2026-08-29 08:23:17.166	\N	f	\N	0
cmte4mpf100v6uwrsdwcxidar	1267833912219009096	ACTIVE	2026-08-29 08:37:43.859	\N	\N	f	\N	0
cmtedfi4u0389uwg8hcoyz1jc	492368135144603658	LEFT	2026-08-29 12:43:02.67	2026-08-29 12:44:07.569	\N	f	\N	22
cmte4mpf100v6uwrsdwcxidar	492368135144603658	LEFT	2026-08-29 13:26:51.459	2026-08-29 13:26:55.673	\N	f	\N	0
cmteovtyg00qduwc04x8ihhrb	492368135144603658	LEFT	2026-08-29 18:03:40.264	2026-08-29 18:04:10.527	\N	f	\N	0
cmtepdmeu01m7uwcc0ah96jpb	492368135144603658	LEFT	2026-08-29 18:17:55.758	2026-08-29 18:18:07.423	\N	f	\N	0
cmteqpru5021uuwn08z435a95	492368135144603658	ACTIVE	2026-08-29 18:54:56.813	\N	\N	f	\N	0
\.


--
-- Data for Name: LfgRoom; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LfgRoom" (id, "hostId", "lfgGameId", title, description, "gameMode", "needsVoice", "maxPlayers", "memberCount", version, status, "voiceChannelId", "textChannelId", "categoryId", "controlMessageId", "createdAt", "startedAt", "completedAt", "closedAt", "listingChannelId", "listingMessageId", "accentColor", "autoDeleteAt", "channelsDeletedAt", "durationMinutes", "emptySince", locked, "playEndsAt", "roomEmoji", "readyNotifiedAt", "scheduledFor", "reminderDeliveredAt", "mapName", "ratingRequestedAt") FROM stdin;
cmte3khz600vluwkk0rxd9aff	492368135144603658	cmte2xk0q000duwosqmuimdql	\N	اه	\N	t	4	0	2	CLOSED	\N	\N	\N	\N	2026-08-29 08:06:59.587	\N	\N	2026-08-29 08:07:28.012	\N	\N	#e50914	\N	\N	60	\N	f	\N	🎮	\N	\N	\N	\N	\N
cmte3l6ky01cruwkkh4jk8hrq	492368135144603658	cmte2xk0q000duwosqmuimdql	\N	اه	\N	t	4	0	2	CLOSED	\N	\N	\N	\N	2026-08-29 08:07:31.475	\N	\N	2026-08-29 08:07:44.995	\N	\N	#e50914	\N	\N	60	\N	f	\N	🎮	\N	\N	\N	\N	\N
cmte3lspk02iduwkkaevk2al7	492368135144603658	cmte2xk0q000duwosqmuimdql	\N	اه	\N	t	4	0	2	CLOSED	\N	\N	\N	\N	2026-08-29 08:08:00.153	\N	\N	2026-08-29 08:11:05.487	\N	\N	#e50914	\N	\N	60	\N	f	\N	🎮	\N	\N	\N	\N	\N
cmte3w4ex03mfuwkkhuopbqfu	492368135144603658	cmte2xk080007uwosgxqy4g53	\N	\N	\N	t	2	0	2	CLOSED	\N	\N	\N	\N	2026-08-29 08:16:01.881	\N	\N	2026-08-29 08:17:04.909	\N	\N	#e50914	\N	\N	60	\N	f	\N	🎮	\N	\N	\N	\N	\N
cmte3xjpr03zpuwkkwap7c652	492368135144603658	cmte2xk080007uwosgxqy4g53	\N	\N	\N	t	2	0	2	CLOSED	\N	\N	\N	\N	2026-08-29 08:17:08.368	\N	\N	2026-08-29 08:19:47.526	\N	\N	#e50914	\N	\N	60	\N	f	\N	🎮	\N	\N	\N	\N	\N
cmte456540055uwkk4ag2s0s4	492368135144603658	cmte2xk080007uwosgxqy4g53	\N	\N	\N	t	4	0	2	CLOSED	\N	\N	\N	\N	2026-08-29 08:23:04.025	\N	\N	2026-08-29 08:23:17.171	1509960019637043270	1543174166738640988	#e50914	\N	\N	60	\N	f	\N	🎮	\N	\N	\N	\N	\N
cmte4mpf100v6uwrsdwcxidar	1267833912219009096	cmte2xk080007uwosgxqy4g53	\N	\N	\N	t	2	1	9	OPEN	1543235568526434434	1543235566219558922	1510229940379844758	1543235574675017760	2026-08-29 08:36:42.157	\N	\N	\N	1509960019637043270	1543177598807580734	#e50914	\N	\N	60	\N	f	\N	🎮	\N	\N	\N	\N	\N
cmtedfi4u0389uwg8hcoyz1jc	492368135144603658	cmte2xk080007uwosgxqy4g53	\N	\N	\N	t	4	0	4	CLOSED	1543239597474062387	1543239595871830106	1510229940379844758	1543239602326868100	2026-08-29 12:43:02.67	\N	\N	2026-08-29 12:44:14.615	1509960019637043270	1543239593397063712	#e50914	\N	2026-08-29 12:44:15.929	60	\N	f	\N	⛏️	\N	\N	\N	\N	\N
cmteovtyg00qduwc04x8ihhrb	492368135144603658	cmte2xk0f0009uwosp3gzgkzw	\N	\N	\N	t	4	0	2	CLOSED	1543320306373107763	1543320304644919297	1510229940379844758	1543320315994841209	2026-08-29 18:03:40.264	\N	\N	2026-08-29 18:04:10.527	1509960019637043270	1543320287859449956	#e50914	\N	2026-08-29 18:04:12.845	60	\N	f	\N	🟥	\N	\N	\N	\N	\N
cmtepdmeu01m7uwcc0ah96jpb	492368135144603658	cmte2xk080007uwosgxqy4g53	\N	\N	\N	t	4	0	5	CLOSED	1543323777222316163	1543323775549046894	1510229940379844758	1543323786416492625	2026-08-29 18:17:30.295	\N	\N	2026-08-29 18:18:10.488	1509960019637043270	1543323769840607332	#e50914	\N	2026-08-29 18:18:16.006	60	\N	f	\N	⛏️	\N	\N	\N	\N	\N
cmteqpru5021uuwn08z435a95	492368135144603658	cmte2xk080007uwosgxqy4g53	\N	\N	\N	f	2	1	1	OPEN	\N	1543333190058643539	1510229940379844758	1543333196568199300	2026-08-29 18:54:56.813	\N	\N	\N	1509960019637043270	1543333193728393296	#e50914	\N	\N	30	\N	f	\N	⛏️	\N	\N	\N	\N	\N
\.


--
-- Data for Name: LfgRoomRating; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LfgRoomRating" (id, "roomId", "raterId", stars, "createdAt") FROM stdin;
\.


--
-- Data for Name: NotificationDelivery; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."NotificationDelivery" (id, "userId", "lfgGameId", "roomId", status, "dedupeKey", "createdAt", "sentAt", "ignoredAt") FROM stdin;
\.


--
-- Data for Name: Rating; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Rating" (id, "raterId", "ratedId", "sessionId", stars, tags, "createdAt") FROM stdin;
\.


--
-- Data for Name: Report; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Report" (id, "reporterId", "reportedId", "sessionId", reason, description, status, "resolvedBy", "resolvedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: ServiceHeartbeat; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ServiceHeartbeat" (service, "instanceId", metadata, "lastSeenAt", "createdAt") FROM stdin;
discord-bot	21912	{"tag": "ZARK LFG SYSTEM#9929", "guilds": 1, "botUserId": "1543166075880083516"}	2026-08-29 19:06:28.212	2026-08-29 12:27:05.697
\.


--
-- Data for Name: TrustScore; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."TrustScore" ("userId", score, "rejectedReports", "updatedAt") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, "displayName", "avatarUrl", xp, wins, streak, "createdAt", "updatedAt", "activityVisible", bio, "profileAccent", "rivalNotificationsEnabled", "activityNote", "activityUntil", "currentActivity", "mentionPolicy") FROM stdin;
1267833912219009096	369330	https://cdn.discordapp.com/embed/avatars/4.png	0	0	0	2026-08-29 08:37:43.84	2026-08-29 18:28:44.41	t	\N	#e50914	t	\N	\N	AWAY	INTERESTED_ONLY
492368135144603658	ZARK	https://cdn.discordapp.com/avatars/492368135144603658/8c9d2f1978e966646d92903476f74f6e.png?size=256	258	5	0	2026-08-29 08:06:27.532	2026-08-29 18:55:05.865	t	لفش	#1b0405	t	\N	\N	AWAY	INTERESTED_ONLY
\.


--
-- Data for Name: UserAvailability; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."UserAvailability" (id, "userId", "dayOfWeek", "startMinute", "endMinute", activity, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: UserGamePreference; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."UserGamePreference" ("userId", "lfgGameId", "interestStatus", "notificationsEnabled", "mutedUntil", "createdAt", "updatedAt") FROM stdin;
492368135144603658	cmte2xk0l000buwosx0zw4mua	NOT_INTERESTED	f	\N	2026-08-29 08:07:57.522	2026-08-29 13:21:29.313
492368135144603658	cmte2xk0f0009uwosp3gzgkzw	NOT_INTERESTED	f	\N	2026-08-29 08:07:55.444	2026-08-29 13:21:31.412
492368135144603658	cmte2xk0q000duwosqmuimdql	NOT_INTERESTED	f	\N	2026-08-29 08:07:56.181	2026-08-29 13:21:32.514
492368135144603658	cmte2xk10000huwosexyp8uce	NOT_INTERESTED	f	\N	2026-08-29 08:07:54.959	2026-08-29 13:21:33.574
492368135144603658	cmte2xk0v000fuwosc35c8o79	NOT_INTERESTED	f	\N	2026-08-29 08:07:53.591	2026-08-29 13:21:34.216
492368135144603658	cmte2xk15000juwosl08qwabh	NOT_INTERESTED	f	\N	2026-08-29 08:07:56.722	2026-08-29 13:21:34.736
492368135144603658	cmte2xk1a000luwosfc0nswv7	NOT_INTERESTED	f	\N	2026-08-29 08:07:58.508	2026-08-29 13:21:35.553
492368135144603658	cmte2xk080007uwosgxqy4g53	INTERESTED	t	\N	2026-08-29 08:07:40.763	2026-08-29 18:38:24.863
492368135144603658	cmtecvja0000kuwg8l0h75txz	INTERESTED	t	\N	2026-08-29 12:40:09.136	2026-08-29 18:38:29.049
\.


--
-- Data for Name: ZarkGame; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ZarkGame" (id, slug, name, description, kind, enabled, "basePoints", icon, category, aliases, "createdAt") FROM stdin;
cmte2xk2f000yuwosu7mdev0z	complete-word	إكمل الكلمة	اكتشف الحروف الناقصة قبل الجميع.	RACE	t	100	\N	RACE	{}	2026-08-29 07:49:09.18
cmte2xk1z000quwosw8nx6seo	math	تحدي الحساب	سباق حساب سريع لمدة أقل من دقيقة.	RACE	t	120	\N	RACE	{}	2026-08-29 07:49:09.18
cmte2xk1z000puwosfx3zqc1v	emoji-guess	خمن الإيموجي	فك الشفرة واعرف الكلمة أو اللعبة.	RACE	t	100	\N	RACE	{ايموجي,إيموجي}	2026-08-29 07:49:09.18
cmte2xk2g0010uwoszxybuq4c	car-logos	شعارات السيارات	اعرف شركة السيارة من الشعار.	RACE	t	120	\N	RACE	{سيارات,"لوجو سيارات"}	2026-08-29 07:49:09.18
cmteesp4t001puwzco44kh04z	game-logos	خمن اللعبة	اعرف اللعبة من رمزها وتلميح سريع.	RACE	t	120	\N	RACE	{لعبة,العاب,"شعار لعبة"}	2026-08-29 13:21:17.876
cmte2xk2g000zuwoscpc7uzrx	word-order	ترتيب الجملة	رتب الكلمات واكتب الجملة الصحيحة.	RACE	t	105	\N	RACE	{ترتيب,جملة}	2026-08-29 07:49:09.18
cmteesp520020uwzcosjbzv44	true-false	صح أو خطأ	احسم العبارة بسرعة قبل بقية اللاعبين.	RACE	t	95	\N	RACE	{صح,خطأ,"صح خطأ"}	2026-08-29 13:21:17.876
cmteesp530021uwzct699o0mu	letter-order	ترتيب الحروف	رتب الحروف واكتشف الكلمة المخفية.	RACE	t	105	\N	RACE	{حروف}	2026-08-29 13:21:17.876
cmte2xk21000tuwos06wok4lz	company-logos	شعارات الشركات	تعرف على الشركة من شعارها.	RACE	t	120	\N	RACE	{شركات,"لوجو شركات"}	2026-08-29 07:49:09.18
cmte2xk1z000ouwose92tqcsf	fast-type	أسرع كتابة	انسخ الجملة بأسرع وقت وبدون أخطاء.	RACE	t	100	\N	RACE	{اسرع,أسرع,كتابة}	2026-08-29 07:49:09.18
cmte2xk2d000vuwosbyfxtwk3	flags	أعلام	اعرف الدولة من علمها بأسرع وقت.	RACE	t	100	\N	RACE	{}	2026-08-29 07:49:09.18
cmte2xk2d000wuwosa0ihttql	capitals	عواصم ودول	اعرف العاصمة أو الدولة قبل الجميع.	RACE	t	110	\N	RACE	{عواصم,دول}	2026-08-29 07:49:09.18
cmte2xk2f000xuwosb76g5l35	anime-silhouette	بطل الأنمي	اعرف الشخصية من الظل أو الصورة المخفية.	RACE	t	140	\N	RACE	{انمي,أنمي,"بطل الانمي"}	2026-08-29 07:49:09.18
cmteesp4o001nuwzc1l910m76	trivia	معلومات عامة	أسئلة متنوعة في العلوم والألعاب والثقافة.	RACE	t	110	\N	RACE	{تريفيا,معلومات}	2026-08-29 13:21:17.876
cmte2xk1o000muwosuurgx2cn	translate	ترجم	أول ترجمة صحيحة تخطف أعلى نقاط.	RACE	t	100	\N	RACE	{}	2026-08-29 07:49:09.18
cmteesp4w001quwzc7hw3g45y	who-am-i	من أنا؟	ثلاث تلميحات تقودك إلى الشخصية أو الشيء.	RACE	t	115	\N	RACE	{"من انا","من أنا"}	2026-08-29 13:21:17.876
\.


--
-- Data for Name: ZarkMatch; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ZarkMatch" (id, "gameId", prompt, answer, "mediaUrl", status, "durationMs", "startedAt", "endsAt") FROM stdin;
cmte3fyo4001zuwkk5lrynl06	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇸🇦	السعودية|||المملكة العربية السعودية	\N	OPEN	45000	2026-08-29 08:03:27.938	2026-08-29 08:04:12.938
cmte3h5o200czuwkkle9psyog	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇸🇦	السعودية|||المملكة العربية السعودية	\N	OPEN	45000	2026-08-29 08:04:23.665	2026-08-29 08:05:08.665
cmte3h8f200ezuwkkync12571	cmte2xk2d000wuwosa0ihttql	🌍 ما عاصمة فلسطين؟	القدس|||قدس	\N	OPEN	45000	2026-08-29 08:04:27.229	2026-08-29 08:05:12.229
cmte3ha1k00hfuwkkvkstm8vd	cmte2xk2g000zuwoscpc7uzrx	🔤 رتب الكلمات: **اللاعبين — أفضل — يجمع — Zark**	Zark يجمع أفضل اللاعبين	\N	OPEN	50000	2026-08-29 08:04:29.335	2026-08-29 08:05:19.335
cmte3mhu402ktuwkkvk16l2g5	cmte2xk1o000muwosuurgx2cn	🌍 ترجم كلمة: victory	انتصار	\N	OPEN	60000	2026-08-29 08:08:32.715	2026-08-29 08:09:32.715
cmte3nolr02xfuwkk0t7cxd2k	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇪🇬	مصر	\N	OPEN	45000	2026-08-29 08:09:28.142	2026-08-29 08:10:13.142
cmte41tts056tuwkknfb80mmb	cmte2xk2g000zuwoscpc7uzrx	🔤 رتب الكلمات: **السيرفر — حماس — تزيد — المنافسة**	المنافسة تزيد حماس السيرفر	\N	OPEN	50000	2026-08-29 08:20:28.095	2026-08-29 08:21:18.095
cmte41vb5058tuwkkx3rnx7p8	cmte2xk1o000muwosuurgx2cn	🌍 ترجم كلمة: journey	رحلة	\N	OPEN	60000	2026-08-29 08:20:30.016	2026-08-29 08:21:30.016
cmte41vtj05atuwkku6umrkq1	cmte2xk2d000wuwosa0ihttql	🌍 الرياض عاصمة أي دولة؟	السعودية|||المملكة العربية السعودية	\N	OPEN	45000	2026-08-29 08:20:30.678	2026-08-29 08:21:15.678
cmte41xix05ctuwkken2j1oh4	cmte2xk1z000ouwose92tqcsf	⌨️ اكتب بالضبط: **المنافسة تبدأ بخطوة واحدة**	المنافسة تبدأ بخطوة واحدة	\N	OPEN	35000	2026-08-29 08:20:32.888	2026-08-29 08:21:07.888
cmte41yuc05etuwkkvzvy89yg	cmte2xk1z000ouwose92tqcsf	⌨️ اكتب بالضبط: **السرعة تصنع الفارق**	السرعة تصنع الفارق	\N	OPEN	35000	2026-08-29 08:20:34.595	2026-08-29 08:21:09.595
cmte4j38y00n0uwrsrrfuhpjl	cmte2xk2g000zuwoscpc7uzrx	🔤 رتب الكلمات: **فريقك — جاهز — للعب — الآن**	فريقك جاهز للعب الآن	\N	OPEN	50000	2026-08-29 08:33:53.457	2026-08-29 08:34:43.457
cmte4rm7501t0uwrshdfjkez4	cmte2xk2f000yuwosu7mdev0z	🧩 أكمل الكلمة: مغ_م_ة	مغامرة	\N	OPEN	45000	2026-08-29 08:40:31.264	2026-08-29 08:41:16.264
cmte4s75001v0uwrsbrht57ze	cmte2xk1o000muwosuurgx2cn	🌍 ترجم كلمة: brave	شجاع	\N	OPEN	60000	2026-08-29 08:40:58.403	2026-08-29 08:41:58.403
cmte4v1vn02o4uwrsnw7b059u	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇸🇦	السعودية|||المملكة العربية السعودية	\N	OPEN	45000	2026-08-29 08:43:11.554	2026-08-29 08:43:56.554
cmteeh97t06svuwg8rmynufur	cmte2xk1o000muwosuurgx2cn	🌍 ترجم كلمة: journey	رحلة	\N	OPEN	60000	2026-08-29 13:12:24.04	2026-08-29 13:13:24.04
cmtef1bmj02l5uwzckb9ehzsk	cmteesp520020uwzcosjbzv44	✅❌ صح أم خطأ: **الماء يتكون من الهيدروجين والأكسجين**	صح|||صحيح	\N	OPEN	35000	2026-08-29 13:28:00.282	2026-08-29 13:28:35.282
cmtef2pcs0064uwq0dhugrv64	cmte2xk2f000xuwosb76g5l35	🎭 من بطل الأنمي؟ 🏜️\nالقرصان الرملي، يستخدم الرمل	كروكودايل|||كروك|||crocodile	\N	OPEN	50000	2026-08-29 13:29:04.731	2026-08-29 13:29:54.731
cmtef382400c9uwq07fhcvcqn	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇵🇭	الفلبين|||فلبين|||philippines	\N	OPEN	45000	2026-08-29 13:29:28.971	2026-08-29 13:30:13.971
cmtep1bv500mmuw6oyxda45o1	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇳🇵	نيبال|||nepal	\N	OPEN	45000	2026-08-29 18:07:56.752	2026-08-29 18:08:41.752
cmtep1ovz00q0uw6oo2585lae	cmte2xk1o000muwosuurgx2cn	🌍 ترجم كلمة: Restaurant	مطعم	\N	OPEN	60000	2026-08-29 18:08:13.63	2026-08-29 18:09:13.63
cmtep1zhp00teuw6o23iuoa5n	cmteesp520020uwzcosjbzv44	✅❌ صح أم خطأ: **الماء يتكون من الهيدروجين والأكسجين**	صح|||صحيح	\N	EXPIRED	35000	2026-08-29 18:08:27.371	2026-08-29 18:09:02.371
cmtep60sr01isuw6ogub1kz4i	cmte2xk1z000puwosfx3zqc1v	😀 ما معنى هذا الإيموجي؟ 🐯	نمر|||tiger	\N	OPEN	45000	2026-08-29 18:11:35.69	2026-08-29 18:12:20.69
cmtep61z101m6uw6ogoql5buk	cmte2xk1z000ouwose92tqcsf	⌨️ اكتب بسرعة وبدقة: **قوي**	قوي	\N	OPEN	35000	2026-08-29 18:11:37.212	2026-08-29 18:12:12.212
cmtep62gi01pkuw6on24nf7xv	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇳🇬	نيجيريا|||nigeria	\N	OPEN	45000	2026-08-29 18:11:37.841	2026-08-29 18:12:22.841
cmtep632a01syuw6oamgya7y0	cmteesp530021uwzct699o0mu	🔡 رتب الحروف: **بل ك**	كلب	\N	OPEN	40000	2026-08-29 18:11:38.625	2026-08-29 18:12:18.625
cmtep63hh01wcuw6oxpedxvzw	cmteesp4o001nuwzc1l910m76	❓ كم عدد حلقات الشعار الأولمبي؟\n3 · 4 · 5 · 6	5	\N	OPEN	45000	2026-08-29 18:11:39.172	2026-08-29 18:12:24.172
cmtepu0y0003duwkgi83okz92	cmte2xk2d000vuwosbyfxtwk3	🚩 لأي دولة هذا العلم؟ 🇫🇮	فنلندا|||finland	\N	OPEN	45000	2026-08-29 18:30:15.623	2026-08-29 18:31:00.623
cmtepuh5a006ruwkg51f4ojb0	cmte2xk1o000muwosuurgx2cn	🌍 ترجم كلمة: Apple	تفاحة	\N	OPEN	60000	2026-08-29 18:30:36.621	2026-08-29 18:31:36.621
cmtepur9a00a5uwkghfk8fi8n	cmte2xk2d000wuwosa0ihttql	🌐 ما عاصمة تركيا؟	أنقرة	\N	OPEN	45000	2026-08-29 18:30:49.725	2026-08-29 18:31:34.725
cmtepuzkh00djuwkggw9qz9ub	cmte2xk1z000ouwose92tqcsf	⌨️ اكتب بسرعة وبدقة: **دولفين**	دولفين	\N	OPEN	35000	2026-08-29 18:31:00.496	2026-08-29 18:31:35.496
cmtepv6r900gxuwkgzzmk9xfg	cmte2xk2f000yuwosu7mdev0z	🧩 أكمل الكلمة: مغ_م_ة	مغامرة	\N	OPEN	45000	2026-08-29 18:31:09.812	2026-08-29 18:31:54.812
cmtepvle800kbuwkgijg0d3o9	cmte2xk2g000zuwoscpc7uzrx	🔤 رتب الكلمات: **السيرفر — حماس — تزيد — المنافسة**	المنافسة تزيد حماس السيرفر	\N	OPEN	50000	2026-08-29 18:31:28.784	2026-08-29 18:32:18.784
cmtepvwyz00npuwkg8ne4nktf	cmte2xk1z000quwosw8nx6seo	🎯 ما ناتج: 7 × 4 + 7؟	35	\N	OPEN	40000	2026-08-29 18:31:43.786	2026-08-29 18:32:23.786
cmtepw5vc00r3uwkgvjmt639g	cmte2xk1z000puwosfx3zqc1v	😀 ما معنى هذا الإيموجي؟ 🐝	نحلة|||نحله|||bee	\N	OPEN	45000	2026-08-29 18:31:55.319	2026-08-29 18:32:40.319
cmtepwew300uhuwkgqscj2627	cmte2xk1z000puwosfx3zqc1v	😀 ما معنى هذا الإيموجي؟ 🥳	احتفال|||فرحة|||party	\N	OPEN	45000	2026-08-29 18:32:07.01	2026-08-29 18:32:52.01
cmtepwsju00xvuwkgzqwvuy6x	cmte2xk2g0010uwoszxybuq4c	🚘 🚗 شركة سيارات ألمانية	bmw|||بي ام دبليو|||بي إم دبليو	\N	OPEN	45000	2026-08-29 18:32:24.713	2026-08-29 18:33:09.713
cmtepx65q0119uwkghzmy6rd5	cmte2xk21000tuwos06wok4lz	🏢 🚗 شركة سيارات يابانية	honda|||هوندا	\N	OPEN	45000	2026-08-29 18:32:42.349	2026-08-29 18:33:27.349
cmtepxcsz014nuwkg7i85amwn	cmte2xk21000tuwos06wok4lz	🏢 🌙 شركة أفلام كرتون	dreamworks|||دريم ووركس|||dream works	\N	OPEN	45000	2026-08-29 18:32:50.962	2026-08-29 18:33:35.962
cmtepxnkb0181uwkg8vxa8x9x	cmte2xk2f000xuwosb76g5l35	🎭 من بطل الأنمي؟ 🟢\nاسمي نيميكيان، معلم غوهان	بيكولو|||بيكول|||piccolo	\N	OPEN	50000	2026-08-29 18:33:04.906	2026-08-29 18:33:54.906
cmtepy09401bfuwkgun94qxc8	cmteesp4t001puwzco44kh04z	🎮 🗡️ لعبة اغتيالات، تقفز من فوق المباني	اساسن كريد|||assassin|||creed	\N	OPEN	45000	2026-08-29 18:33:21.351	2026-08-29 18:34:06.351
cmtepyehe01etuwkge51rjh0v	cmteesp520020uwzcosjbzv44	✅❌ صح أم خطأ: **الشمس نجم**	صح|||صحيح	\N	OPEN	35000	2026-08-29 18:33:39.793	2026-08-29 18:34:14.793
cmtepyslx01i7uwkgah41xe4n	cmteesp530021uwzct699o0mu	🔡 رتب الحروف: **سيرك**	كرسي	\N	OPEN	40000	2026-08-29 18:33:58.1	2026-08-29 18:34:38.1
cmtepz33801lluwkg4f63sswf	cmteesp4w001quwzc7hw3g45y	🌍 خمن الدولة: بلد الرافدين وبابل 🏛️	العراق|||iraq	\N	OPEN	50000	2026-08-29 18:34:11.683	2026-08-29 18:35:01.683
cmtepzccl01ozuwkg2nwu36gz	cmteesp4o001nuwzc1l910m76	🎌 من هو بطل ستينز غيت؟\nأوكابي · دارو · ميو · كوريسو	أوكابي	\N	EXPIRED	45000	2026-08-29 18:34:23.685	2026-08-29 18:35:08.685
cmteqkf0i010duwn0w82ajlpc	cmte2xk21000tuwos06wok4lz	🏢 ما اسم الشركة صاحبة هذا الشعار؟	nvidia|||انفيديا|||نفيديا	https://cdn.simpleicons.org/nvidia/FFFFFF	OPEN	45000	2026-08-29 18:50:46.913	2026-08-29 18:51:31.913
cmteqknaa01c0uwn0v6kpp59j	cmte2xk2g0010uwoszxybuq4c	🚘 ما اسم شركة السيارات صاحبة هذا الشعار؟	subaru|||سوبارو	https://cdn.simpleicons.org/subaru/FFFFFF	OPEN	45000	2026-08-29 18:50:57.632	2026-08-29 18:51:42.632
cmteql9bc01fzuwn0k17of37g	cmteesp4o001nuwzc1l910m76	🎌 من هو بطل كابتن ماجد؟\nماجد · خالد · يوسف · سامر	ماجد	\N	EXPIRED	45000	2026-08-29 18:51:26.183	2026-08-29 18:52:11.183
cmteqmk7y01jduwn05js0yla1	cmte2xk1z000puwosfx3zqc1v	😀 ما معنى هذا الإيموجي؟ 🐀	فأر|||فار|||mouse	\N	EXPIRED	45000	2026-08-29 18:52:26.974	2026-08-29 18:53:11.974
cmteqnl6z01mruwn0c63scuvu	cmte2xk1o000muwosuurgx2cn	🌍 ترجم كلمة: Tree	شجرة	\N	COMPLETED	60000	2026-08-29 18:53:14.891	2026-08-29 18:54:14.891
cmteqokop01t0uwn0i8dy4gqx	cmte2xk2d000wuwosa0ihttql	🌐 ما عاصمة روسيا؟	موسكو	\N	COMPLETED	45000	2026-08-29 18:54:00.888	2026-08-29 18:54:45.888
\.


--
-- Data for Name: ZarkMatchResult; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ZarkMatchResult" (id, "matchId", "userId", rank, "elapsedMs", points, "createdAt") FROM stdin;
cmte3n1mi02mduwkkmu5to1q1	cmte3mhu402ktuwkkvk16l2g5	492368135144603658	1	25638	70	2026-08-29 08:08:58.362
cmte4sg7h01wkuwrsgk42ai1f	cmte4s75001v0uwrsbrht57ze	492368135144603658	1	11741	86	2026-08-29 08:41:10.158
cmte4v98o02pouwrsa31fshks	cmte4v1vn02o4uwrsnw7b059u	492368135144603658	1	9534	85	2026-08-29 08:43:21.096
cmteqnzrl01pkuwn0bqbv1ej6	cmteqnl6z01mruwn0c63scuvu	492368135144603658	1	18873	8	2026-08-29 18:53:33.778
cmteqoy0j01vtuwn0fcqayheu	cmteqokop01t0uwn0i8dy4gqx	492368135144603658	1	17265	9	2026-08-29 18:54:18.164
\.


--
-- Name: AiUsageDaily AiUsageDaily_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AiUsageDaily"
    ADD CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: BotIdentity BotIdentity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BotIdentity"
    ADD CONSTRAINT "BotIdentity_pkey" PRIMARY KEY (id);


--
-- Name: BugReport BugReport_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BugReport"
    ADD CONSTRAINT "BugReport_pkey" PRIMARY KEY (id);


--
-- Name: DailyAnswer DailyAnswer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DailyAnswer"
    ADD CONSTRAINT "DailyAnswer_pkey" PRIMARY KEY (id);


--
-- Name: DailyChallenge DailyChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DailyChallenge"
    ADD CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY (id);


--
-- Name: EngagementPoint EngagementPoint_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."EngagementPoint"
    ADD CONSTRAINT "EngagementPoint_pkey" PRIMARY KEY (id);


--
-- Name: GameProfile GameProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GameProfile"
    ADD CONSTRAINT "GameProfile_pkey" PRIMARY KEY (id);


--
-- Name: GameQuestion GameQuestion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GameQuestion"
    ADD CONSTRAINT "GameQuestion_pkey" PRIMARY KEY (id);


--
-- Name: GuildSettings GuildSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GuildSettings"
    ADD CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId");


--
-- Name: LfgGameCatalog LfgGameCatalog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgGameCatalog"
    ADD CONSTRAINT "LfgGameCatalog_pkey" PRIMARY KEY (id);


--
-- Name: LfgGameCategory LfgGameCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgGameCategory"
    ADD CONSTRAINT "LfgGameCategory_pkey" PRIMARY KEY (id);


--
-- Name: LfgMember LfgMember_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgMember"
    ADD CONSTRAINT "LfgMember_pkey" PRIMARY KEY ("roomId", "userId");


--
-- Name: LfgRoomRating LfgRoomRating_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgRoomRating"
    ADD CONSTRAINT "LfgRoomRating_pkey" PRIMARY KEY (id);


--
-- Name: LfgRoom LfgRoom_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgRoom"
    ADD CONSTRAINT "LfgRoom_pkey" PRIMARY KEY (id);


--
-- Name: NotificationDelivery NotificationDelivery_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY (id);


--
-- Name: Rating Rating_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Rating"
    ADD CONSTRAINT "Rating_pkey" PRIMARY KEY (id);


--
-- Name: Report Report_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_pkey" PRIMARY KEY (id);


--
-- Name: ServiceHeartbeat ServiceHeartbeat_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ServiceHeartbeat"
    ADD CONSTRAINT "ServiceHeartbeat_pkey" PRIMARY KEY (service);


--
-- Name: TrustScore TrustScore_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TrustScore"
    ADD CONSTRAINT "TrustScore_pkey" PRIMARY KEY ("userId");


--
-- Name: UserAvailability UserAvailability_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserAvailability"
    ADD CONSTRAINT "UserAvailability_pkey" PRIMARY KEY (id);


--
-- Name: UserGamePreference UserGamePreference_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserGamePreference"
    ADD CONSTRAINT "UserGamePreference_pkey" PRIMARY KEY ("userId", "lfgGameId");


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: ZarkGame ZarkGame_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ZarkGame"
    ADD CONSTRAINT "ZarkGame_pkey" PRIMARY KEY (id);


--
-- Name: ZarkMatchResult ZarkMatchResult_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ZarkMatchResult"
    ADD CONSTRAINT "ZarkMatchResult_pkey" PRIMARY KEY (id);


--
-- Name: ZarkMatch ZarkMatch_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ZarkMatch"
    ADD CONSTRAINT "ZarkMatch_pkey" PRIMARY KEY (id);


--
-- Name: AiUsageDaily_dayKey_requestCount_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AiUsageDaily_dayKey_requestCount_idx" ON public."AiUsageDaily" USING btree ("dayKey", "requestCount");


--
-- Name: AiUsageDaily_userId_dayKey_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "AiUsageDaily_userId_dayKey_key" ON public."AiUsageDaily" USING btree ("userId", "dayKey");


--
-- Name: BugReport_reporterId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BugReport_reporterId_createdAt_idx" ON public."BugReport" USING btree ("reporterId", "createdAt");


--
-- Name: BugReport_status_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BugReport_status_createdAt_idx" ON public."BugReport" USING btree (status, "createdAt");


--
-- Name: DailyAnswer_challengeId_answeredAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "DailyAnswer_challengeId_answeredAt_idx" ON public."DailyAnswer" USING btree ("challengeId", "answeredAt");


--
-- Name: DailyAnswer_challengeId_rank_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "DailyAnswer_challengeId_rank_key" ON public."DailyAnswer" USING btree ("challengeId", rank);


--
-- Name: DailyAnswer_challengeId_userId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "DailyAnswer_challengeId_userId_key" ON public."DailyAnswer" USING btree ("challengeId", "userId");


--
-- Name: DailyChallenge_dayKey_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "DailyChallenge_dayKey_key" ON public."DailyChallenge" USING btree ("dayKey");


--
-- Name: EngagementPoint_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "EngagementPoint_userId_createdAt_idx" ON public."EngagementPoint" USING btree ("userId", "createdAt");


--
-- Name: EngagementPoint_userId_source_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "EngagementPoint_userId_source_key" ON public."EngagementPoint" USING btree ("userId", source);


--
-- Name: GameProfile_userId_gameId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "GameProfile_userId_gameId_key" ON public."GameProfile" USING btree ("userId", "gameId");


--
-- Name: GameQuestion_gameId_enabled_difficulty_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "GameQuestion_gameId_enabled_difficulty_idx" ON public."GameQuestion" USING btree ("gameId", enabled, difficulty);


--
-- Name: LfgGameCatalog_categoryId_enabled_sortOrder_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgGameCatalog_categoryId_enabled_sortOrder_idx" ON public."LfgGameCatalog" USING btree ("categoryId", enabled, "sortOrder");


--
-- Name: LfgGameCatalog_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "LfgGameCatalog_slug_key" ON public."LfgGameCatalog" USING btree (slug);


--
-- Name: LfgGameCategory_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "LfgGameCategory_slug_key" ON public."LfgGameCategory" USING btree (slug);


--
-- Name: LfgMember_roomId_voiceJoinedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgMember_roomId_voiceJoinedAt_idx" ON public."LfgMember" USING btree ("roomId", "voiceJoinedAt");


--
-- Name: LfgMember_userId_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgMember_userId_status_idx" ON public."LfgMember" USING btree ("userId", status);


--
-- Name: LfgRoomRating_roomId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgRoomRating_roomId_createdAt_idx" ON public."LfgRoomRating" USING btree ("roomId", "createdAt");


--
-- Name: LfgRoomRating_roomId_raterId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "LfgRoomRating_roomId_raterId_key" ON public."LfgRoomRating" USING btree ("roomId", "raterId");


--
-- Name: LfgRoom_lfgGameId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgRoom_lfgGameId_status_createdAt_idx" ON public."LfgRoom" USING btree ("lfgGameId", status, "createdAt");


--
-- Name: LfgRoom_listingChannelId_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgRoom_listingChannelId_status_idx" ON public."LfgRoom" USING btree ("listingChannelId", status);


--
-- Name: LfgRoom_listingMessageId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "LfgRoom_listingMessageId_key" ON public."LfgRoom" USING btree ("listingMessageId");


--
-- Name: LfgRoom_status_autoDeleteAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgRoom_status_autoDeleteAt_idx" ON public."LfgRoom" USING btree (status, "autoDeleteAt");


--
-- Name: LfgRoom_status_playEndsAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgRoom_status_playEndsAt_idx" ON public."LfgRoom" USING btree (status, "playEndsAt");


--
-- Name: LfgRoom_status_scheduledFor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "LfgRoom_status_scheduledFor_idx" ON public."LfgRoom" USING btree (status, "scheduledFor");


--
-- Name: NotificationDelivery_dedupeKey_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_key" ON public."NotificationDelivery" USING btree ("dedupeKey");


--
-- Name: NotificationDelivery_roomId_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "NotificationDelivery_roomId_status_idx" ON public."NotificationDelivery" USING btree ("roomId", status);


--
-- Name: NotificationDelivery_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON public."NotificationDelivery" USING btree ("userId", "createdAt");


--
-- Name: NotificationDelivery_userId_lfgGameId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "NotificationDelivery_userId_lfgGameId_createdAt_idx" ON public."NotificationDelivery" USING btree ("userId", "lfgGameId", "createdAt");


--
-- Name: Rating_ratedId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Rating_ratedId_createdAt_idx" ON public."Rating" USING btree ("ratedId", "createdAt");


--
-- Name: Rating_raterId_sessionId_ratedId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Rating_raterId_sessionId_ratedId_key" ON public."Rating" USING btree ("raterId", "sessionId", "ratedId");


--
-- Name: Report_reportedId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Report_reportedId_status_createdAt_idx" ON public."Report" USING btree ("reportedId", status, "createdAt");


--
-- Name: Report_reporterId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Report_reporterId_createdAt_idx" ON public."Report" USING btree ("reporterId", "createdAt");


--
-- Name: UserAvailability_dayOfWeek_startMinute_endMinute_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "UserAvailability_dayOfWeek_startMinute_endMinute_idx" ON public."UserAvailability" USING btree ("dayOfWeek", "startMinute", "endMinute");


--
-- Name: UserAvailability_userId_dayOfWeek_startMinute_endMinute_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UserAvailability_userId_dayOfWeek_startMinute_endMinute_key" ON public."UserAvailability" USING btree ("userId", "dayOfWeek", "startMinute", "endMinute");


--
-- Name: UserGamePreference_lfgGameId_interestStatus_notificationsEn_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "UserGamePreference_lfgGameId_interestStatus_notificationsEn_idx" ON public."UserGamePreference" USING btree ("lfgGameId", "interestStatus", "notificationsEnabled");


--
-- Name: ZarkGame_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ZarkGame_slug_key" ON public."ZarkGame" USING btree (slug);


--
-- Name: ZarkMatchResult_matchId_rank_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ZarkMatchResult_matchId_rank_key" ON public."ZarkMatchResult" USING btree ("matchId", rank);


--
-- Name: ZarkMatchResult_matchId_userId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ZarkMatchResult_matchId_userId_key" ON public."ZarkMatchResult" USING btree ("matchId", "userId");


--
-- Name: ZarkMatch_gameId_startedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ZarkMatch_gameId_startedAt_idx" ON public."ZarkMatch" USING btree ("gameId", "startedAt");


--
-- Name: AiUsageDaily AiUsageDaily_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AiUsageDaily"
    ADD CONSTRAINT "AiUsageDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BugReport BugReport_reporterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BugReport"
    ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DailyAnswer DailyAnswer_challengeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DailyAnswer"
    ADD CONSTRAINT "DailyAnswer_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES public."DailyChallenge"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DailyAnswer DailyAnswer_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DailyAnswer"
    ADD CONSTRAINT "DailyAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DailyChallenge DailyChallenge_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DailyChallenge"
    ADD CONSTRAINT "DailyChallenge_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."ZarkGame"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EngagementPoint EngagementPoint_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."EngagementPoint"
    ADD CONSTRAINT "EngagementPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameProfile GameProfile_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GameProfile"
    ADD CONSTRAINT "GameProfile_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."ZarkGame"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameProfile GameProfile_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GameProfile"
    ADD CONSTRAINT "GameProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameQuestion GameQuestion_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GameQuestion"
    ADD CONSTRAINT "GameQuestion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."ZarkGame"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LfgGameCatalog LfgGameCatalog_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgGameCatalog"
    ADD CONSTRAINT "LfgGameCatalog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."LfgGameCategory"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LfgMember LfgMember_roomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgMember"
    ADD CONSTRAINT "LfgMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES public."LfgRoom"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LfgMember LfgMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgMember"
    ADD CONSTRAINT "LfgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LfgRoomRating LfgRoomRating_raterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgRoomRating"
    ADD CONSTRAINT "LfgRoomRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LfgRoomRating LfgRoomRating_roomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgRoomRating"
    ADD CONSTRAINT "LfgRoomRating_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES public."LfgRoom"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LfgRoom LfgRoom_hostId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgRoom"
    ADD CONSTRAINT "LfgRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LfgRoom LfgRoom_lfgGameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LfgRoom"
    ADD CONSTRAINT "LfgRoom_lfgGameId_fkey" FOREIGN KEY ("lfgGameId") REFERENCES public."LfgGameCatalog"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TrustScore TrustScore_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TrustScore"
    ADD CONSTRAINT "TrustScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserAvailability UserAvailability_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserAvailability"
    ADD CONSTRAINT "UserAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserGamePreference UserGamePreference_lfgGameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserGamePreference"
    ADD CONSTRAINT "UserGamePreference_lfgGameId_fkey" FOREIGN KEY ("lfgGameId") REFERENCES public."LfgGameCatalog"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserGamePreference UserGamePreference_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserGamePreference"
    ADD CONSTRAINT "UserGamePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ZarkMatchResult ZarkMatchResult_matchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ZarkMatchResult"
    ADD CONSTRAINT "ZarkMatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES public."ZarkMatch"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ZarkMatchResult ZarkMatchResult_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ZarkMatchResult"
    ADD CONSTRAINT "ZarkMatchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ZarkMatch ZarkMatch_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ZarkMatch"
    ADD CONSTRAINT "ZarkMatch_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."ZarkGame"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict ugOSSPUD2xyxur7gLZCgjLIcha3X2Flm1M3I2BKrLXtlmq3b2yzIducm96ddb2a

