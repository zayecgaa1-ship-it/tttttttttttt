import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../apps/web/public/assets/lfg/', import.meta.url);
await mkdir(root, {recursive:true});
const steam = {terraria:105600,cs2:730,'overwatch-2':2357570,'rainbow-six-siege':359550,warzone:1962663,rust:252490,'ark-survival-ascended':2399830,palworld:1623730,'dead-by-daylight':381210,pubg:578080,'apex-legends':1172470,'gta-v':271590,'red-dead-online':1404210,'rocket-league':252950,'ea-sports-fc':2669320,'forza-horizon-5':1551360,'dota-2':570,'among-us':945360,'fall-guys':1097150};
const sources = Object.fromEntries(Object.entries(steam).map(([slug,id])=>[slug,{logo:`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/logo.png`,background:`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`}]));
Object.assign(sources, {
 minecraft:{logo:'https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/logos/Global-Header_MCCB-Logo_300x51.svg',background:'https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/key-art/Homepage_Discover-our-games_MC-Vanilla-KeyArt_864x864.jpg'},
 roblox:{logo:'https://images.rbxcdn.com/fc3f3e3158fc20ebb5ccc972064ebfe6.png',background:'https://images.rbxcdn.com/5348266ea6c5e67b19d6a814cbbb70f6.jpg'},
 valorant:{logo:'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/7b76209193f1bfe190d3ae6ef8728328870be9c3-736x138.png',background:'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/c8157d71a4776dd821d05ed6b82d5d875ca03386-5120x1644.png'},
 'league-of-legends':{logo:'https://upload.wikimedia.org/wikipedia/commons/d/d8/League_of_Legends_2019_vector.svg',background:'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/565197caf987af4e4da307df6e2b235a28714736-837x469.jpg'},
 'pubg-mobile':{logo:'https://www.pubgmobile.com/images/event/common/long_cache_30d/nav_logo.png?v=3',background:'https://www.pubgmobile.com/images/event/home/share.jpg'},
 fortnite:{logo:'https://upload.wikimedia.org/wikipedia/commons/0/0e/FortniteLogo.svg',background:'https://fortnite-api.com/images/map.png'}
});
const results={};
for(const [slug,images] of Object.entries(sources)) {
 results[slug]={};
 await Promise.all(Object.entries(images).map(async([kind,url])=>{
  try {
   const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const data=Buffer.from(await response.arrayBuffer());
   await sharp(data).resize(kind==='logo'?{width:360,height:120,fit:'inside',withoutEnlargement:true}:{width:800,height:450,fit:'cover'}).webp({quality:85}).toFile(fileURLToPath(new URL(`${slug}-${kind}.webp`,root)));
   results[slug][kind]=url;
   console.log('OK',slug,kind);
  }catch(error){console.log('FAIL',slug,kind,error.message);}
 }));
}
await writeFile(new URL('sources.json',root),JSON.stringify(results,null,2)+'\n');
