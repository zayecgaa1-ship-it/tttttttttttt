import "dotenv/config";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Events, GatewayIntentBits, ModalBuilder, PermissionFlagsBits, REST, Routes,
  MessageFlags, OverwriteType, SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from "discord.js";
import { createClient } from "redis";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { apiGet, apiSend } from "./api/client.js";

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const clientId = process.env.DISCORD_CLIENT_ID;
const lfgListingChannelId = process.env.DISCORD_LFG_CHANNEL_ID;
const adminRoleIds = (process.env.ADMIN_ROLE_IDS ?? "").split(",").map((role) => role.trim()).filter((role) => /^\d{17,20}$/.test(role));
// Only these channels accept user image uploads. Configure the three channel
// IDs in Railway, comma-separated. Scam links are removed everywhere.
const mediaAllowedChannelIds = new Set((process.env.DISCORD_MEDIA_ALLOWED_CHANNEL_IDS ?? "").split(",").map((id) => id.trim()).filter((id) => /^\d{17,20}$/.test(id)));
const disboardBotId = process.env.DISBOARD_BOT_ID?.trim() || "302050872383242240";
const roomCardBackgroundPath = path.resolve(process.cwd(), "apps/web/public/assets/zark-room-card-bg.png");
const activeDailyChannels = new Map<string, ActiveDaily>();
const activeRaceChannels = new Map<string, ActiveRace>();
const brand = { name: "Zark LFG System", tagline: "Zark LFG System — فريقك أقرب مما تتخيل", color: 0xe50914 };

// تضمين خط عربي مباشرة في الكود لضمان العمل على أي سيرفر بدون خطوط نظام
const arabicFontPath = path.resolve(process.cwd(), "apps/bot/src/fonts/NotoSansArabic.ttf");
const arabicFontB64 = fs.existsSync(arabicFontPath) ? fs.readFileSync(arabicFontPath).toString("base64") : "";
const fontFaceStyle = arabicFontB64
  ? `@font-face{font-family:'NotoArabic';src:url('data:font/truetype;base64,${arabicFontB64}') format('truetype');font-weight:100 900;}`
  : "";
const arabicFont = arabicFontB64 ? "'NotoArabic','DejaVu Sans',sans-serif" : "'DejaVu Sans',sans-serif";
let runtimeSettings: GuildRuntimeSettings = {
  guildId: guildId ?? "default",
  botName: brand.name,
  tagline: brand.tagline,
  lfgChannelId: lfgListingChannelId,
  lfgCategoryId: process.env.DISCORD_LFG_CATEGORY_ID,
  reportChannelId: process.env.DISCORD_REPORT_CHANNEL_ID ?? "1467945220376363131",
  websiteUrl: process.env.PUBLIC_SITE_URL ?? "https://zark-ps.com",
  dmNotificationsEnabled: true,
  quickMatchEnabled: true,
  autoSmartRoomsEnabled: false,
  ratingsEnabled: true,
  reportsEnabled: true,
  autoCreateRoomChannels: true,
  maxDmPerDay: 3,
  notificationCooldownMinutes: 20,
  maxActiveRoomsPerUser: 1,
  defaultRoomDurationMinutes: 60,
  roomGraceMinutes: 5,
  aiChatEnabled: true,
  aiDailyMessagesPerUser: 60,
  aiGlobalDailyMessages: 5000,
  aiDailyTokenBudgetPerUser: 50000,
  aiGlobalDailyTokenBudget: 1000000,
  aiMaxOutputTokens: 250,
};

const playChoices = [
  ["📘 help — اختصارات الألعاب", "help"],
  ["🌍 ترجم", "translate"], ["🚩 أعلام", "flags"], ["🌐 عواصم ودول", "capitals"], ["⌨️ أسرع كتابة", "fast-type"],
  ["🧩 إكمل الكلمة", "complete-word"], ["🔤 ترتيب الجملة", "word-order"], ["🎯 حساب سريع", "math"], ["😀 خمن الإيموجي", "emoji-guess"],
  ["🚘 شعارات السيارات", "car-logos"], ["🏢 شعارات الشركات", "company-logos"], ["🎭 بطل الأنمي", "anime-silhouette"],
  ["🎮 خمن اللعبة", "game-logos"],
  ["✅ صح أو خطأ", "true-false"], ["🔡 ترتيب الحروف", "letter-order"], ["👤 من أنا؟", "who-am-i"], ["❓ معلومات عامة", "trivia"], ["🧠 ألغاز سريعة", "riddles"], ["🎮 اختبار اللاعبين", "gaming-quiz"],
  ["🐾 عالم الحيوانات", "animals"], ["🔬 علوم", "science"], ["🪐 الفضاء", "space"], ["⚽ كرة القدم", "football"], ["💻 تقنية", "technology"], ["🎬 أفلام", "movies"],
  ["📺 مسلسلات", "series"], ["🎵 موسيقى", "music"], ["🍕 مأكولات", "food"], ["🌿 الطبيعة", "nature"], ["🎨 ألوان", "colors"], ["🗣️ لغات", "languages"],
  ["🏛️ تاريخ", "history"], ["💡 اختراعات", "inventions"], ["🌐 الإنترنت", "internet"], ["🧩 منطق", "logic"], ["📝 مرادفات", "synonyms"], ["↔️ أضداد", "antonyms"],
  ["🗺️ بلدان العالم", "countries"], ["🏅 رياضات", "sports"], ["🌍 جغرافيا", "geography"], ["📚 كتب وقصص", "books"],
] as const;

const dotAliases = new Map([
  [".ترجم", "translate"], [".اعلام", "flags"], [".أعلام", "flags"], [".عواصم", "capitals"], [".اسرع", "fast-type"], [".أسرع", "fast-type"],
  [".اكمل", "complete-word"], [".أكمل", "complete-word"], [".ترتيب", "word-order"], [".حساب", "math"], [".ايموجي", "emoji-guess"], [".أنمي", "anime-silhouette"], [".انمي", "anime-silhouette"],
  [".صح", "true-false"], [".حروف", "letter-order"], [".منانا", "who-am-i"], [".معلومات", "trivia"],
  [".سيارات", "car-logos"], [".شركات", "company-logos"], [".لعبة", "game-logos"], [".العاب", "game-logos"], [".ألغاز", "riddles"], [".الغاز", "riddles"], [".قيمنق", "gaming-quiz"],
  [".حيوانات", "animals"], [".علوم", "science"], [".فضاء", "space"], [".كرة", "football"], [".تقنية", "technology"], [".افلام", "movies"], [".أفلام", "movies"], [".مسلسلات", "series"], [".موسيقى", "music"], [".مأكولات", "food"], [".طبيعة", "nature"], [".ألوان", "colors"], [".الوان", "colors"], [".لغات", "languages"], [".تاريخ", "history"], [".اختراعات", "inventions"], [".انترنت", "internet"], [".إنترنت", "internet"], [".منطق", "logic"], [".مرادفات", "synonyms"], [".أضداد", "antonyms"], [".اضداد", "antonyms"], [".بلدان", "countries"], [".رياضات", "sports"], [".جغرافيا", "geography"], [".كتب", "books"],
  [".مساعدة العاب", "help"], [".play help", "help"],
]);

if (!token) {
  console.warn("DISCORD_TOKEN غير مضبوط؛ تم تخطي تشغيل بوت Discord.");
} else {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates] });
  const commands = buildCommands();
  const listingInFlight = new Set<string>();
  const roomSpaceInFlight = new Set<string>();
  const notifiedRooms = new Set<string>();
  const ratingRequestsInFlight = new Set<string>();
  const roomByVoiceChannel = new Map<string, string>();
  const mentionStatusCooldown = new Map<string, number>();
  const moderationAlertCooldown = new Map<string, number>();
  let botEventSubscriber: ReturnType<typeof createClient> | undefined;

  if (guildId && clientId) {
    await new REST({ version: "10" }).setToken(token).put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`تم تسجيل ${commands.length} أوامر Zark في السيرفر ${guildId}`);
  }

  client.once(Events.ClientReady, async (ready) => {
    try {
      runtimeSettings = await apiGet<GuildRuntimeSettings>("/api/settings", true);
      brand.name = runtimeSettings.botName;
      brand.tagline = runtimeSettings.tagline;
    } catch (error) {
      console.error("Bot settings load failed; using environment defaults", error);
    }
    console.log(`${brand.name} متصل باسم ${ready.user.tag}`);
    if (!mediaAllowedChannelIds.size) console.warn("Media protection allowlist is empty: set DISCORD_MEDIA_ALLOWED_CHANNEL_IDS before enabling image-only channel protection.");
    await startEventSubscriber().catch((error) => console.error("Redis bot subscriber unavailable", error));
    const startupTasks = await Promise.allSettled([reconcileRoomListings(), reconcileRoomSpaces(), deliverPendingRatingRequests(), cleanupFinishedRoomSpaces(), sendHeartbeat(), runBumpReminderCycle(), syncLoyaltyRoleMembers()]);
    for (const result of startupTasks) if (result.status === "rejected") console.error("Bot startup reconciliation failed", result.reason);
    const heartbeatTimer = setInterval(() => void sendHeartbeat(), 25_000);
    const cleanupTimer = setInterval(() => void cleanupFinishedRoomSpaces().catch((error) => console.error("LFG cleanup cycle failed", error)), 30_000);
    const bumpTimer = setInterval(() => void runBumpReminderCycle().catch((error) => console.error("Bump reminder failed", error)), 60_000);
    const loyaltyTimer = setInterval(() => void syncLoyaltyRoleMembers().catch((error) => console.error("Loyalty role sync failed", error)), 5 * 60_000);
    heartbeatTimer.unref();
    cleanupTimer.unref();
    bumpTimer.unref();
    loyaltyTimer.unref();
  });
  client.on(Events.Error, (error) => console.error("Discord client error", error));
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (oldState.member?.user.bot || newState.member?.user.bot || oldState.channelId === newState.channelId) return;
    try {
      const displayName = newState.member?.displayName ?? oldState.member?.displayName ?? newState.id;
      const oldRoomId = oldState.channelId ? roomByVoiceChannel.get(oldState.channelId) : undefined;
      const newRoomId = newState.channelId ? roomByVoiceChannel.get(newState.channelId) : undefined;
      const avatarUrl = (newState.member?.user ?? oldState.member?.user)?.displayAvatarURL({ extension: "png", size: 256 });
      if (oldRoomId) await apiSend<LiveRoom>(`/api/lfg/${oldRoomId}/voice`, "POST", { userId: newState.id, displayName, avatarUrl, action: "LEAVE" });
      if (newRoomId) await apiSend<LiveRoom>(`/api/lfg/${newRoomId}/voice`, "POST", { userId: newState.id, displayName, avatarUrl, action: "JOIN" });
    } catch (error) {
      console.error("LFG voice tracking failed", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) return await completePlayAutocomplete(interaction);
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "daily") return await daily(interaction);
        if (interaction.commandName === "play") return await play(interaction, interaction.options.getString("game") ?? undefined, interaction.options.getInteger("rounds") ?? 1, interaction.options.getInteger("seconds") ?? undefined);
        if (interaction.commandName === "profile") return await profile(interaction, interaction.options.getUser("user")?.id ?? interaction.user.id);
        if (interaction.commandName === "loyalty") return await loyalty(interaction);
        if (interaction.commandName === "weekly") return await weekly(interaction);
        if (interaction.commandName === "event-hour") return await eventHour(interaction);
        if (interaction.commandName === "pulse") return await pulse(interaction);
        if (interaction.commandName === "leaderboard") return await gameLeaderboard(interaction, interaction.options.getString("type") ?? "game");
        if (interaction.commandName === "help") return await help(interaction);
        if (interaction.commandName === "help-plus") return await helpPlus(interaction);
        if (["availability", "وقت-فراغي"].includes(interaction.commandName)) return await availability(interaction);
        if (interaction.commandName === "lfg") return await handleLfgCommand(interaction);
      }
      if (interaction.isStringSelectMenu()) return await handleSelect(interaction);
      if (interaction.isButton()) return await handleButton(interaction);
      if (interaction.isModalSubmit()) return await handleModal(interaction);
    } catch (error) {
      console.error("interaction failed", error);
      if (interaction.isRepliable()) {
        const message = { content: `❌ ${error instanceof Error ? error.message : "حدث خطأ غير متوقع"}` };
        if (interaction.deferred) await interaction.editReply(message).catch(() => undefined);
        else if (interaction.replied) await interaction.followUp({ ...message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        else await interaction.reply({ ...message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) {
      if (message.author.id === disboardBotId && isDisboardBumpConfirmation(message)) {
        const bumperId = (message as any).interactionMetadata?.user?.id ?? (message as any).interaction?.user?.id;
        await apiSend("/api/bot/bump-reminder/completed", "POST", { guildId: message.guildId, userId: bumperId }).catch((error) => console.error("Failed to record DISBOARD bump", error));
        console.log(`DISBOARD bump recorded for guild ${message.guildId}; next reminder in 2 hours`);
      }
      return;
    }
    if (await enforceMessageSafety(message)) return;
    const player = { userId: message.author.id, displayName: message.member?.displayName ?? message.author.username, answer: message.content };
    try {
      const race = activeRaceChannels.get(message.channelId);
      if (race) {
        const result = await apiSend<RaceAnswer>(`/api/play/${race.matchId}/answer`, "POST", player);
        if (result.correct && result.points > 0) await finishRaceWithWinner(message.channel, race, player.displayName, result);
        else if (result.expired) await expireActiveRace(message.channelId, race.matchId, message.channel);
        else if (result.capped) clearActiveRace(message.channelId, race.matchId);
        return;
      }
      const dailyRace = activeDailyChannels.get(message.channelId);
      if (dailyRace) {
        const result = await apiSend<RaceAnswer>("/api/daily/answer", "POST", player);
        if (result.correct && result.points > 0) {
          activeDailyChannels.delete(message.channelId);
          const prompt = await message.channel.messages.fetch(dailyRace.messageId).catch(() => null);
          await prompt?.delete().catch(() => undefined);
          await message.channel.send({ content: `🏆 **${player.displayName}** حسم تحدي اليوم أولًا وربح **${result.points} XP**!` });
        } else if (result.expired || result.capped) activeDailyChannels.delete(message.channelId);
        return;
      }
      const alias = dotAliases.get(message.content.trim().toLocaleLowerCase("ar"));
      if (["help+", ".help+", "مساعدة+", ".مساعدة+"].includes(message.content.trim().toLocaleLowerCase("ar"))) await helpPlusForMessage(message);
      else if (alias === "help") await playHelpForMessage(message);
      else if (alias) await startRaceForMessage(message, alias);
      else if (message.content.trim() === ".وقت فراغي") {
        const current = await apiGet<UserAvailability>(`/api/users/${message.author.id}/availability`, true);
        await message.reply(availabilityPanelPayload(current));
      } else await replyWithMentionedMemberStatus(message);
    } catch (error) {
      await message.reply(`❌ ${error instanceof Error ? error.message : "تعذر تشغيل اللعبة"}`).catch(() => undefined);
    }
  });

  void client.login(token);

  async function handleLfgCommand(interaction: any) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") return showLfgGamePicker(interaction);
    if (subcommand === "profile") return profile(interaction, interaction.options.getUser("user")?.id ?? interaction.user.id);
    if (subcommand === "top") return lfgTop(interaction, interaction.options.getString("metric") ?? "engagement");
    if (subcommand === "rooms") return lfgRooms(interaction);
    if (subcommand === "smart") return smartLfg(interaction);
    if (subcommand === "auto") return setAutoSmartRooms(interaction);
    if (subcommand === "interests") return showInterests(interaction);
    if (subcommand === "report") return showPlayerReportModal(interaction, interaction.options.getUser("user", true).id);
    if (subcommand === "bug") return showBugReportModal(interaction);
    if (subcommand === "rate") return submitRating(interaction);
  }

  async function handleSelect(interaction: any) {
    if (interaction.customId.startsWith("lfg:host-mute:") || interaction.customId.startsWith("lfg:host-kick:")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const [, action, roomId] = interaction.customId.split(":");
      const room = await apiGet<LiveRoom>(`/api/lfg/${roomId}`);
      if (room.hostId !== interaction.user.id) return interaction.editReply({ content: "هذه أدوات مضيف الغرفة فقط." });
      const targetId = interaction.values[0];
      if (targetId === interaction.user.id) return interaction.editReply({ content: "لا يمكنك تطبيق هذا الإجراء على نفسك." });
      const member = await interaction.guild?.members.fetch(targetId).catch(() => null);
      if (!member) return interaction.editReply({ content: "لم أتمكن من العثور على اللاعب داخل السيرفر." });
      if (action === "host-mute") {
        if (member.voice.channelId !== room.voiceChannelId) return interaction.editReply({ content: "اللاعب ليس داخل Voice هذه الغرفة الآن." });
        const muted = !member.voice.serverMute;
        await member.voice.setMute(muted, `Zark room host control: ${room.id}`);
        return interaction.editReply({ content: muted ? `🔇 تم ميوت ${member}.` : `🔊 تم إلغاء ميوت ${member}.` });
      }
      await apiSend<LiveRoom>(`/api/lfg/${roomId}/kick`, "POST", { actorId: interaction.user.id, userId: targetId });
      if (member.voice.channelId === room.voiceChannelId) await member.voice.disconnect(`Zark room host kick: ${room.id}`).catch(() => undefined);
      return interaction.editReply({ content: `🚪 تم إخراج ${member} من الغرفة والـVoice.` });
    }
    if (interaction.customId.startsWith("lfg:rating-player:")) {
      await interaction.deferUpdate();
      const roomId = interaction.customId.split(":")[3];
      const ratedId = interaction.values[0];
      const room = await apiGet<LiveRoom>(`/api/lfg/${roomId}`);
      const player = room.members.find((member) => member.id === ratedId);
      if (!player) return interaction.editReply({ content: "هذا اللاعب لم يعد ضمن الجلسة.", embeds: [], components: [] });
      return interaction.editReply({
        content: `كم نجمة تعطي **${player.displayName}**؟`,
        embeds: [],
        components: [ratingStarsRow(`lfg:rating-player-stars:${roomId}:${ratedId}`), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`lfg:rating-open:${roomId}`).setLabel("رجوع").setEmoji("↩️").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`lfg:rating-skip:${roomId}`).setLabel("إنهاء").setStyle(ButtonStyle.Secondary))],
      });
    }
    if (interaction.customId === "lfg:rooms:select") {
      await interaction.deferUpdate();
      const rooms = await apiGet<LiveRoom[]>("/api/lfg");
      const room = rooms.find((item) => item.id === interaction.values[0]);
      if (!room) return interaction.editReply({ content: "هذه الغرفة لم تعد متاحة. استخدم `/lfg rooms` لتحديث القائمة.", embeds: [], components: [], attachments: [] });
      const payload = await roomMessagePayload(room, true);
      return interaction.editReply({ ...payload, components: [roomButtons(room.id, room.gameSlug, room)], attachments: [] });
    }
    if (interaction.customId === "lfg:create:game") {
      const slug = interaction.values[0];
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`lfg:players:${slug}`).setPlaceholder("كم لاعب تحتاج؟").addOptions([2, 3, 4, 5, 6, 8, 10].map((count) => ({ label: `${count} لاعبين`, value: String(count), emoji: "👥" }))));
      return interaction.update({ embeds: [baseEmbed().setTitle("👥 اختر حجم الفريق").setDescription("Zark سيطابقك مع المهتمين بنفس اللعبة ويرسل دعوات خاصة بدون إزعاج.")], components: [row] });
    }
    if (interaction.customId.startsWith("lfg:players:")) {
      const slug = interaction.customId.split(":")[2];
      const count = interaction.values[0];
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`lfg:duration:${slug}:${count}`).setPlaceholder("حدد مدة اللعب").addOptions([
          { label: "30 دقيقة", value: "30", emoji: "⚡" },
          { label: "ساعة", value: "60", emoji: "🕐" },
          { label: "ساعة ونصف", value: "90", emoji: "⏱️" },
          { label: "ساعتان", value: "120", emoji: "🎮" },
          { label: "3 ساعات", value: "180", emoji: "🔥" },
        ]),
      );
      return interaction.update({ embeds: [baseEmbed().setTitle("⏱️ اختر مدة الجلسة").setDescription(`الفريق المطلوب: **${count} لاعبين**\nسيُنهي Zark الغرفة تلقائيًا بعد انتهاء المدة.`)], components: [row] });
    }
    if (interaction.customId.startsWith("lfg:duration:")) {
      const [, , slug, count] = interaction.customId.split(":");
      const duration = interaction.values[0];
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`lfg:create:${slug}:${count}:${duration}:voice`).setLabel("إنشاء مع Voice").setEmoji("🎙️").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`lfg:create:${slug}:${count}:${duration}:novoice`).setLabel("بدون Voice").setEmoji("💬").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`lfg:details:${slug}:${count}:${duration}`).setLabel("إضافة تفاصيل").setEmoji("📝").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`lfg:schedule:${slug}:${count}:${duration}`).setLabel("لاحقًا").setEmoji("🕐").setStyle(ButtonStyle.Secondary),
      );
      return interaction.update({ embeds: [baseEmbed().setTitle("⚡ جاهز للإنشاء").setDescription(`الفريق: **${count} لاعبين** · المدة: **${duration} دقيقة**\nأنشئ بسرعة أو أضف وصفًا وGame Mode.`)], components: [row] });
    }
    if (interaction.customId === "lfg:interest:select") {
      const slug = interaction.values[0];
      return interaction.update({ embeds: [baseEmbed().setTitle("❤️ إعداد اهتمام اللعبة").setDescription("اختر كيف تريد أن يتعامل Zark مع هذه اللعبة.")], components: [interestButtons(slug)] });
    }
  }

  async function handleButton(interaction: any) {
    const parts = interaction.customId.split(":");
    if (interaction.customId === "zark_play_now") return play(interaction);
    if (interaction.customId === "pulse:smart") return smartLfg(interaction);
    if (interaction.customId === "pulse:availability") return availability(interaction);
    if (interaction.customId === "pulse:loyalty") return loyalty(interaction);
    if (interaction.customId === "loyalty:buy-vip") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const data = await apiSend<{ points: number; vipUnlocked: boolean }>(`/api/users/${interaction.user.id}/loyalty/buy-vip`, "POST", {});
      await syncLoyaltyRoles(interaction.user.id);
      return interaction.editReply({ content: `✅ تم شراء **Zark VIP**. رصيدك الآن: **${data.points}** نقطة.` });
    }
    if (parts[0] === "lfg" && parts[1] === "rating-open") {
      await interaction.deferUpdate();
      const room = await apiGet<LiveRoom>(`/api/lfg/${parts[2]}`);
      return interaction.editReply(ratingPanelPayload(room, interaction.user.id));
    }
    if (parts[0] === "lfg" && parts[1] === "rating-skip") return interaction.update({ content: "تم إغلاق التقييم. شكرًا لمشاركتك مع Zark ❤️", embeds: [], components: [] });
    if (parts[0] === "lfg" && parts[1] === "rating-player-stars") {
      await interaction.deferUpdate();
      const roomId = parts[2];
      const ratedId = parts[3];
      const stars = Number(parts[4]);
      await apiSend(`/api/lfg/${roomId}/ratings`, "POST", { raterId: interaction.user.id, raterName: interaction.user.globalName ?? interaction.user.username, ratedId, stars, tags: [] });
      const room = await apiGet<LiveRoom>(`/api/lfg/${roomId}`);
      return interaction.editReply(ratingPanelPayload(room, interaction.user.id, `✅ تم تقييم اللاعب بـ **${stars}/5**. تستطيع تقييم لاعب آخر أو إنهاء التقييم.`));
    }
    if (parts[0] === "lfg" && parts[1] === "rating-room") {
      await interaction.deferUpdate();
      const roomId = parts[2];
      const stars = Number(parts[3]);
      await apiSend(`/api/lfg/${roomId}/room-rating`, "POST", { raterId: interaction.user.id, raterName: interaction.user.globalName ?? interaction.user.username, stars });
      const room = await apiGet<LiveRoom>(`/api/lfg/${roomId}`);
      return interaction.editReply(ratingPanelPayload(room, interaction.user.id, `✅ تم تقييم الغرفة بـ **${stars}/5**. تستطيع الآن تقييم اللاعبين أو إنهاء التقييم.`));
    }
    if (parts[0] === "availability" && parts[1] === "set") {
      await interaction.deferUpdate();
      const current = await apiGet<UserAvailability>(`/api/users/${interaction.user.id}/availability`, true);
      const activity = parts[2] as UserAvailability["currentActivity"];
      const minutes = Number(parts[3]);
      const activityUntil = activity === "AWAY" || !minutes ? null : new Date(Date.now() + minutes * 60_000).toISOString();
      const saved = await apiSend<UserAvailability>(`/api/users/${interaction.user.id}/availability`, "PUT", { currentActivity: activity, activityUntil, activityNote: null, mentionPolicy: current.mentionPolicy });
      return interaction.editReply(availabilityPanelPayload(saved, true));
    }
    if (parts[0] !== "lfg") return;
    if (parts[1] === "create" && parts[2] === "roblox") return showRobloxRoomModal(interaction, Number(parts[3]), Number(parts[4]), parts[5] === "voice");
    if (parts[1] === "create") return createRoomFromInteraction(interaction, parts[2], Number(parts[3]), Number(parts[4]), parts[5] === "voice");
    if (parts[1] === "details") return showRoomDetailsModal(interaction, parts[2], Number(parts[3]), Number(parts[4]));
    if (parts[1] === "schedule") return showScheduledRoomModal(interaction, parts[2], Number(parts[3]), Number(parts[4]));
    if (parts[1] === "join") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const room = await apiSend<LiveRoom>(`/api/lfg/${parts[2]}/join`, "POST", actor(interaction));
      return interaction.editReply({ content: `✅ دخلت غرفة **${room.gameName}** — ${room.currentPlayers}/${room.maxPlayers}` });
    }
    if (parts[1] === "leave") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const room = await apiSend<LiveRoom>(`/api/lfg/${parts[2]}/leave`, "POST", { userId: interaction.user.id });
      return interaction.editReply({ content: `🚪 خرجت من غرفة **${room.gameName}**.` });
    }
    if (parts[1] === "start" || parts[1] === "complete" || parts[1] === "close") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const room = await apiSend<LiveRoom>(`/api/lfg/${parts[2]}/${parts[1]}`, "POST", { actorId: interaction.user.id });
      const message = parts[1] === "start" ? "▶️ بدأت الجلسة." : parts[1] === "complete" ? "✅ تم إنهاء الجلسة واحتساب المشاركين الحقيقيين." : "🛑 تم إغلاق الغرفة.";
      return interaction.editReply({ content: `${message} **${room.gameName}**` });
    }
    if (parts[1] === "ignore") {
      await interaction.deferUpdate();
      await apiSend(`/api/lfg/${parts[2]}/notifications/${interaction.user.id}/status`, "POST", { status: "IGNORED" });
      return interaction.editReply({ content: "تم تجاهل هذه الدعوة فقط. اهتمامك باللعبة لم يتغير.", embeds: [], components: [] });
    }
    if (parts[1] === "interest-on") return setInterest(interaction, parts[2], true, true);
    if (parts[1] === "interest-off") return setInterest(interaction, parts[2], false, false);
    if (parts[1] === "notify") return setInterest(interaction, parts[2], true, true);
    if (parts[1] === "snooze-menu") return showSnoozeOptions(interaction, parts[2]);
    if (parts[1] === "snooze") return snoozeInterest(interaction, parts[2], Number(parts[3]));
    if (parts[1] === "mute") return muteInterest(interaction, parts[2]);
  }

  async function handleModal(interaction: any) {
    const parts = interaction.customId.split(":");
    if (parts[0] !== "lfg") return;
    if (parts[1] === "details") {
      const description = interaction.fields.getTextInputValue("description").trim();
      const gameMode = interaction.fields.getTextInputValue("gameMode").trim();
      return createRoomFromInteraction(interaction, parts[2], Number(parts[3]), Number(parts[4]), true, description || undefined, gameMode || undefined);
    }
    if (parts[1] === "schedule") {
      const scheduledFor = parseScheduledTime(interaction.fields.getTextInputValue("scheduledFor"));
      const description = interaction.fields.getTextInputValue("description").trim();
      const gameMode = interaction.fields.getTextInputValue("gameMode").trim();
      const mapName = parts[2] === "roblox" ? interaction.fields.getTextInputValue("mapName").trim() : undefined;
      return createRoomFromInteraction(interaction, parts[2], Number(parts[3]), Number(parts[4]), true, description || undefined, gameMode || undefined, scheduledFor, mapName);
    }
    if (parts[1] === "roblox") {
      const mapName = interaction.fields.getTextInputValue("mapName").trim();
      const gameMode = interaction.fields.getTextInputValue("gameMode").trim();
      const description = interaction.fields.getTextInputValue("description").trim();
      return createRoomFromInteraction(interaction, "roblox", Number(parts[2]), Number(parts[3]), parts[4] === "voice", description || undefined, gameMode || undefined, undefined, mapName);
    }
    if (parts[1] === "report") {
      const reason = interaction.fields.getTextInputValue("reason");
      const description = interaction.fields.getTextInputValue("description");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await apiSend("/api/reports/player", "POST", { reporterId: interaction.user.id, reporterName: displayName(interaction), reportedId: parts[2], reason, description });
      return interaction.editReply({ content: "✅ تم إرسال البلاغ للإدارة بسرية." });
    }
    if (parts[1] === "bug") {
      const title = interaction.fields.getTextInputValue("title");
      const description = interaction.fields.getTextInputValue("description");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await apiSend("/api/reports/bug", "POST", { reporterId: interaction.user.id, reporterName: displayName(interaction), title, description, context: "Discord Bot" });
      return interaction.editReply({ content: "✅ وصل تقرير الخطأ. شكرًا لمساعدتك في تحسين Zark." });
    }
  }

  async function daily(interaction: any) {
    if (activeRaceChannels.has(interaction.channelId) || activeDailyChannels.has(interaction.channelId)) throw new Error("توجد لعبة شغالة في هذه القناة. انتظر حتى تنتهي قبل بدء تحدٍ جديد.");
    await interaction.deferReply();
    const challenge = await apiGet<{ id: string; gameSlug: string; prompt: string; gameName: string; endsAt: string }>("/api/daily");
    const payload = await gameMessagePayload({ id: challenge.id, seriesId: `daily:${challenge.id}`, gameSlug: challenge.gameSlug, gameName: `تحدي اليوم · ${challenge.gameName}`, roundNumber: 1, totalRounds: 1, prompt: challenge.prompt, endsAt: challenge.endsAt }, true);
    await interaction.editReply({ ...payload, components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("zark_play_now").setLabel("لعبة سريعة").setEmoji("⚡").setStyle(ButtonStyle.Danger))] });
    const sent = await interaction.fetchReply();
    activeDailyChannels.set(interaction.channelId, { messageId: sent.id, challengeId: challenge.id });
  }

  async function play(interaction: any, gameSlug?: string, rounds = 1, seconds?: number) {
    if (gameSlug === "help") return playHelp(interaction);
    if (activeDailyChannels.has(interaction.channelId)) throw new Error("تحدي اليوم شغال في هذه القناة. انتظر حتى ينتهي قبل بدء لعبة أخرى.");
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    const match = await apiSend<ZarkMatch>("/api/play/start", "POST", { gameSlug, channelId: interaction.channelId, rounds, seconds });
    await interaction.editReply(await gameMessagePayload(match));
    const sent = await interaction.fetchReply();
    activateRace(interaction.channelId, match, sent.id, interaction.channel);
  }

  async function completePlayAutocomplete(interaction: any) {
    if (interaction.commandName !== "play") return interaction.respond([]);
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "game") return interaction.respond([]);
    const query = String(focused.value ?? "").trim().toLocaleLowerCase("ar");
    const choices = playChoices.filter(([label, value]) => !query || label.toLocaleLowerCase("ar").includes(query) || value.includes(query)).slice(0, 25);
    return interaction.respond(choices.map(([name, value]) => ({ name, value })));
  }

  async function startRaceForMessage(message: any, gameSlug: string) {
    if (activeDailyChannels.has(message.channelId)) throw new Error("توجد لعبة شغالة في هذه القناة. انتظر حتى تنتهي.");
    const match = await apiSend<ZarkMatch>("/api/play/start", "POST", { gameSlug, channelId: message.channelId, rounds: 1 });
    const sent = await message.channel.send(await gameMessagePayload(match));
    activateRace(message.channelId, match, sent.id, message.channel);
  }

  function playHelpEmbed() {
    return baseEmbed().setTitle("🎮 اختصارات ألعاب Zark").setDescription("اختر لعبة من `/play`، أو اكتب الاختصار مباشرة في الشات. لا يمكن بدء لعبة ثانية في نفس القناة حتى تنتهي الحالية.").addFields(
      { name: "🌍 معرفة وسرعة", value: "`.اعلام` · `.ترجم` · `.عواصم` · `.معلومات` · `.حساب`" },
      { name: "⌨️ كلمات", value: "`.اسرع` · `.اكمل` · `.ترتيب` · `.حروف` · `.صح` · `.منانا`" },
      { name: "🎯 شعارات وتخمين", value: "`.ايموجي` · `.سيارات` · `.شركات` · `.انمي` · `.لعبة` · `.ألغاز` · `.قيمنق`" },
      { name: "🌟 ألعاب إضافية", value: "`.حيوانات` `.علوم` `.فضاء` `.كرة` `.تقنية` `.افلام` `.مسلسلات` `.موسيقى` `.مأكولات` `.طبيعة` `.الوان` `.لغات` `.تاريخ` `.اختراعات` `.انترنت` `.منطق` `.مرادفات` `.اضداد` `.بلدان` `.رياضات` `.جغرافيا` `.كتب`" },
      { name: "🔁 جولات", value: "اكتب اسم اللعبة في `/play` للبحث ضمن **40 لعبة**، ثم اختر 2 أو 3 أو 4 أو 5 أو 10 جولات. كل لعبة تحتوي 400+ سؤال." },
    );
  }

  async function playHelp(interaction: any) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return interaction.editReply({ embeds: [playHelpEmbed()] });
  }

  async function playHelpForMessage(message: any) {
    return message.reply({ embeds: [playHelpEmbed()] });
  }

  async function showLfgGamePicker(interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [catalog, insights] = await Promise.all([
      apiGet<Array<{ name: string; icon?: string; games: Array<{ slug: string; name: string; icon?: string; description?: string }> }>>("/api/lfg/catalog"),
      apiGet<LfgInterestInsight[]>("/api/lfg/insights", true).catch(() => []),
    ]);
    const insightByGame = new Map(insights.map((item) => [item.gameSlug, item]));
    const games = catalog.flatMap((category) => category.games).slice(0, 25);
    const menu = new StringSelectMenuBuilder().setCustomId("lfg:create:game").setPlaceholder("اختر اللعبة الخارجية").addOptions(games.map((game) => {
      const insight = insightByGame.get(game.slug);
      return { label: game.name, value: game.slug, emoji: game.icon, description: insight ? `${insight.interestPercent}% مهتمون · ${insight.availableNowCount} فاضي الآن` : game.description?.slice(0, 100) };
    }));
    await interaction.editReply({ embeds: [baseEmbed().setTitle("🔎 أنشئ LFG").setDescription("اختر اللعبة، وبعدها Zark يجهز الفريق ويرسل للمهتمين المتفرغين فقط. استخدم `/lfg smart` ليختار Zark أفضل لعبة تلقائيًا.")], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
  }

  async function smartLfg(interaction: any) {
    await interaction.deferReply();
    const result = await apiSend<SmartMatchResult>("/api/lfg/smart-match", "POST", actor(interaction));
    const listedRoom = await publishRoomListing(result.room);
    const organizedRoom = listedRoom ?? result.room;
    await ensureRoomSpace(organizedRoom);
    if (!result.joinedExisting) await notifyInterestedPlayers(organizedRoom);
    const action = result.joinedExisting ? "وجدت لك غرفة مناسبة وانضممت إليها" : "أنشأت غرفة منظمة حسب الاهتمام والتفرغ";
    return interaction.editReply({
      embeds: [roomEmbed(organizedRoom).setTitle(`✨ ${action}`).setDescription(`**${result.insight.interestPercent}%** من الأعضاء مهتمون بـ ${result.insight.gameName} · **${result.insight.availableNowCount}** متفرغون الآن.\n\n${organizedRoom.description ?? ""}`)],
      components: [roomButtons(organizedRoom.id, organizedRoom.gameSlug, organizedRoom)],
    });
  }

  async function setAutoSmartRooms(interaction: any) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error("هذا الأمر للإدارة التي تملك صلاحية Manage Server فقط");
    const enabled = interaction.options.getBoolean("enabled");
    if (enabled === null) {
      return interaction.reply({ embeds: [baseEmbed().setTitle("🤖 حالة التجميع التلقائي").setDescription(runtimeSettings.autoSmartRoomsEnabled ? "✅ مفعّل: يفحص Zark الاهتمام والتفرغ كل 5 دقائق." : "⏸️ متوقف حاليًا. فعّله عبر `/lfg auto enabled:true`.")], flags: MessageFlags.Ephemeral });
    }
    const settings = await apiSend<GuildRuntimeSettings>("/api/settings/auto-smart-rooms", "POST", { adminId: interaction.user.id, enabled });
    runtimeSettings = settings;
    return interaction.reply({ embeds: [baseEmbed().setTitle(enabled ? "🤖 تم تفعيل التجميع التلقائي" : "⏸️ تم إيقاف التجميع التلقائي").setDescription(enabled ? "سيفحص Zark الاهتمام والتفرغ كل 5 دقائق، وينشئ غرفة فقط عندما يتوفر الحد الأدنى من اللاعبين." : "لن ينشئ Zark غرفًا تلقائيًا حتى تعيد التفعيل.")], flags: MessageFlags.Ephemeral });
  }

  async function createRoomFromInteraction(interaction: any, gameSlug: string, maxPlayers: number, durationMinutes: number, needsVoice: boolean, description?: string, gameMode?: string, scheduledFor?: string, mapName?: string) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const room = await apiSend<LiveRoom>("/api/lfg/rooms", "POST", { ...actor(interaction), gameSlug, maxPlayers, durationMinutes, needsVoice, description, gameMode, scheduledFor, mapName });
    const listedRoom = await publishRoomListing(room);
    await ensureRoomSpace(listedRoom ?? room);
    await notifyInterestedPlayers(listedRoom ?? room);
    return interaction.editReply({ embeds: [roomEmbed(room)], components: [roomButtons(room.id, room.gameSlug, room)] });
  }

  async function startEventSubscriber() {
    if (!process.env.REDIS_URL || botEventSubscriber?.isOpen) return;
    botEventSubscriber = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5_000 } });
    botEventSubscriber.on("error", (error) => console.error("Redis bot subscriber error", error));
    await botEventSubscriber.connect();
    await botEventSubscriber.subscribe("zark:events", (raw) => {
      void handleDomainEvent(raw).catch((error) => console.error("LFG realtime event failed", error));
    });
  }

  async function handleDomainEvent(raw: string) {
    const message = JSON.parse(raw) as { event?: { eventType?: string; payload?: { room?: LiveRoom; settings?: GuildRuntimeSettings; reportId?: string; reportKind?: "PLAYER" | "BUG"; recipientId?: string; reporterId?: string; authorRole?: "USER" | "ADMIN"; status?: string; userId?: string } } };
    const eventType = message.event?.eventType;
    const payload = message.event?.payload;
    const room = payload?.room;
    const settings = payload?.settings;
    if (eventType === "guild.settings_updated" && settings) {
      const channelChanged = runtimeSettings.lfgChannelId !== settings.lfgChannelId;
      runtimeSettings = settings;
      brand.name = settings.botName;
      brand.tagline = settings.tagline;
      await reconcileRoomListings(channelChanged);
      return;
    }
    if (eventType === "report.created" && payload?.reportId && payload.reportKind) {
      await publishReportNotification(payload.reportKind, payload.reportId, false);
      return;
    }
    if (eventType === "report.message_created" && payload?.reportId && payload.reportKind) {
      if (payload.authorRole === "ADMIN" && payload.recipientId) await notifyReportOwner(payload.recipientId, payload.reportKind, payload.reportId, "💬 ردّت إدارة Zark على تذكرتك.");
      else await publishReportNotification(payload.reportKind, payload.reportId, true);
      return;
    }
    if (eventType === "report.status_changed" && payload?.reportId && payload.reportKind && payload.reporterId) {
      await notifyReportOwner(payload.reporterId, payload.reportKind, payload.reportId, `📌 تم تحديث حالة تذكرتك إلى **${payload.status ?? "محدّثة"}**.`);
      return;
    }
    if (eventType === "loyalty.updated" && payload?.userId) {
      await syncLoyaltyRoles(payload.userId);
      return;
    }
    if (!room) return;
    if (eventType === "lfg.created") {
      const listedRoom = await publishRoomListing(room);
      await ensureRoomSpace(listedRoom ?? room);
      await notifyInterestedPlayers(listedRoom ?? room);
    }
    if (eventType === "lfg.room_ready") {
      await syncRoomListing(room);
      await ensureRoomSpace(room);
      const readyRoom = await apiGet<LiveRoom>(`/api/lfg/${room.id}`);
      await notifyScheduledMembers(readyRoom);
      await apiSend(`/api/lfg/${room.id}/reminder-delivered`, "POST", {});
    }
    if (eventType === "lfg.attendance_warning") {
      await syncRoomListing(room);
      await notifyScheduledAttendanceWarning(room);
    }
    if (["lfg.member_joined", "lfg.member_left", "lfg.updated", "lfg.started", "lfg.voice_joined", "lfg.voice_left", "lfg.room_created"].includes(eventType ?? "")) {
      await syncRoomListing(room);
      await ensureRoomSpace(room);
    }
    if (eventType === "lfg.completed") {
      await sendRatingRequests(room);
      await syncRoomListing(room);
      await finalizeRoomSpace(room);
    }
    if (eventType === "lfg.closed") {
      await syncRoomListing(room);
      await finalizeRoomSpace(room);
    }
  }

  async function syncLoyaltyRoles(userId: string) {
    if (!guildId) return;
    const [guild, loyalty] = await Promise.all([client.guilds.fetch(guildId), apiGet<{ lifetimePoints: number; vipUnlocked: boolean }>(`/api/users/${userId}/loyalty`, true)]);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    const definitions = [
      { name: "Zark Loyal", eligible: loyalty.lifetimePoints >= 500, color: 0xe50914 },
      { name: "Zark Elite", eligible: loyalty.lifetimePoints >= 1500, color: 0xf1c40f },
      { name: "Zark VIP", eligible: loyalty.vipUnlocked, color: 0x9b59b6 },
    ];
    for (const definition of definitions) {
      let role = guild.roles.cache.find((item) => item.name === definition.name);
      if (!role && definition.eligible) role = await guild.roles.create({ name: definition.name, color: definition.color, reason: "Zark loyalty rewards" }).catch(() => undefined);
      if (!role || !role.editable) continue;
      if (definition.eligible && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => undefined);
      if (!definition.eligible && member.roles.cache.has(role.id)) await member.roles.remove(role).catch(() => undefined);
    }
  }

  async function syncLoyaltyRoleMembers() {
    const users = await apiGet<Array<{ id: string }>>("/api/loyalty/role-members");
    for (const user of users) await syncLoyaltyRoles(user.id);
  }

  async function publishReportNotification(kind: "PLAYER" | "BUG", reportId: string, isReply: boolean) {
    const channelId = runtimeSettings.reportChannelId || process.env.DISCORD_REPORT_CHANNEL_ID || "1467945220376363131";
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch((error) => {
      console.error(`Report channel ${channelId} unavailable`, error);
      return null;
    });
    if (!channel?.isTextBased() || !("send" in channel)) return;
    const report = await apiGet<ReportThread>(`/api/reports/${kind}/${reportId}`, true);
    const target = kind === "PLAYER" && report.reported ? `\n⚠️ **ضد:** <@${report.reported.id}> — ${report.reported.displayName}` : "";
    const detail = report.description ? `\n\n${trimText(report.description, 900)}` : "";
    const embed = baseEmbed()
      .setTitle(isReply ? `💬 رد جديد على التذكرة ${shortId(report.id)}` : `🚨 تذكرة جديدة ${shortId(report.id)}`)
      .setDescription(`**${report.title}**\n👤 **المشتكي:** <@${report.reporter.id}> — ${report.reporter.displayName}${target}\n📌 **الحالة:** ${report.status}${detail}`)
      .setThumbnail(report.reporter.avatarUrl ?? null);
    const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel("فتح التذكرة في الموقع").setEmoji("🛡️").setStyle(ButtonStyle.Link).setURL(`${siteUrl()}/admin.html?reportKind=${kind}&reportId=${encodeURIComponent(report.id)}`),
    );
    await channel.send({ embeds: [embed], components: [components] });
  }

  async function notifyReportOwner(userId: string, kind: "PLAYER" | "BUG", reportId: string, message: string) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel("فتح التذكرة والرد").setEmoji("💬").setStyle(ButtonStyle.Link).setURL(`${siteUrl()}/reports.html?reportKind=${kind}&reportId=${encodeURIComponent(reportId)}`));
    await user.send({ embeds: [baseEmbed().setTitle("دعم Zark").setDescription(message)], components: [row] }).catch((error) => console.error(`Report DM failed for ${userId}`, error));
  }

  async function reconcileRoomListings(forcePublish = false) {
    if (!runtimeSettings.lfgChannelId) return;
    const rooms = await apiGet<LiveRoom[]>("/api/lfg");
    for (const room of rooms) {
      if (forcePublish) await publishRoomListing(room, true);
      else if (room.listingMessageId) await syncRoomListing(room);
      else await publishRoomListing(room);
    }
  }

  async function reconcileRoomSpaces() {
    const rooms = await apiGet<LiveRoom[]>("/api/lfg");
    for (const room of rooms) {
      const syncedRoom = await syncRoomMemberIdentities(room);
      await ensureRoomSpace(syncedRoom);
      if (syncedRoom.readyNotifiedAt && !syncedRoom.reminderDeliveredAt && !["COMPLETED", "CLOSED"].includes(syncedRoom.status)) {
        const readyRoom = await apiGet<LiveRoom>(`/api/lfg/${room.id}`);
        await notifyScheduledMembers(readyRoom);
        await apiSend(`/api/lfg/${room.id}/reminder-delivered`, "POST", {});
      }
    }
  }

  async function syncRoomMemberIdentities(room: LiveRoom) {
    const missing = room.members.filter((member) => !member.avatarUrl);
    if (!missing.length || !guildId) return room;
    const guild = await client.guilds.fetch(guildId);
    await Promise.all(missing.map(async (member) => {
      const guildMember = await guild.members.fetch(member.id).catch(() => null);
      const user = guildMember?.user ?? await client.users.fetch(member.id).catch(() => null);
      if (!user) return;
      await apiSend(`/api/users/${member.id}/identity`, "PUT", { displayName: guildMember?.displayName ?? user.globalName ?? user.username, avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }) }).catch(() => undefined);
    }));
    return apiGet<LiveRoom>(`/api/lfg/${room.id}`);
  }

  async function publishRoomListing(room: LiveRoom, force = false) {
    const channelId = runtimeSettings.lfgChannelId;
    if (!channelId || (!force && room.listingMessageId) || listingInFlight.has(room.id)) return room.listingMessageId ? room : undefined;
    listingInFlight.add(room.id);
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !("send" in channel)) throw new Error("قناة نشر LFG غير متاحة للبوت");
      const payload = await roomMessagePayload(room, false);
      const message = await channel.send({ ...payload, components: [roomButtons(room.id, room.gameSlug, room)] });
      return await apiSend<LiveRoom>(`/api/lfg/${room.id}/listing`, "PUT", { channelId: channel.id, messageId: message.id });
    } finally {
      listingInFlight.delete(room.id);
    }
  }

  async function syncRoomListing(room: LiveRoom) {
    if (!room.listingChannelId || !room.listingMessageId) return publishRoomListing(room);
    const channel = await client.channels.fetch(room.listingChannelId).catch(() => null);
    if (!channel?.isTextBased() || !("messages" in channel)) return;
    const message = await channel.messages.fetch(room.listingMessageId).catch(() => null);
    if (message) {
      const payload = await roomMessagePayload(room, false);
      await message.edit({ ...payload, attachments: [], components: [roomButtons(room.id, room.gameSlug, room)] });
    }
  }

  async function ensureRoomSpace(room: LiveRoom) {
    if (!runtimeSettings.autoCreateRoomChannels || !guildId || ["COMPLETED", "CLOSED"].includes(room.status) || roomSpaceInFlight.has(room.id)) return;
    if (room.status === "SCHEDULED" && room.scheduledFor && new Date(room.scheduledFor).getTime() > Date.now() + 10 * 60_000) return;
    roomSpaceInFlight.add(room.id);
    try {
      const guild = await client.guilds.fetch(guildId);
      let textChannel = room.textChannelId ? await guild.channels.fetch(room.textChannelId).catch(() => null) : null;
      let voiceChannel = room.voiceChannelId ? await guild.channels.fetch(room.voiceChannelId).catch(() => null) : null;
      let parentId = runtimeSettings.lfgCategoryId;
      if (!parentId && runtimeSettings.lfgChannelId) {
        const listing = await guild.channels.fetch(runtimeSettings.lfgChannelId).catch(() => null);
        parentId = listing?.parentId ?? undefined;
      }
      const overwrites = roomPermissionOverwrites(guild, room);
      const hostSlug = channelSlug(room.hostName);
      if (!textChannel?.isTextBased()) {
        textChannel = await guild.channels.create({
          name: `zark-${room.gameSlug}-${hostSlug}`.slice(0, 100),
          type: ChannelType.GuildText,
          parent: parentId,
          topic: `Zark LFG • ${room.gameName} • Room ${room.id}`,
          permissionOverwrites: overwrites,
          reason: `Zark LFG room ${room.id}`,
        });
      }
      if (room.needsVoice && voiceChannel?.type !== ChannelType.GuildVoice) {
        voiceChannel = await guild.channels.create({
          name: `${room.roomEmoji ?? room.gameIcon ?? "🎮"}・${room.gameName}・${room.hostName}`.slice(0, 100),
          type: ChannelType.GuildVoice,
          parent: parentId,
          userLimit: Math.min(99, room.maxPlayers),
          permissionOverwrites: overwrites,
          reason: `Zark LFG voice ${room.id}`,
        });
      }
      let stored = room;
      if (textChannel.id !== room.textChannelId || voiceChannel?.id !== room.voiceChannelId || parentId !== room.categoryId) {
        stored = await apiSend<LiveRoom>(`/api/lfg/${room.id}/channels`, "PUT", { categoryId: parentId, textChannelId: textChannel.id, voiceChannelId: voiceChannel?.id });
      }
      if (voiceChannel?.id) roomByVoiceChannel.set(voiceChannel.id, room.id);
      await syncRoomPermissions(textChannel, voiceChannel, guild, stored);
      let controlMessage = stored.controlMessageId && "messages" in textChannel ? await textChannel.messages.fetch(stored.controlMessageId).catch(() => null) : null;
      const components = roomControlComponents(stored);
      if (!controlMessage && "send" in textChannel) {
        const payload = await roomMessagePayload(stored, true);
        controlMessage = await textChannel.send({ ...payload, components });
        await controlMessage.pin().catch(() => undefined);
        stored = await apiSend<LiveRoom>(`/api/lfg/${room.id}/channels`, "PUT", { categoryId: parentId, textChannelId: textChannel.id, voiceChannelId: voiceChannel?.id, controlMessageId: controlMessage.id });
      } else if (controlMessage) {
        const payload = await roomMessagePayload(stored, true);
        await controlMessage.edit({ ...payload, attachments: [], components });
      }
    } finally {
      roomSpaceInFlight.delete(room.id);
    }
  }

  function roomPermissionOverwrites(guild: any, room: LiveRoom) {
    const botId = client.user?.id;
    return [
      { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ...(botId ? [{ id: botId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }] : []),
      ...room.members.map((member) => ({ id: member.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
    ];
  }

  async function syncRoomPermissions(textChannel: any, voiceChannel: any, guild: any, room: LiveRoom) {
    const overwrites = roomPermissionOverwrites(guild, room);
    if (textChannel?.permissionOverwrites) {
      await textChannel.permissionOverwrites.set(overwrites, `Zark sync ${room.id}`).catch((error: unknown) => console.error("Text permissions sync failed", error));
      await textChannel.edit({ name: `zark-${room.gameSlug}-${channelSlug(room.hostName)}`.slice(0, 100) }).catch(() => undefined);
    }
    if (voiceChannel?.permissionOverwrites) {
      await voiceChannel.permissionOverwrites.set(overwrites, `Zark sync ${room.id}`).catch((error: unknown) => console.error("Voice permissions sync failed", error));
      await voiceChannel.edit({ name: `${room.roomEmoji ?? room.gameIcon ?? "🎮"}・${room.gameName}・${room.hostName}`.slice(0, 100), userLimit: Math.min(99, room.maxPlayers) }).catch(() => undefined);
    }
  }

  function roomControlComponents(room: LiveRoom) {
    const rows: Array<ActionRowBuilder<any>> = [roomButtons(room.id, room.gameSlug, room)];
    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`lfg:start:${room.id}`).setLabel("ابدأ اللعب").setEmoji("▶️").setStyle(ButtonStyle.Success).setDisabled(room.status === "ACTIVE"),
      new ButtonBuilder().setCustomId(`lfg:complete:${room.id}`).setLabel("إنهاء ناجح").setEmoji("✅").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`lfg:close:${room.id}`).setLabel("إغلاق").setEmoji("🛑").setStyle(ButtonStyle.Danger),
    );
    if (room.voiceChannelId && guildId) controls.addComponents(new ButtonBuilder().setLabel("دخول Voice").setEmoji("🎙️").setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${guildId}/${room.voiceChannelId}`));
    rows.push(controls);
    const targets = room.members.filter((member) => member.id !== room.hostId).slice(0, 25);
    if (targets.length) {
      const options = targets.map((member) => ({ label: trimText(member.displayName, 100), value: member.id, emoji: member.voiceActive ? "🎙️" : "👤" }));
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`lfg:host-mute:${room.id}`).setPlaceholder("🔇 ميوت/إلغاء ميوت لاعب — للمضيف").addOptions(options)));
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`lfg:host-kick:${room.id}`).setPlaceholder("🚪 إخراج لاعب من الغرفة — للمضيف").addOptions(options)));
    }
    return rows;
  }

  async function finalizeRoomSpace(room: LiveRoom) {
    if (room.voiceChannelId) roomByVoiceChannel.delete(room.voiceChannelId);
    if (room.status === "CLOSED" && !room.startedAt && room.listingChannelId && room.listingMessageId) {
      const listing = await client.channels.fetch(room.listingChannelId).catch(() => null);
      if (listing?.isTextBased() && "messages" in listing) {
        const message = await listing.messages.fetch(room.listingMessageId).catch(() => null);
        if (message) await message.delete().catch(() => undefined);
      }
    }
    if (room.textChannelId) {
      const text = await client.channels.fetch(room.textChannelId).catch(() => null);
      if (text?.isTextBased() && "messages" in text && room.controlMessageId) {
        const control = await text.messages.fetch(room.controlMessageId).catch(() => null);
        if (control) await control.edit({ embeds: [roomEmbed(room, true)], components: [] }).catch(() => undefined);
      }
    }
    if (room.voiceChannelId) {
      const voice = await client.channels.fetch(room.voiceChannelId).catch(() => null);
      if (voice && "delete" in voice) await voice.delete(`Zark ${room.status.toLowerCase()} ${room.id}`).catch(() => undefined);
    }
    if (room.textChannelId) {
      const text = await client.channels.fetch(room.textChannelId).catch(() => null);
      if (text && "delete" in text) await text.delete(`Zark ${room.status.toLowerCase()} ${room.id}`).catch(() => undefined);
    }
    await apiSend(`/api/lfg/${room.id}/channels-deleted`, "POST", {}).catch((error) => console.error("Failed to persist room channel cleanup", error));
  }

  async function cleanupFinishedRoomSpaces() {
    const rooms = await apiGet<LiveRoom[]>("/api/lfg/cleanup-resources", true);
    for (const room of rooms) await finalizeRoomSpace(room);
  }

  async function sendHeartbeat() {
    if (!client.user) return;
    await apiSend("/api/bot/heartbeat", "POST", { instanceId: `${process.pid}`, botUserId: client.user.id, tag: client.user.tag, guilds: client.guilds.cache.size }).catch((error) => console.error("Bot heartbeat failed", error));
  }

  async function sendBumpReminder(channel: any) {
    const roleMentions = adminRoleIds.map((roleId) => `<@&${roleId}>`).join(" ");
    await channel.send({
      content: `${roleMentions}\n🔔 **تذكير دعم السيرفر** — حان وقت كتابة أمر \`/bump\` لرفع ظهور السيرفر وجلب لاعبين جدد.`,
      allowedMentions: { roles: adminRoleIds, users: [], parse: [] },
    });
  }

  async function runBumpReminderCycle() {
    if (!guildId || !adminRoleIds.length) return;
    const channelId = process.env.DISCORD_BUMP_CHANNEL_ID || runtimeSettings.publicChannelId || runtimeSettings.dailyChannelId || runtimeSettings.lfgChannelId;
    if (!channelId) return console.warn("Bump reminder skipped: set DISCORD_BUMP_CHANNEL_ID or a public bot channel");
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return console.warn(`Bump reminder channel ${channelId} is not text based`);
    const claim = await apiSend<{ claimed: boolean }>("/api/bot/bump-reminder/claim", "POST", { guildId });
    if (claim.claimed) await sendBumpReminder(channel);
  }

  async function replyWithMentionedMemberStatus(message: any) {
    const mentioned = message.mentions?.users?.find((user: any) => !user.bot);
    if (!mentioned) return;
    // Status is shared information, so rate-limit per mentioned member rather
    // than per author: repeated pings by different people cannot spam a room.
    const cooldownKey = `${message.guildId ?? "dm"}:${mentioned.id}`;
    const lastReply = mentionStatusCooldown.get(cooldownKey) ?? 0;
    if (Date.now() - lastReply < 15 * 60_000) return;
    mentionStatusCooldown.set(cooldownKey, Date.now());
    if (mentionStatusCooldown.size > 500) for (const [key, timestamp] of mentionStatusCooldown) if (Date.now() - timestamp > 15 * 60_000) mentionStatusCooldown.delete(key);
    try {
      const data = await apiGet<UnifiedProfile>(`/api/profiles/${mentioned.id}`);
      const description = data.settings.activityVisible
        ? `حالة **${data.displayName}** الآن: ${profileActivityText(data)}`
        : `🔒 **${data.displayName}** اختار إخفاء حالته الحالية.`;
      await message.reply({ content: description, allowedMentions: { repliedUser: false, users: [], roles: [], parse: [] } });
    } catch {
      await message.reply({ content: `ℹ️ **${mentioned.displayName ?? mentioned.username}** لم يحدد حالته في Zark بعد.`, allowedMentions: { repliedUser: false, users: [], roles: [], parse: [] } });
    }
  }

  async function enforceMessageSafety(message: any) {
    if (!message.guildId) return false;
    const attachments = [...(message.attachments?.values?.() ?? [])];
    const hasImage = attachments.some((attachment: any) => isImageAttachment(attachment));
    const text = `${message.content ?? ""} ${attachments.map((attachment: any) => `${attachment.name ?? ""} ${attachment.url ?? ""}`).join(" ")}`;
    const scam = looksLikeScamBroadcast(text);
    // Once the allowlist is configured, block every user image outside it. This
    // safely stops hacked accounts from broadcasting screenshot scams at once.
    const blockedImage = hasImage && mediaAllowedChannelIds.size > 0 && !mediaAllowedChannelIds.has(message.channelId);
    if (!scam && !blockedImage) return false;
    await message.delete().catch(() => undefined);
    await warnPossiblyCompromisedMember(message, scam ? "رابط أو نص احتيالي" : "صورة مرسلة خارج قنوات الصور المسموحة");
    await sendModerationAlert(message, scam ? "رابط أو نص احتيالي" : "صورة خارج قنوات الصور المسموحة");
    return true;
  }

  async function warnPossiblyCompromisedMember(message: any, reason: string) {
    await message.author.send({
      content: `🛡️ **تنبيه حماية من Zark**\nحذفنا رسالة من حسابك لأنّها بدت مشبوهة (${reason}). إذا لم ترسلها بنفسك فقد يكون حسابك مخترقًا.\n\nغيّر كلمة مرور Discord فورًا، فعّل التحقق بخطوتين (2FA)، وسجّل الخروج من الجلسات والأجهزة التي لا تعرفها. لا تدخل روابط جوائز أو Crypto أو Bonus من رسائل غير موثوقة.`,
      allowedMentions: { parse: [] },
    }).catch(() => undefined);
  }

  function isImageAttachment(attachment: any) {
    return String(attachment.contentType ?? "").startsWith("image/") || /\.(?:png|jpe?g|gif|webp|bmp|heic)$/iu.test(String(attachment.name ?? ""));
  }

  function looksLikeScamBroadcast(value: string) {
    const text = value.toLocaleLowerCase("en").replace(/[\u200B-\u200D\uFEFF]/g, "");
    const knownScamDomain = /(?:feastwin|vyro(?:casino)?|bonus(?:-)?claim|crypto(?:-)?bonus)\.(?:com|net|org)\b/iu.test(text);
    const hasLink = /https?:\/\/|(?:www\.)/iu.test(text);
    const lureWords = ["mrbeast", "bonus", "promocode", "withdraw", "withdrawal", "usdt", "crypto", "rakeback", "claim reward"];
    const lureCount = lureWords.filter((word) => text.includes(word)).length;
    return knownScamDomain || (hasLink && lureCount >= 2);
  }

  async function sendModerationAlert(message: any, reason: string) {
    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    if (now - (moderationAlertCooldown.get(key) ?? 0) < 15 * 60_000) return;
    moderationAlertCooldown.set(key, now);
    const channelId = runtimeSettings.reportChannelId || process.env.DISCORD_REPORT_CHANNEL_ID;
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (channel?.isTextBased() && "send" in channel) {
      await channel.send({ content: `🛡️ حذفت رسالة مشبوهة من <@${message.author.id}> في <#${message.channelId}> — السبب: **${reason}**.`, allowedMentions: { users: [], roles: [], parse: [] } }).catch(() => undefined);
    }
  }

  function isDisboardBumpConfirmation(message: any) {
    const embedText = (message.embeds ?? []).flatMap((embed: any) => [embed.title, embed.description, embed.footer?.text, ...(embed.fields ?? []).flatMap((field: any) => [field.name, field.value])]).filter(Boolean).join(" ");
    const text = `${message.content ?? ""} ${embedText}`.toLocaleLowerCase("en").replace(/\s+/g, " ");
    return /\bbump(?:ed)? done\b|\bserver (?:was )?bumped\b|تم\s+(?:الرفع|رفع(?:\s+السيرفر)?|تحديث\s+السيرفر)/.test(text);
  }

  async function notifyInterestedPlayers(room: LiveRoom) {
    if (notifiedRooms.has(room.id)) return;
    notifiedRooms.add(room.id);
    try { await sendRoomInvites(room); }
    catch (error) { notifiedRooms.delete(room.id); throw error; }
  }

  async function sendRoomInvites(room: LiveRoom) {
    const candidates = await apiGet<Array<{ user: { id: string }; game: { name: string; icon?: string } }>>(`/api/lfg/${room.id}/notification-candidates`, true);
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`lfg:join:${room.id}`).setLabel("دخول").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`lfg:ignore:${room.id}`).setLabel("تجاهل").setEmoji("❌").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lfg:snooze-menu:${room.gameSlug}`).setLabel("غفوة").setEmoji("😴").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lfg:interest-off:${room.gameSlug}`).setLabel("غير مهتم").setEmoji("🚫").setStyle(ButtonStyle.Danger),
    );
    await Promise.all(candidates.map(async (candidate) => {
      try {
        const user = await client.users.fetch(candidate.user.id);
        const scheduleText = room.scheduledFor ? `\n🕐 الموعد: <t:${Math.floor(new Date(room.scheduledFor).getTime() / 1000)}:F>` : "";
        const mapText = room.mapName ? `\n🗺️ الماب: **${room.mapName}**` : "";
        await user.send({ embeds: [baseEmbed().setTitle(`${room.gameIcon ?? "🎮"} تجمع ${room.gameName}${room.scheduledFor ? " مجدول" : " الآن"}!`).setDescription(`👥 ${room.currentPlayers}/${room.maxPlayers} لاعبين\n🎙️ Voice: ${room.needsVoice ? "متاح" : "غير مطلوب"}${mapText}${scheduleText}\n\nوصلتك الدعوة لأنك مهتم بهذه اللعبة وإشعاراتها مفعلة.`)], components: [buttons] });
        await apiSend(`/api/lfg/${room.id}/notifications/${candidate.user.id}/status`, "POST", { status: "SENT" });
      } catch {
        await apiSend(`/api/lfg/${room.id}/notifications/${candidate.user.id}/status`, "POST", { status: "FAILED" }).catch(() => undefined);
      }
    }));
  }

  async function notifyScheduledMembers(room: LiveRoom) {
    const unix = room.scheduledFor ? Math.floor(new Date(room.scheduledFor).getTime() / 1000) : undefined;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`lfg:join:${room.id}`).setLabel("تأكيد التسجيل").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`lfg:leave:${room.id}`).setLabel("إلغاء التسجيل").setEmoji("🚪").setStyle(ButtonStyle.Secondary),
    );
    if (room.voiceChannelId && guildId) row.addComponents(new ButtonBuilder().setLabel("دخول الغرفة").setEmoji("🎮").setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${guildId}/${room.voiceChannelId}`));
    await Promise.all(room.members.map(async (member) => {
      const user = await client.users.fetch(member.id).catch(() => null);
      if (!user) return;
      await user.send({ embeds: [baseEmbed().setTitle(`🔔 موعد ${room.gameName} بعد 10 دقائق`).setDescription(`${unix ? `يبدأ <t:${unix}:R>.` : "الغرفة جاهزة."}\nتم تجهيز Text وVoice ويمكنكم التجمع الآن.`)], components: [row] }).catch(() => undefined);
    }));
  }

  async function notifyScheduledAttendanceWarning(room: LiveRoom) {
    const closeUnix = room.autoDeleteAt ? Math.floor(new Date(room.autoDeleteAt).getTime() / 1000) : undefined;
    const content = `⚠️ **تجمع ${room.gameName} لم يكتمل بعد.** إذا لم ينضم لاعبون إضافيون خلال 15 دقيقة، ستُغلق الغرفة تلقائيًا${closeUnix ? ` <t:${closeUnix}:R>` : ""}.`;
    const targetId = room.textChannelId ?? room.listingChannelId;
    if (!targetId) return;
    const channel = await client.channels.fetch(targetId).catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return;
    await channel.send({ content, allowedMentions: { users: [room.hostId] } }).catch(() => undefined);
  }

  async function deliverPendingRatingRequests() {
    const rooms = await apiGet<LiveRoom[]>("/api/lfg/rating-requests/pending", true);
    for (const room of rooms) await sendRatingRequests(room);
  }

  async function sendRatingRequests(room: LiveRoom) {
    if (ratingRequestsInFlight.has(room.id)) return;
    ratingRequestsInFlight.add(room.id);
    try {
      if (runtimeSettings.ratingsEnabled && room.members.length > 1) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`lfg:rating-open:${room.id}`).setLabel("بدء التقييم").setEmoji("⭐").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`lfg:rating-skip:${room.id}`).setLabel("ليس الآن").setEmoji("✖️").setStyle(ButtonStyle.Secondary),
        );
        await Promise.all(room.members.map(async (member) => {
          const user = await client.users.fetch(member.id).catch(() => null);
          if (!user) return;
          const hostHint = member.id === room.hostId ? `\n\n👑 **اقتراح للمضيف:** قيّم الالتزام والحضور والتعاون. اللاعبون الذين قضوا وقتاً أطول في Voice يستحقون تقييماً أعلى.` : "";
          await user.send({ embeds: [baseEmbed().setTitle(`⭐ قيّم جلسة ${room.gameName}`).setDescription(`انتهت الجلسة بنجاح. يمكنك تقييم الغرفة وكل لاعب شارك معك، أو إلغاء التقييم بالكامل.\n\nالتقييم خاص وآمن، ولا يمكن تقييم نفسك.${hostHint}`)], components: [row] }).catch(() => undefined);
        }));
      }
      await apiSend(`/api/lfg/${room.id}/rating-requests/delivered`, "POST", {});
    } finally {
      ratingRequestsInFlight.delete(room.id);
    }
  }

  function ratingPanelPayload(room: LiveRoom, raterId: string, notice?: string) {
    const players = room.members.filter((member) => member.id !== raterId).slice(0, 25);
    const components: Array<ActionRowBuilder<any>> = [];
    if (players.length) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`lfg:rating-player:${room.id}`).setPlaceholder("اختر لاعبًا لتقييمه").addOptions(players.map((member) => ({ label: trimText(member.displayName, 100), value: member.id, emoji: member.id === room.hostId ? "👑" : "👤" })))));
    components.push(ratingStarsRow(`lfg:rating-room:${room.id}`));
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`lfg:rating-skip:${room.id}`).setLabel("إنهاء وإغلاق").setEmoji("✅").setStyle(ButtonStyle.Secondary)));
    const hostSuggestion = raterId === room.hostId ? "\n👑 اقتراح: أعطِ 5 نجوم للحضور المتعاون، و3 للمتوسط، و1–2 عند الغياب أو الإزعاج." : "";
    return { content: "", embeds: [baseEmbed().setTitle(`⭐ تقييم ${room.gameName}`).setDescription(`${notice ? `${notice}\n\n` : ""}${players.length ? "اختر لاعبًا من القائمة لتقييمه.\n" : ""}صف النجوم بالأسفل مخصص لتقييم **الغرفة والتنظيم**.${hostSuggestion}`)], components };
  }

  function ratingStarsRow(prefix: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...[1, 2, 3, 4, 5].map((stars) => new ButtonBuilder().setCustomId(`${prefix}:${stars}`).setLabel(String(stars)).setEmoji("⭐").setStyle(stars >= 4 ? ButtonStyle.Success : stars === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary)));
  }

  async function profile(interaction: any, userId: string) {
    await interaction.deferReply();
    const data = await apiGet<UnifiedProfile>(`/api/profiles/${userId}`);
    const filename = `zark-profile-${userId}.png`;
    const image = await renderProfileVisual(data);
    const activity = profileActivityText(data);
    const embed = baseEmbed().setTitle(`👤 ملف ${data.displayName}`).setDescription(`Level ${data.zark.level} · ${data.zark.xp.toLocaleString()} XP · ${data.zark.wins} فوز\n${activity}`).setImage(`attachment://${filename}`);
    await interaction.editReply({ embeds: [embed], files: [new AttachmentBuilder(image, { name: filename })] });
  }

  async function loyalty(interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await apiGet<{ points: number; lifetimePoints: number; vipUnlocked: boolean; tier: { name: string }; nextTier?: { name: string; threshold: number }; vipPrice: number }>(`/api/users/${interaction.user.id}/loyalty`, true);
    const next = data.nextTier ? `الرتبة التالية: **${data.nextTier.name}** عند **${data.nextTier.threshold}** نقطة تفاعل.` : "وصلت أعلى رتبة ولاء.";
    const embed = baseEmbed().setTitle("💎 ولاء Zark").setDescription(`رصيدك: **${data.points}** نقطة\nإجمالي تفاعلك: **${data.lifetimePoints}** نقطة\nرتبتك: **${data.tier.name}**\n${next}\n\nتكسب نقاطًا من الفوز، تحدي اليوم، وإكمال جلسات LFG.`);
    const components = !data.vipUnlocked ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("loyalty:buy-vip").setLabel(`شراء Zark VIP — ${data.vipPrice} نقطة`).setEmoji("💎").setStyle(ButtonStyle.Primary).setDisabled(data.points < data.vipPrice))] : [];
    return interaction.editReply({ embeds: [embed], components });
  }

  async function weekly(interaction: any) {
    await interaction.deferReply();
    const rows = await apiGet<Array<{ rank: number; displayName: string; points: number }>>("/api/loyalty/weekly");
    const medals = ["🥇", "🥈", "🥉"];
    const body = rows.length ? rows.map((row) => `${medals[row.rank - 1] ?? `#${row.rank}`} **${row.displayName}** — ${row.points} نقطة`).join("\n") : "لا توجد نقاط أسبوعية بعد — ابدأ بتحدي اليوم أو جلسة LFG!";
    return interaction.editReply({ embeds: [baseEmbed().setTitle("🏆 متصدرو الولاء الأسبوعي").setDescription(body).setFooter({ text: "النقاط تحسب من آخر 7 أيام" })] });
  }

  async function eventHour(interaction: any) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error("هذا الأمر للإدارة فقط");
    const minutes = interaction.options.getInteger("minutes") ?? 60;
    const event = await apiSend<{ multiplier: number; until: string }>("/api/loyalty/boost", "POST", { adminId: interaction.user.id, minutes });
    return interaction.reply({ embeds: [baseEmbed().setTitle("⚡ بدأت ساعة Zark").setDescription(`كل نقاط الولاء أصبحت **×${event.multiplier}** حتى <t:${Math.floor(new Date(event.until).getTime() / 1000)}:R>.\nشغّل /daily و/play وLFG لإشعال التفاعل!`)] });
  }

  async function pulse(interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [profileData, loyaltyData, availabilityData, rooms, insights] = await Promise.all([
      apiGet<UnifiedProfile>(`/api/profiles/${interaction.user.id}`),
      apiGet<{ points: number; tier: { name: string } }>(`/api/users/${interaction.user.id}/loyalty`, true),
      apiGet<UserAvailability>(`/api/users/${interaction.user.id}/availability`, true),
      apiGet<LiveRoom[]>("/api/lfg"),
      apiGet<LfgInterestInsight[]>("/api/lfg/insights", true),
    ]);
    const interests = new Set(profileData.lfg.interests.map((game) => game.slug));
    const recommended = insights.find((item) => interests.has(item.gameSlug)) ?? insights[0];
    const matchingRoom = rooms.find((room) => interests.has(room.gameSlug) && room.currentPlayers < room.maxPlayers);
    const opportunity = matchingRoom
      ? `🎯 غرفة مناسبة الآن: **${matchingRoom.gameName}** (${matchingRoom.currentPlayers}/${matchingRoom.maxPlayers})`
      : recommended
        ? `✨ أفضل فرصة: **${recommended.gameName}** — ${recommended.availableNowCount} متفرغ الآن من ${recommended.interestedCount} مهتم`
        : "✨ حدد اهتماماتك لتصل لك اقتراحات أدق.";
    const embed = baseEmbed().setTitle("📡 Zark Pulse").setDescription(`${profileActivityText(profileData)}\n\n💎 **${loyaltyData.points}** نقطة · ${loyaltyData.tier.name}\n🎮 ${opportunity}\n\n${availabilityData.currentActivity === "FREE" ? "أنت ظاهر كمتفرغ الآن—ممتاز للتجمع الذكي." : "حدّث وقت فراغك حتى لا تفوتك الدعوات المناسبة."}`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("pulse:smart").setLabel("تجمع ذكي").setEmoji("✨").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("pulse:availability").setLabel("وقت فراغي").setEmoji("🕐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("pulse:loyalty").setLabel("ولائي").setEmoji("💎").setStyle(ButtonStyle.Primary),
    );
    return interaction.editReply({ embeds: [embed], components: [row] });
  }

  async function help(interaction: any) {
    const embed = baseEmbed().setTitle("📘 دليل أوامر Zark").setDescription("كل ما تحتاجه للألعاب والعثور على لاعبين، بأقل عدد من الخطوات.").addFields(
      { name: "🎮 ألعاب Zark", value: "`/play` لعبة عشوائية أو محددة مع اختيار 2–10 جولات\n`/daily` تحدي اليوم\n`/profile` ملفك الموحد\n`/loyalty` نقاطك ورتبك ومتجر VIP\n`/leaderboard` متصدرو الألعاب والتفاعل" },
      { name: "🔎 نظام LFG", value: "`/lfg create` إنشاء تجمع\n`/lfg smart` تجمع ذكي حسب الاهتمام والتفرغ\n`/lfg rooms` قائمة الغرف + دخول\n`/lfg interests` الاهتمامات والإشعارات\n`/lfg profile` ملف LFG\n`/lfg top` أفضل اللاعبين" },
      { name: "⭐ التقييم والدعم", value: "`/lfg rate` تقييم لاعب بعد جلسة\n`/lfg report` إبلاغ عن لاعب\n`/lfg bug` إرسال مشكلة\nبعد اكتمال الغرفة يصلك تقييم تفاعلي بالخاص." },
      { name: "🕐 حالتي", value: "`/وقت-فراغي` أو `/availability` لتغيير حالتك بضغطة واحدة." },
      { name: "⌨️ أوامر الكتابة السريعة", value: "`.اعلام` `.ترجم` `.اسرع` `.اكمل` `.ترتيب` `.حساب` `.ايموجي` `.سيارات` `.شركات` `.انمي` `.صح` `.معلومات`" },
    );
    const website = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel("فتح موقع Zark").setEmoji("🌐").setStyle(ButtonStyle.Link).setURL(siteUrl()));
    return interaction.reply({ embeds: [embed], components: [website], flags: MessageFlags.Ephemeral });
  }

  function helpPlusPayload() {
    const start = baseEmbed().setTitle("🚀 Zark من البداية").setDescription("1. استخدم `/pulse` لمعرفة أفضل فرصة لك الآن.\n2. اضبط اهتماماتك عبر `/lfg interests`.\n3. حدّث وقتك عبر `/availability` أو `/وقت-فراغي`.\n4. اضغط **تجمع ذكي** أو استخدم `/lfg smart` ليجد لك Zark لاعبين.");
    const playGuide = baseEmbed().setTitle("🎮 الألعاب والتحديات").addFields(
      { name: "بدء لعبة", value: "`/play` ثم اختر اللعبة وعدد الجولات. أثناء اللعبة لديك **10 ثوانٍ** فقط للإجابة؛ أول إجابة صحيحة تفوز." },
      { name: "اختصارات سريعة", value: "`.أعلام` `.ترجم` `.سيارات` `.شركات` `.انمي` `.ألغاز` أو `/play help`." },
      { name: "تحدي اليوم", value: "`/daily` ينشر تحديًا يوميًا. أكمله لتربح XP ونقاط ولاء ومكافأة مهمة يومية." },
      { name: "النقاط والرتب", value: "`/loyalty` يعرض رصيدك. تربح نقاطًا من الفوز والجلسات والتحدي اليومي؛ VIP يمكن شراؤها بالنقاط." },
    );
    const lfgGuide = baseEmbed().setTitle("👥 غرف LFG والإدارة").addFields(
      { name: "إنشاء أو دخول", value: "`/lfg create` لإنشاء غرفة، و`/lfg rooms` لرؤية الغرف واختيار **دخول**. Roblox يطلب اسم الماب." },
      { name: "الإشعارات", value: "من `/lfg interests` اختر الألعاب التي تحبها. يمكنك إيقاف التنبيه أو الغفوة بدون إلغاء الاهتمام." },
      { name: "بعد الجلسة", value: "أكمل الغرفة من أزرارها لتحصل على نقاط وتصل رسالة تقييم خاصة لكل لاعب." },
      { name: "للإدارة", value: "`/lfg auto` لعرض أو تغيير التجمعات التلقائية، و`/event-hour` لتشغيل نقاط ×2، و`/weekly` لمتصدرين الأسبوع." },
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel("فتح موقع Zark").setEmoji("🌐").setStyle(ButtonStyle.Link).setURL(siteUrl()));
    return { embeds: [start, playGuide, lfgGuide], components: [row] };
  }

  async function helpPlus(interaction: any) {
    return interaction.reply({ ...helpPlusPayload(), flags: MessageFlags.Ephemeral });
  }

  async function helpPlusForMessage(message: any) {
    return message.reply(helpPlusPayload());
  }

  async function availability(interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const current = await apiGet<UserAvailability>(`/api/users/${interaction.user.id}/availability`, true);
    return interaction.editReply(availabilityPanelPayload(current));
  }

  async function lfgTop(interaction: any, metric: string) {
    await interaction.deferReply();
    const rows = await apiGet<Array<{ displayName: string; engagement: number; completedSessions: number; rating: number; ratingCount: number }>>(`/api/lfg/top?metric=${metric}`);
    const value = (row: typeof rows[number]) => metric === "rating" ? `${row.rating.toFixed(1)} ⭐` : metric === "sessions" ? `${row.completedSessions} جلسة` : `${row.engagement} نقطة`;
    await interaction.editReply({ embeds: [baseEmbed().setTitle("🏆 أفضل لاعبي LFG").setDescription(rows.length ? rows.map((row, index) => `${medal(index)} **${row.displayName}** — ${value(row)}`).join("\n") : "لا توجد بيانات كافية بعد")] });
  }

  async function lfgRooms(interaction: any) {
    await interaction.deferReply();
    const rooms = await apiGet<LiveRoom[]>("/api/lfg");
    if (!rooms.length) return interaction.editReply({ embeds: [baseEmbed().setTitle("🔥 غرف LFG").setDescription("لا توجد غرف الآن. استخدم `/lfg create` وابدأ أول تجمع!")] });
    const menu = new StringSelectMenuBuilder()
      .setCustomId("lfg:rooms:select")
      .setPlaceholder("اختر غرفة لعرضها والانضمام")
      .addOptions(rooms.slice(0, 25).map((room) => ({
        label: trimText(`${room.gameName} · ${room.currentPlayers}/${room.maxPlayers}`, 100),
        description: trimText(`${room.status === "ACTIVE" ? "يلعبون الآن" : room.status === "SCHEDULED" ? "موعد لاحق" : "تجمع مفتوح"} · ${room.hostName}${room.mapName ? ` · ${room.mapName}` : ""}`, 100),
        value: room.id,
        emoji: room.gameIcon ?? "🎮",
      })));
    await interaction.editReply({
      embeds: [baseEmbed().setTitle("🔥 اختر غرفة وانضم").setDescription(`يوجد **${rooms.length}** تجمع متاح. اختر غرفة من القائمة لتظهر لك صور اللاعبين وزر الدخول.`)],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
  }

  async function showInterests(interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const catalog = await apiGet<Array<{ games: Array<{ slug: string; name: string; icon?: string }> }>>("/api/lfg/catalog");
    const games = catalog.flatMap((category) => category.games).slice(0, 25);
    const menu = new StringSelectMenuBuilder().setCustomId("lfg:interest:select").setPlaceholder("اختر لعبة لتعديل اهتمامك").addOptions(games.map((game) => ({ label: game.name, value: game.slug, emoji: game.icon })));
    await interaction.editReply({ embeds: [baseEmbed().setTitle("❤️ اهتمامات LFG").setDescription("Zark يرسل لك فقط عندما توجد فرصة لعب حقيقية للعبة مهتم بها.")], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
  }

  async function setInterest(interaction: any, gameSlug: string, interested: boolean, notificationsEnabled: boolean) {
    await interaction.deferUpdate();
    await apiSend(`/api/users/${interaction.user.id}/lfg-preferences/${gameSlug}`, "PUT", { displayName: displayName(interaction), avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }), interested, notificationsEnabled });
    const message = interested ? "❤️ أضفت اللعبة لاهتماماتك والإشعارات مفعلة." : "🚫 لن تصلك اقتراحات أو إشعارات لهذه اللعبة.";
    return interaction.editReply({ content: message, embeds: [], components: [] });
  }

  async function muteInterest(interaction: any, gameSlug: string) {
    await interaction.deferUpdate();
    await apiSend(`/api/users/${interaction.user.id}/lfg-preferences/${gameSlug}/mute`, "POST", { displayName: displayName(interaction), avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }) });
    return interaction.editReply({ content: "🔕 بقيت اللعبة ضمن اهتماماتك، لكن تم إيقاف رسائلها الخاصة.", embeds: [], components: [] });
  }

  async function showSnoozeOptions(interaction: any, gameSlug: string) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`lfg:snooze:${gameSlug}:60`).setLabel("ساعة").setEmoji("😴").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lfg:snooze:${gameSlug}:480`).setLabel("8 ساعات").setEmoji("🌙").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lfg:snooze:${gameSlug}:1440`).setLabel("يوم كامل").setEmoji("🔕").setStyle(ButtonStyle.Primary),
    );
    return interaction.reply({ content: "كم تريد إيقاف رسائل هذه اللعبة؟ سيعود الإشعار تلقائيًا بعد انتهاء الغفوة.", components: [row], flags: MessageFlags.Ephemeral });
  }

  async function snoozeInterest(interaction: any, gameSlug: string, minutes: number) {
    await interaction.deferUpdate();
    const preference = await apiSend<{ mutedUntil: string }>(`/api/users/${interaction.user.id}/lfg-preferences/${gameSlug}/snooze`, "POST", { displayName: displayName(interaction), avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }), minutes });
    return interaction.editReply({ content: `😴 تم إيقاف رسائل اللعبة حتى <t:${Math.floor(new Date(preference.mutedUntil).getTime() / 1000)}:R>. سيعود الإشعار تلقائيًا.`, components: [], embeds: [] });
  }

  async function gameLeaderboard(interaction: any, metric: string) {
    await interaction.deferReply();
    const rows = await apiGet<Array<{ displayName: string; gamePoints: number; engagementPoints: number }>>(`/api/leaderboard?period=daily&metric=${metric}`);
    const key = metric === "engagement" ? "engagementPoints" : "gamePoints";
    await interaction.editReply({ embeds: [baseEmbed().setTitle(metric === "engagement" ? "🤝 الأكثر تفاعلًا اليوم" : "🔥 متصدرو ألعاب Zark").setDescription(rows.length ? rows.map((row, index) => `${medal(index)} **${row.displayName}** — ${row[key]}`).join("\n") : "ابدأ أول منافسة اليوم!")] });
  }

  function showPlayerReportModal(interaction: any, targetId: string) {
    const modal = new ModalBuilder().setCustomId(`lfg:report:${targetId}`).setTitle("إبلاغ عن لاعب").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("سبب البلاغ").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("التفاصيل").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
    );
    return interaction.showModal(modal);
  }

  function showBugReportModal(interaction: any) {
    const modal = new ModalBuilder().setCustomId("lfg:bug").setTitle("تقرير خطأ في Zark").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("عنوان الخطأ").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("ماذا حدث؟ وكيف نكرره؟").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)),
    );
    return interaction.showModal(modal);
  }

  function showRoomDetailsModal(interaction: any, gameSlug: string, count: number, durationMinutes: number) {
    if (gameSlug === "roblox") return showRobloxRoomModal(interaction, count, durationMinutes, true);
    const modal = new ModalBuilder().setCustomId(`lfg:details:${gameSlug}:${count}:${durationMinutes}`).setTitle("تفاصيل غرفة LFG").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("gameMode").setLabel("Game Mode — اختياري").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("وصف قصير — اختياري").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }

  function showScheduledRoomModal(interaction: any, gameSlug: string, count: number, durationMinutes: number) {
    const example = new Date(Date.now() + 60 * 60_000);
    const pad = (value: number) => String(value).padStart(2, "0");
    const suggested = `${example.getFullYear()}-${pad(example.getMonth() + 1)}-${pad(example.getDate())} ${pad(example.getHours())}:${pad(example.getMinutes())}`;
    const modal = new ModalBuilder().setCustomId(`lfg:schedule:${gameSlug}:${count}:${durationMinutes}`).setTitle("جدولة غرفة LFG").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("scheduledFor").setLabel("الموعد YYYY-MM-DD HH:mm").setStyle(TextInputStyle.Short).setValue(suggested).setRequired(true).setMaxLength(16)),
      ...(gameSlug === "roblox" ? [new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("mapName").setLabel("اسم ماب Roblox").setPlaceholder("Brookhaven / Blox Fruits...").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100))] : []),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("gameMode").setLabel("Game Mode — اختياري").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("وصف قصير — اختياري").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }

  function showRobloxRoomModal(interaction: any, count: number, durationMinutes: number, needsVoice: boolean) {
    const modal = new ModalBuilder().setCustomId(`lfg:roblox:${count}:${durationMinutes}:${needsVoice ? "voice" : "novoice"}`).setTitle("تفاصيل Roblox").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("mapName").setLabel("اسم الماب — مطلوب").setPlaceholder("Brookhaven / Blox Fruits / Adopt Me...").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("gameMode").setLabel("نوع اللعب — اختياري").setPlaceholder("Grinding / Roleplay / PvP").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("وصف قصير — اختياري").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }

  async function submitRating(interaction: any) {
    const target = interaction.options.getUser("user", true);
    const roomId = interaction.options.getString("room", true);
    const stars = interaction.options.getInteger("stars", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await apiSend(`/api/lfg/${roomId}/ratings`, "POST", { raterId: interaction.user.id, raterName: displayName(interaction), ratedId: target.id, stars, tags: [] });
    await interaction.editReply({ content: `⭐ تم تقييم ${target} بـ${stars}/5.` });
  }

  function activateRace(channelId: string, match: ZarkMatch, messageId: string, channel: any) {
    const endsAtMs = new Date(match.endsAt).getTime();
    const timeout = setTimeout(() => void expireActiveRace(channelId, match.id, channel).catch((error) => console.error("Race expiration failed", error)), Math.max(50, endsAtMs - Date.now() + 50));
    timeout.unref();
    activeRaceChannels.set(channelId, { matchId: match.id, messageId, timeout, endsAtMs });
  }

  function clearActiveRace(channelId: string, matchId: string) {
    const active = activeRaceChannels.get(channelId);
    if (!active || active.matchId !== matchId) return;
    clearTimeout(active.timeout);
    activeRaceChannels.delete(channelId);
  }

  async function expireActiveRace(channelId: string, matchId: string, channel: any) {
    const active = activeRaceChannels.get(channelId);
    if (!active || active.matchId !== matchId) return;
    const remaining = active.endsAtMs - Date.now();
    if (remaining > 0) {
      clearTimeout(active.timeout);
      active.timeout = setTimeout(() => void expireActiveRace(channelId, matchId, channel).catch((error) => console.error("Race expiration failed", error)), remaining + 50);
      active.timeout.unref();
      return;
    }
    clearActiveRace(channelId, matchId);
    const prompt = await channel.messages?.fetch(active.messageId).catch(() => null);
    await prompt?.delete().catch(() => undefined);
    const result = await apiSend<{ winner?: { displayName: string; points: number }; acceptedAnswer: string }>(`/api/play/${matchId}/expire`, "POST", {});
    if (result.winner) await channel.send(`🏆 انتهت الجولة — الفائز **${result.winner.displayName}** بـ **${result.winner.points} XP**.`);
    else await channel.send({ embeds: [baseEmbed().setTitle("⌛ انتهى الوقت").setDescription(`لم يحسم أحد الجولة.\nالإجابة الصحيحة: **${result.acceptedAnswer}**`)] });
    await advanceRaceSeries(channel, active);
  }

  async function finishRaceWithWinner(channel: any, race: ActiveRace, winner: string, result: RaceAnswer) {
    clearActiveRace(channel.id, race.matchId);
    const prompt = await channel.messages?.fetch(race.messageId).catch(() => null);
    await prompt?.delete().catch(() => undefined);
    const filename = `zark-winner-${race.matchId}.png`;
    const image = await renderWinnerVisual(winner, result.points, result.elapsedMs ?? 0, result.typoCount ?? 0);
    await channel.send({ embeds: [baseEmbed().setTitle("🏁 حُسمت الجولة!").setDescription(winnerLine(winner, 1, result.points)).setImage(`attachment://${filename}`)], files: [new AttachmentBuilder(image, { name: filename })] });
    await advanceRaceSeries(channel, race);
  }

  async function advanceRaceSeries(channel: any, race: ActiveRace) {
    const progress = await apiSend<RaceProgress>(`/api/play/${race.matchId}/next`, "POST", {});
    if (progress.completed) {
      const ranking = progress.standings.length
        ? progress.standings.slice(0, 10).map((row, index) => `${medal(index)} **${row.displayName}** — ${row.wins} فوز · ${row.points} XP`).join("\n")
        : "انتهت المباراة دون فائز.";
      await channel.send({ embeds: [baseEmbed().setTitle("🏆 انتهت مباراة Zark").setDescription(`اكتملت **${progress.totalRounds}** جولة.\n\n${ranking}`)] });
      return;
    }
    const next = progress.nextMatch;
    await channel.send({ content: `⚡ الجولة **${next.roundNumber}/${next.totalRounds}** تبدأ الآن!` });
    const sent = await channel.send(await gameMessagePayload(next));
    activateRace(channel.id, next, sent.id, channel);
  }

  async function gameMessagePayload(match: ZarkMatch, daily = false) {
    const filename = `zark-game-${match.id}.png`;
    const image = await renderGameVisual(match, daily);
    return {
      embeds: [baseEmbed().setTitle(`${daily ? "⚡" : "🎮"} ${match.gameName}${!daily && match.totalRounds ? ` · الجولة ${match.roundNumber}/${match.totalRounds}` : ""}`).setDescription(`أول إجابة صحيحة تحسم الجولة · النقاط حسب السرعة والدقة\nتنتهي <t:${Math.floor(new Date(match.endsAt).getTime() / 1000)}:R>`).setImage(`attachment://${filename}`)],
      files: [new AttachmentBuilder(image, { name: filename })],
    };
  }

  async function renderGameVisual(match: ZarkMatch, daily = false) {
    const flagCode = match.gameSlug === "flags" ? countryCodeFromFlag(match.prompt) : undefined;
    const media = match.mediaUrl ? await remoteImage(match.mediaUrl) : flagCode ? await remoteImage(`https://flagcdn.com/w640/${flagCode.toLowerCase()}.png`) : undefined;
    const cleanedPrompt = cleanPrompt(match.prompt, match.gameSlug === "flags");
    const visualLabel = match.gameSlug === "flags" ? "علم أي دولة؟" : match.gameName;
    const lines = wrapText(cleanedPrompt, media ? 40 : 34).slice(0, media ? 2 : 3);
    const promptStart = media ? 220 : 365 - ((lines.length - 1) * 45);
    const lineMarkup = lines.map((line, index) => `<text x="800" y="${promptStart + index * 90}" text-anchor="middle" class="prompt">${escapeXml(line)}</text>`).join("");
    const mediaFrame = media
      ? `<rect x="370" y="330" width="860" height="440" rx="36" fill="#080808" stroke="#ff2029" stroke-width="7"/><rect x="395" y="355" width="810" height="390" rx="24" fill="#151515"/>`
      : `<circle cx="800" cy="650" r="145" fill="#19080a" stroke="#ff2029" stroke-width="6"/><text x="800" y="695" text-anchor="middle" style="font:900 130px ${arabicFont};fill:#fff">${escapeXml(gameEmoji(match.gameSlug))}</text>`;
    const svg = Buffer.from(`<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="shade"><stop stop-color="#020202" stop-opacity=".28"/><stop offset="1" stop-color="#020202" stop-opacity=".94"/></linearGradient></defs>
      <rect width="1600" height="900" fill="url(#shade)"/>
      <style>${fontFaceStyle}.prompt{font:900 68px ${arabicFont};fill:#fff}.tag{font:900 23px ${arabicFont};fill:#fff;letter-spacing:5px}</style>
      <rect x="630" y="48" width="340" height="58" rx="12" fill="#ed1c24"/><text x="800" y="87" text-anchor="middle" class="tag">ZARK GAME</text>
      <text x="800" y="170" text-anchor="middle" style="font:900 78px ${arabicFont};fill:#fff">${escapeXml(visualLabel)}</text>
      ${lineMarkup}${mediaFrame}
      <text x="800" y="850" text-anchor="middle" style="font:800 31px ${arabicFont};fill:#ddd">${daily ? "تحدي اليوم · أول إجابة صحيحة تفوز" : `الجولة ${match.roundNumber}/${match.totalRounds} · أول إجابة صحيحة تفوز`}</text>
    </svg>`);
    const base = sharp(roomCardBackgroundPath).resize(1600, 900, { fit: "cover" });
    const layers: Array<{ input: Buffer; left?: number; top?: number }> = [{ input: svg }];
    if (media) {
      const framed = await sharp(media).resize(810, 390, { fit: "contain", background: "#151515" }).png().toBuffer();
      layers.push({ input: framed, left: 395, top: 355 });
    }
    return base.composite(layers).png({ compressionLevel: 8 }).toBuffer();
  }

  async function renderWinnerVisual(name: string, points: number, elapsedMs: number, typoCount: number) {
    const seconds = Math.max(0.1, elapsedMs / 1000).toFixed(1);
    const svg = Buffer.from(`<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
      <style>${fontFaceStyle}</style>
      <rect width="1600" height="900" fill="#020202" fill-opacity=".72"/>
      <circle cx="800" cy="430" r="255" fill="#260608" stroke="#ff2029" stroke-width="10"/>
      <text x="800" y="235" text-anchor="middle" style="font:900 40px ${arabicFont};fill:#ff2630;letter-spacing:7px">FIRST WINNER</text>
      <text x="800" y="425" text-anchor="middle" style="font:900 92px ${arabicFont};fill:#fff">${escapeXml(trimText(name, 22))}</text>
      <text x="800" y="545" text-anchor="middle" style="font:900 68px ${arabicFont};fill:#fff">${points} XP</text>
      <text x="800" y="635" text-anchor="middle" style="font:800 34px ${arabicFont};fill:#ddd">${seconds} ثانية · ${typoCount ? `${typoCount} خطأ إملائي مقبول` : "إجابة دقيقة"}</text>
      <text x="800" y="820" text-anchor="middle" style="font:900 32px ${arabicFont};fill:#fff">ZARK LFG SYSTEM</text>
    </svg>`);
    return sharp(roomCardBackgroundPath).resize(1600, 900, { fit: "cover" }).composite([{ input: svg }]).png().toBuffer();
  }

  async function renderProfileVisual(data: UnifiedProfile) {
    const avatar = data.avatarUrl ? await remoteImage(data.avatarUrl) : undefined;
    const rating = data.lfg.rating.average ? `${data.lfg.rating.average} / 5` : "لا يوجد تقييم";
    const favorite = data.lfg.favoriteGames[0];
    const activity = data.settings.activityVisible ? availabilityLabel(data.settings.currentActivity) : "🔒 الحالة مخفية";
    const svg = Buffer.from(`<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="900" fill="#020202" fill-opacity=".78"/>
      <style>${fontFaceStyle}.label{font:800 28px ${arabicFont};fill:#aaa}.value{font:900 56px ${arabicFont};fill:#fff}.small{font:800 32px ${arabicFont};fill:#ddd}</style>
      <rect x="1120" y="58" width="330" height="58" rx="12" fill="#ed1c24"/><text x="1285" y="97" text-anchor="middle" style="font:900 21px ${arabicFont};fill:#fff;letter-spacing:4px">ZARK PROFILE</text>
      <circle cx="340" cy="385" r="205" fill="#111" stroke="#ed1c24" stroke-width="10"/>
      ${avatar ? "" : `<text x="340" y="430" text-anchor="middle" style="font:900 145px ${arabicFont};fill:#fff">${escapeXml(data.displayName.slice(0, 1).toUpperCase())}</text>`}
      <text x="1040" y="230" text-anchor="middle" style="font:900 90px ${arabicFont};fill:#fff">${escapeXml(trimText(data.displayName, 22))}</text>
      <text x="1040" y="300" text-anchor="middle" class="small">Zark Level ${data.zark.level} · ${escapeXml(rating)}</text>
      <rect x="590" y="360" width="900" height="235" rx="30" fill="#0d0d0d" stroke="#3a3a3a" stroke-width="3"/>
      ${profileStat(700, "Zark XP", data.zark.xp.toLocaleString())}${profileStat(925, "الفوز", String(data.zark.wins))}${profileStat(1150, "التفاعل", String(data.lfg.engagement))}${profileStat(1375, "وقت Voice", formatDuration(data.lfg.voiceSeconds))}
      <text x="1040" y="690" text-anchor="middle" class="small">${data.lfg.completedSessions} جلسة مكتملة · لعب مع ${data.lfg.uniqueTeammates} عضو مختلف</text>
      <text x="1040" y="755" text-anchor="middle" class="small">${favorite ? `أكثر لعبة: ${escapeXml(favorite.name)} · ${favorite.sessions} جلسة` : "ابدأ أول جلسة LFG وسجّل إنجازك"}</text>
      <text x="1040" y="820" text-anchor="middle" style="font:800 29px ${arabicFont};fill:#ff6b70">${escapeXml(activity)}</text>
      <text x="340" y="650" text-anchor="middle" style="font:900 36px ${arabicFont};fill:#fff">ZARK LEVEL ${data.zark.level}</text>
    </svg>`);
    const layers: Array<{ input: Buffer; left?: number; top?: number }> = [{ input: svg }];
    if (avatar) {
      const mask = Buffer.from(`<svg width="390" height="390"><circle cx="195" cy="195" r="195" fill="#fff"/></svg>`);
      const rounded = await sharp(avatar).resize(390, 390, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      layers.push({ input: rounded, left: 145, top: 190 });
    }
    return sharp(roomCardBackgroundPath).resize(1600, 900, { fit: "cover" }).composite(layers).png().toBuffer();
  }

  function profileStat(x: number, label: string, value: string) {
    return `<text x="${x}" y="435" text-anchor="middle" class="label">${escapeXml(label)}</text><text x="${x}" y="525" text-anchor="middle" class="value">${escapeXml(value)}</text>`;
  }

  async function remoteImage(url: string) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(8_000) }); return response.ok ? Buffer.from(await response.arrayBuffer()) : undefined; } catch { return undefined; }
  }

  function countryCodeFromFlag(value: string) {
    const match = value.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0];
    if (!match) return undefined;
    return Array.from(match).map((char) => String.fromCharCode(char.codePointAt(0)! - 0x1f1e6 + 65)).join("");
  }

  function cleanPrompt(value: string, flag: boolean) {
    const withoutMarkdown = value.replace(/\*\*/g, "").replace(/\n+/g, " · ").trim();
    return flag ? withoutMarkdown.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/u, "").replace(/^🚩\s*/, "").replace(/لأي دولة هذا العلم[؟?]?/, "اختر اسم الدولة").trim() : withoutMarkdown;
  }

  function wrapText(value: string, maxLength: number) {
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    for (const word of words) {
      const current = lines.at(-1);
      if (!current || current.length + word.length + 1 > maxLength) lines.push(word);
      else lines[lines.length - 1] = `${current} ${word}`;
    }
    return lines;
  }

  function gameEmoji(slug: string) { return Object.fromEntries(playChoices.map(([name, value]) => [value, name.split(" ")[0]]))[slug] ?? "🎮"; }

  async function roomMessagePayload(room: LiveRoom, detailed: boolean) {
    try {
      const filename = `zark-room-${room.id}.png`;
      const image = await renderRoomVisual(room);
      return { embeds: [roomEmbed(room, detailed).setImage(`attachment://${filename}`)], files: [new AttachmentBuilder(image, { name: filename })] };
    } catch (error) {
      console.error("Zark room visual render failed", error);
      return { embeds: [roomEmbed(room, detailed)], files: [] as AttachmentBuilder[] };
    }
  }

  async function renderRoomVisual(room: LiveRoom) {
    const visibleMembers = room.members.slice(0, 4);
    const avatars = await Promise.all(visibleMembers.map(async (member) => ({ member, data: await avatarData(member.id, member.avatarUrl) })));
    const hostAvatar = await avatarData(room.hostId, room.hostAvatarUrl);
    const status = room.status === "SCHEDULED" ? "مجدولة" : room.status === "ACTIVE" ? "يلعبون الآن" : room.status === "FULL" ? "اكتمل الفريق" : room.status === "COMPLETED" ? "اكتملت" : room.status === "CLOSED" ? "مغلقة" : "تجمع لاعبين";
    const timing = room.scheduledFor && room.status === "SCHEDULED"
      ? `موعد التجمع ${formatClock(room.scheduledFor)}`
      : room.startedAt ? `بدأ اللعب ${formatClock(room.startedAt)}` : `بدأ التجمع ${formatClock(room.createdAt)}`;
    const avatarMarkup = avatars.map(({ member, data }, index) => {
      const x = 760 + index * 205;
      const crown = member.id === room.hostId ? "👑" : member.voiceActive ? "🎙️" : "";
      const image = data ? `<image href="${data}" x="${x - 62}" y="655" width="124" height="124" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-${index})"/>` : `<circle cx="${x}" cy="717" r="62" fill="#2a2a2a"/><text x="${x}" y="735" text-anchor="middle" class="initial">${escapeXml(member.displayName.slice(0, 1).toUpperCase())}</text>`;
      return `<clipPath id="avatar-${index}"><circle cx="${x}" cy="717" r="62"/></clipPath>${image}<circle cx="${x}" cy="717" r="64" fill="none" stroke="${member.id === room.hostId ? "#ff2530" : member.voiceActive ? "#31db8b" : "#ffffff"}" stroke-opacity=".9" stroke-width="5"/><text x="${x}" y="825" text-anchor="middle" class="member">${escapeXml(trimText(member.displayName, 12))} ${crown}</text>`;
    }).join("");
    const extra = Math.max(0, room.members.length - visibleMembers.length);
    const hostVisual = hostAvatar ? `<clipPath id="host-avatar"><circle cx="330" cy="390" r="190"/></clipPath><image href="${hostAvatar}" x="140" y="200" width="380" height="380" preserveAspectRatio="xMidYMid slice" clip-path="url(#host-avatar)"/>` : `<circle cx="330" cy="390" r="190" fill="#161616"/><text x="330" y="440" text-anchor="middle" style="font:900 145px ${arabicFont};fill:#fff">${escapeXml(room.hostName.slice(0, 1).toUpperCase())}</text>`;
    const detail = trimText(room.mapName ? `الماب: ${room.mapName}` : room.gameMode ? `النمط: ${room.gameMode}` : room.description ?? "جاهزون للتجمع واللعب", 42);
    const svg = Buffer.from(`<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".42" stop-color="#000" stop-opacity=".48"/><stop offset="1" stop-color="#050505" stop-opacity=".94"/></linearGradient></defs>
      <rect width="1600" height="900" fill="url(#shade)"/>
      <style>${fontFaceStyle}.title{font:900 82px ${arabicFont};fill:#fff}.eyebrow{font:900 25px ${arabicFont};letter-spacing:5px;fill:#ff2029}.meta{font:800 39px ${arabicFont};fill:#fff}.sub{font:700 31px ${arabicFont};fill:#d2d2d2}.member{font:800 24px ${arabicFont};fill:#fff}.initial{font:900 54px ${arabicFont};fill:#fff}.count{font:900 76px ${arabicFont};fill:#fff}</style>
      <rect x="1140" y="55" width="310" height="60" rx="12" fill="#ed1c24"/>
      <text x="1295" y="96" text-anchor="middle" style="font:900 22px ${arabicFont};letter-spacing:5px;fill:#fff">ZARK LFG</text>
      <text x="330" y="120" text-anchor="middle" class="eyebrow">ROOM HOST</text>
      ${hostVisual}<circle cx="330" cy="390" r="195" fill="none" stroke="#ff2029" stroke-width="10"/>
      <text x="330" y="650" text-anchor="middle" class="meta">${escapeXml(trimText(room.hostName, 18))}</text>
      <text x="1060" y="230" text-anchor="middle" class="title">${escapeXml(trimText(room.title ?? room.gameName, 24))}</text>
      <text x="1060" y="330" text-anchor="middle" class="count">${room.currentPlayers}/${room.maxPlayers} · ${room.needsVoice ? "VOICE" : "TEXT"}</text>
      <text x="1060" y="405" text-anchor="middle" class="meta">${escapeXml(status)}</text>
      <text x="1060" y="470" text-anchor="middle" class="sub">${escapeXml(timing)}</text>
      <line x1="660" y1="520" x2="1460" y2="520" stroke="#ff2029" stroke-width="5" stroke-opacity=".75"/>
      <text x="1060" y="580" text-anchor="middle" class="sub">${escapeXml(detail)}</text>
      ${avatarMarkup}${extra ? `<circle cx="1510" cy="717" r="58" fill="#221113" stroke="#ff2029" stroke-width="4"/><text x="1510" y="735" text-anchor="middle" class="meta">+${extra}</text>` : ""}
    </svg>`);
    return sharp(roomCardBackgroundPath).resize(1600, 900, { fit: "cover" }).composite([{ input: svg }]).png({ compressionLevel: 8 }).toBuffer();
  }

  async function avatarData(userId: string, knownUrl?: string) {
    try {
      const url = knownUrl ?? (await client.users.fetch(userId)).displayAvatarURL({ extension: "png", size: 256 });
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return undefined;
      const contentType = response.headers.get("content-type") ?? "image/png";
      return `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
    } catch { return undefined; }
  }

  function roomEmbed(room: LiveRoom, detailed = false) {
    const status = room.status === "SCHEDULED" ? "🕐 موعد مسجل" : room.status === "ACTIVE" ? "🔴 يلعبون الآن" : room.status === "COMPLETED" ? "✅ انتهت الجلسة" : room.status === "CLOSED" ? "⚫ أُغلقت" : room.status === "FULL" ? "🟠 مكتملة العدد" : "🟢 تجمع لاعبين";
    const players = room.members.length ? room.members.map((member, index) => `${member.id === room.hostId ? "👑" : member.voiceActive ? "🎙️" : "•"} ${member.displayName}`).join("\n") : "لا يوجد لاعبون";
    const timing = room.scheduledFor && room.status === "SCHEDULED"
      ? `موعد التجمع <t:${Math.floor(new Date(room.scheduledFor).getTime() / 1000)}:F>`
      : room.startedAt ? `بدأ اللعب <t:${Math.floor(new Date(room.startedAt).getTime() / 1000)}:t>` : `بدأ التجمع <t:${Math.floor(new Date(room.createdAt).getTime() / 1000)}:t>`;
    const embed = baseEmbed()
      .setColor(Number.parseInt(room.accentColor.replace("#", ""), 16) || brand.color)
      .setTitle(`${room.roomEmoji ?? room.gameIcon ?? "🎮"} ${room.title ?? room.gameName} | LFG`)
      .setDescription(`${status}\n👑 **${room.hostName}** · 👥 **${room.currentPlayers}/${room.maxPlayers}**\n🕐 ${timing}${room.mapName ? `\n🗺️ **الماب:** ${room.mapName}` : ""}${room.gameMode ? `\n🎯 **النمط:** ${room.gameMode}` : ""}${room.description ? `\n${room.description}` : ""}`);
    if (detailed) embed.addFields({ name: "أعضاء الغرفة", value: players.slice(0, 1024) });
    return embed;
  }

  function roomButtons(roomId: string, gameSlug: string, room?: LiveRoom) {
    const finished = room ? ["COMPLETED", "CLOSED"].includes(room.status) : false;
    const joinDisabled = finished || Boolean(room?.locked) || (room ? room.currentPlayers >= room.maxPlayers : false);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`lfg:join:${roomId}`).setLabel(room?.status === "SCHEDULED" ? "تسجيل" : "دخول").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(joinDisabled),
      new ButtonBuilder().setCustomId(`lfg:leave:${roomId}`).setLabel(room?.status === "SCHEDULED" ? "إلغاء التسجيل" : "خروج").setEmoji("🚪").setStyle(ButtonStyle.Secondary).setDisabled(finished),
      new ButtonBuilder().setCustomId(`lfg:interest-on:${gameSlug}`).setLabel("مهتم").setEmoji("❤️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`lfg:mute:${gameSlug}`).setLabel("كتم").setEmoji("🔕").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel("الموقع").setEmoji("🌐").setStyle(ButtonStyle.Link).setURL(`${siteUrl()}/lfg.html?room=${encodeURIComponent(roomId)}`),
    );
  }

  function interestButtons(gameSlug: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`lfg:interest-on:${gameSlug}`).setLabel("مهتم + إشعارات").setEmoji("❤️").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`lfg:mute:${gameSlug}`).setLabel("مهتم بدون إشعارات").setEmoji("🔕").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lfg:interest-off:${gameSlug}`).setLabel("غير مهتم").setEmoji("🚫").setStyle(ButtonStyle.Danger),
    );
  }

  function availabilityPanelPayload(current: UserAvailability, saved = false) {
    const until = current.activityUntil ? ` حتى <t:${Math.floor(new Date(current.activityUntil).getTime() / 1000)}:R>` : "";
    const first = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("availability:set:FREE:120").setLabel("فاضي ساعتين").setEmoji("🟢").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("availability:set:PLAYING:120").setLabel("ألعب الآن").setEmoji("🎮").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("availability:set:BUSY:60").setLabel("مشغول ساعة").setEmoji("⛔").setStyle(ButtonStyle.Secondary),
    );
    const second = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("availability:set:STUDYING:120").setLabel("أدرس").setEmoji("📚").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("availability:set:WORKING:120").setLabel("أعمل").setEmoji("💼").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("availability:set:SLEEPING:480").setLabel("نايم").setEmoji("😴").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("availability:set:AWAY:0").setLabel("غير متاح").setEmoji("🌙").setStyle(ButtonStyle.Danger),
    );
    return {
      embeds: [baseEmbed().setTitle(`${saved ? "✅ تم التحديث" : "🕐 حالتي الآن"}`).setDescription(`**${availabilityLabel(current.currentActivity)}**${until}\nاضغط خيارًا واحدًا فقط؛ لا توجد إعدادات أو خطوات إضافية.`)],
      components: [first, second],
    };
  }

  function baseEmbed() { return new EmbedBuilder().setColor(brand.color).setAuthor({ name: brand.name }).setFooter({ text: brand.tagline }).setTimestamp(); }
  function siteUrl() { return (runtimeSettings.websiteUrl || process.env.PUBLIC_SITE_URL || "https://zark-ps.com").replace(/\/+$/, ""); }
  function shortId(value: string) { return `#${value.slice(-8).toUpperCase()}`; }
  function actor(interaction: any) { return { userId: interaction.user.id, displayName: displayName(interaction), avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }) }; }
  function displayName(interaction: any) { return interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username; }
  function winnerLine(name: string, rank?: number, points?: number) { return `🏁 **${name}** خطف المركز ${rank} بـ **${points} XP**!`; }
  function medal(index: number) { return ["🥇", "🥈", "🥉"][index] ?? `#${index + 1}`; }
  function formatDuration(seconds: number) { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}س ${minutes}د` : `${minutes} دقيقة`; }
  function formatClock(value: string) { return new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Jerusalem" }).format(new Date(value)); }
  function availabilityLabel(value: UserAvailability["currentActivity"]) { return ({ FREE: "🟢 فاضي للعب", PLAYING: "🎮 ألعب الآن", STUDYING: "📚 أدرس", WORKING: "💼 أعمل", BUSY: "⛔ مشغول", SLEEPING: "😴 نايم", AWAY: "🌙 غير متاح" })[value]; }
  function profileActivityText(data: UnifiedProfile) {
    if (!data.settings.activityVisible) return "🔒 الحالة مخفية من العضو";
    const until = data.settings.activityUntil ? ` حتى <t:${Math.floor(new Date(data.settings.activityUntil).getTime() / 1000)}:R>` : "";
    const note = data.settings.activityNote ? ` — ${data.settings.activityNote}` : "";
    return `${availabilityLabel(data.settings.currentActivity)}${until}${note}`;
  }
  function channelSlug(value: string) { return value.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 24).toLowerCase() || "player"; }
  function trimText(value: string, max: number) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
  function escapeXml(value: string) { return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[char] ?? char); }
  function parseScheduledTime(value: string) {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!match) throw new Error("اكتب الموعد بهذا الشكل: 2026-08-29 21:00");
    const [, year, month, day, hour, minute] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 2 * 60_000) throw new Error("اختر موعدًا صحيحًا بعد دقيقتين على الأقل");
    return date.toISOString();
  }

  async function shutdownBot(signal: string) {
    console.log(`Zark bot shutting down (${signal})`);
    for (const race of activeRaceChannels.values()) clearTimeout(race.timeout);
    activeRaceChannels.clear();
    if (botEventSubscriber?.isOpen) await botEventSubscriber.close().catch((error) => console.error("Redis bot subscriber close failed", error));
    client.destroy();
  }
  process.once("SIGTERM", () => void shutdownBot("SIGTERM"));
  process.once("SIGINT", () => void shutdownBot("SIGINT"));
}

function buildCommands() {
  return [
    new SlashCommandBuilder().setName("help").setDescription("دليل جميع أوامر Zark"),
    new SlashCommandBuilder().setName("help-plus").setDescription("شرح كامل ومبسط لكل أنظمة Zark"),
    new SlashCommandBuilder().setName("daily").setDescription("تحدي Zark اليومي"),
    new SlashCommandBuilder().setName("loyalty").setDescription("نقاط الولاء ورتب Zark ومتجر VIP"),
    new SlashCommandBuilder().setName("weekly").setDescription("متصدرو نقاط الولاء خلال هذا الأسبوع"),
    new SlashCommandBuilder().setName("pulse").setDescription("لوحتك الشخصية: التفاعل والفرص المتاحة الآن"),
    new SlashCommandBuilder().setName("event-hour").setDescription("بدء فعالية نقاط مضاعفة — للإدارة").addIntegerOption((option) => option.setName("minutes").setDescription("المدة بالدقائق").setMinValue(15).setMaxValue(180)),
    new SlashCommandBuilder()
      .setName("play")
      .setDescription("ابدأ لعبة Zark داخل Discord")
      .addStringOption((option) => option.setName("game").setDescription("اكتب اسم اللعبة للبحث بين 40 لعبة أو help").setAutocomplete(true))
      .addIntegerOption((option) => option.setName("rounds").setDescription("عدد الجولات — اختياري، الافتراضي جولة واحدة").addChoices(
        { name: "جولتان", value: 2 },
        { name: "3 جولات", value: 3 },
        { name: "4 جولات", value: 4 },
        { name: "5 جولات", value: 5 },
        { name: "10 جولات", value: 10 },
      ))
      .addIntegerOption((option) => option.setName("seconds").setDescription("وقت الإجابة بالثواني — من 10 إلى 60، الافتراضي 15").setMinValue(10).setMaxValue(60)),
    new SlashCommandBuilder().setName("profile").setDescription("اعرض ملف Zark + LFG الموحد").addUserOption((option) => option.setName("user").setDescription("العضو — اتركه فارغًا لملفك")),
    new SlashCommandBuilder().setName("leaderboard").setDescription("متصدرو اليوم").addStringOption((option) => option.setName("type").setDescription("نوع النقاط").addChoices({ name: "ألعاب Zark", value: "game" }, { name: "تفاعل LFG", value: "engagement" })),
    availabilityCommand("availability"),
    availabilityCommand("وقت-فراغي"),
    new SlashCommandBuilder().setName("lfg").setDescription("نظام العثور على لاعبين")
      .addSubcommand((command) => command.setName("create").setDescription("أنشئ تجمعًا بخطوات سريعة"))
      .addSubcommand((command) => command.setName("profile").setDescription("ملف LFG").addUserOption((option) => option.setName("user").setDescription("العضو")))
      .addSubcommand((command) => command.setName("top").setDescription("أفضل لاعبي LFG").addStringOption((option) => option.setName("metric").setDescription("التصنيف").addChoices({ name: "التفاعل", value: "engagement" }, { name: "الجلسات", value: "sessions" }, { name: "التقييم", value: "rating" })))
      .addSubcommand((command) => command.setName("rooms").setDescription("اعرض الغرف المفتوحة"))
      .addSubcommand((command) => command.setName("smart").setDescription("دع Zark ينظم أفضل تجمع حسب الاهتمام والتفرغ"))
      .addSubcommand((command) => command.setName("auto").setDescription("حالة أو إدارة إنشاء الغرف التلقائي — للإدارة").addBooleanOption((option) => option.setName("enabled").setDescription("تفعيل أو إيقاف؛ اتركه فارغًا لمعرفة الحالة")))
      .addSubcommand((command) => command.setName("interests").setDescription("إدارة اهتمامات الألعاب والإشعارات"))
      .addSubcommand((command) => command.setName("report").setDescription("إبلاغ عن لاعب").addUserOption((option) => option.setName("user").setDescription("اللاعب").setRequired(true)))
      .addSubcommand((command) => command.setName("bug").setDescription("إرسال تقرير خطأ"))
      .addSubcommand((command) => command.setName("rate").setDescription("تقييم لاعب بعد جلسة").addUserOption((option) => option.setName("user").setDescription("اللاعب").setRequired(true)).addStringOption((option) => option.setName("room").setDescription("معرّف الغرفة").setRequired(true)).addIntegerOption((option) => option.setName("stars").setDescription("من 1 إلى 5").setRequired(true).setMinValue(1).setMaxValue(5))),
  ].map((command) => command.toJSON());
}

function availabilityCommand(name: string) {
  return new SlashCommandBuilder().setName(name).setDescription("غيّر حالتك بضغطة واحدة");
}

type RaceAnswer = { correct: boolean; points: number; rank?: number; capped?: boolean; expired?: boolean; typoCount?: number; elapsedMs?: number };
type ZarkMatch = { id: string; seriesId: string; gameSlug: string; gameName: string; roundNumber: number; totalRounds: number; prompt: string; mediaUrl?: string; endsAt: string };
type ActiveRace = { matchId: string; messageId: string; timeout: ReturnType<typeof setTimeout>; endsAtMs: number };
type ActiveDaily = { challengeId: string; messageId: string };
type RaceStanding = { userId: string; displayName: string; points: number; wins: number };
type RaceProgress = { completed: true; seriesId: string; totalRounds: number; standings: RaceStanding[] } | { completed: false; nextMatch: ZarkMatch; standings: RaceStanding[] };
type UserAvailability = { currentActivity: "FREE" | "PLAYING" | "STUDYING" | "WORKING" | "BUSY" | "SLEEPING" | "AWAY"; activityUntil?: string; activityNote?: string; mentionPolicy: "EVERYONE" | "INTERESTED_ONLY" | "NOBODY"; weeklyAvailability: Array<{ id?: string; dayOfWeek: number; startMinute: number; endMinute: number; activity: string }> };
type LfgInterestInsight = { gameSlug: string; gameName: string; gameIcon?: string; minPlayers: number; autoMinAvailable: number; maxPlayers: number; interestedCount: number; availableNowCount: number; interestPercent: number };
type SmartMatchResult = { room: LiveRoom; insight: LfgInterestInsight; joinedExisting: boolean };
type LiveRoom = { id: string; hostId: string; gameSlug: string; gameName: string; gameIcon?: string; hostName: string; hostAvatarUrl?: string; title?: string; currentPlayers: number; maxPlayers: number; durationMinutes: number; createdAt: string; scheduledFor?: string; readyNotifiedAt?: string; reminderDeliveredAt?: string; attendanceWarningAt?: string; startedAt?: string; playEndsAt?: string; completedAt?: string; autoDeleteAt?: string; status: string; needsVoice: boolean; locked: boolean; roomEmoji?: string; accentColor: string; gameMode?: string; mapName?: string; description?: string; textChannelId?: string; voiceChannelId?: string; categoryId?: string; controlMessageId?: string; listingChannelId?: string; listingMessageId?: string; members: Array<{ id: string; displayName: string; avatarUrl?: string; voiceActive: boolean; voiceSeconds: number }> };
type GuildRuntimeSettings = { guildId: string; botName: string; tagline: string; lfgChannelId?: string; lfgCategoryId?: string; publicChannelId?: string; dailyChannelId?: string; leaderboardChannelId?: string; reportChannelId?: string; websiteUrl: string; dmNotificationsEnabled: boolean; quickMatchEnabled: boolean; autoSmartRoomsEnabled: boolean; ratingsEnabled: boolean; reportsEnabled: boolean; autoCreateRoomChannels: boolean; maxDmPerDay: number; notificationCooldownMinutes: number; maxActiveRoomsPerUser: number; defaultRoomDurationMinutes: number; roomGraceMinutes: number; aiChatEnabled: boolean; aiDailyMessagesPerUser: number; aiGlobalDailyMessages: number; aiDailyTokenBudgetPerUser: number; aiGlobalDailyTokenBudget: number; aiMaxOutputTokens: number };
type ReportThread = { id: string; kind: "PLAYER" | "BUG"; title: string; status: string; description?: string; reporter: { id: string; displayName: string; avatarUrl?: string }; reported?: { id: string; displayName: string; avatarUrl?: string }; messages: Array<{ id: string; authorName: string; authorRole: string; message: string; createdAt: string }> };
type UnifiedProfile = { displayName: string; avatarUrl?: string; settings: { activityVisible: boolean; currentActivity: UserAvailability["currentActivity"]; activityUntil?: string; activityNote?: string }; zark: { level: number; xp: number; wins: number; streak: number }; lfg: { engagement: number; completedSessions: number; uniqueTeammates: number; voiceSeconds: number; favoriteGames: Array<{ name: string; icon?: string; sessions: number }>; interests: Array<{ slug: string; name: string; icon?: string }>; rating: { average: number | null; count: number } } };
