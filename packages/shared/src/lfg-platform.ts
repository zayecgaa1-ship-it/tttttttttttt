export const LFG_PLATFORMS = ['MOBILE', 'PC', 'PLAYSTATION'] as const;
export type LfgPlatform = typeof LFG_PLATFORMS[number];
export const LFG_PLATFORM_LABELS: Record<LfgPlatform, string> = {
  MOBILE: '📱 جوال', PC: '💻 كمبيوتر', PLAYSTATION: '🎮 بلايستيشن',
};

// Unknown platforms never act as a wildcard for a classified room.
export function matchesLfgPlatform(room: LfgPlatform | null | undefined, player: LfgPlatform | null | undefined) {
  return (room ?? null) === (player ?? null);
}
