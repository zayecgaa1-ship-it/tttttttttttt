export async function discordOptions(){
  const guildId=process.env.DISCORD_GUILD_ID,token=process.env.DISCORD_TOKEN;
  if(!guildId||!token)throw Object.assign(new Error('إعدادات Discord غير مكتملة'),{statusCode:503});
  const results=await Promise.all(['roles','channels'].map(async resource=>{
    const response=await fetch(`https://discord.com/api/v10/guilds/${guildId}/${resource}`,{headers:{authorization:`Bot ${token}`},signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw Object.assign(new Error('تعذر تحميل رتب وقنوات Discord'),{statusCode:503});
    return response.json() as Promise<{id:string;name:string;type?:number;managed?:boolean;position?:number}[]>;
  }));
  return {roles:results[0].filter(role=>!role.managed).map(({id,name})=>({id,name})),channels:results[1].filter(channel=>[0,5].includes(channel.type??-1)).map(({id,name})=>({id,name}))};
}
