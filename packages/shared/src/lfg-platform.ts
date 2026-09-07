export const LFG_PLATFORMS = ['MOBILE', 'PC', 'PLAYSTATION'] as const;
export type LfgPlatform = typeof LFG_PLATFORMS[number];
export const LFG_PLATFORM_LABELS: Record<LfgPlatform, string> = {
  MOBILE: '📱 جوال', PC: '💻 كمبيوتر', PLAYSTATION: '🎮 بلايستيشن',
};

// A null preference means the game supports all devices (for example Minecraft).
// A null room is an all-device room and can notify every interested player.
export function matchesLfgPlatform(room: LfgPlatform | null | undefined, player: LfgPlatform | null | undefined) {
  if (!room || !player) return true;
  return room === player;
}
