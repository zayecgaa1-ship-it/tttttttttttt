export function ratingRoomIdFromCustomId(customId: string) {
  const match = /^lfg:rating-player:([^:]+)$/.exec(customId);
  return match?.[1];
}
