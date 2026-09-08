export function calculateTeamScore(totals: { xp: number; wins: number; sessions: number }) {
  return Math.max(0, totals.xp) + Math.max(0, totals.wins) * 100 + Math.max(0, totals.sessions) * 50;
}

export function calculateSmartRoomScore(input: { memberCount: number; maxPlayers: number; teammates: number; ageMs: number }) {
  const fillRatio = Math.max(0, input.memberCount) / Math.max(1, input.maxPlayers);
  const ageHours = Math.min(12, Math.max(0, input.ageMs) / 3_600_000);
  return fillRatio * 100 + Math.max(0, input.teammates) * 35 + ageHours;
}

export function rankSmartRooms<T extends { status: string; locked: boolean; memberCount: number; maxPlayers: number; createdAt: Date; members: { userId: string }[] }>(rooms: T[], teammateIds: Set<string>, now=Date.now()) {
  return rooms
    .filter(room=>room.status==='OPEN'&&!room.locked&&room.memberCount<room.maxPlayers)
    .map(room=>{
      const teammates=room.members.filter(member=>teammateIds.has(member.userId)).length;
      return {room,teammates,score:calculateSmartRoomScore({memberCount:room.memberCount,maxPlayers:room.maxPlayers,teammates,ageMs:now-room.createdAt.getTime()})};
    })
    .sort((a,b)=>b.score-a.score);
}
