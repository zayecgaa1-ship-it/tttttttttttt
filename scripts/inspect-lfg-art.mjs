import { mkdir, writeFile } from 'node:fs/promises';
const sites = ['https://www.minecraft.net/en-us','https://www.roblox.com','https://playvalorant.com/en-us/','https://www.fortnite.com','https://www.leagueoflegends.com/en-us/','https://www.pubgmobile.com/en-US/home.shtml'];
await mkdir(new URL('../artifacts/lfg-art/', import.meta.url), {recursive:true});
await Promise.all(sites.map(async (url,i)=>{
  try {
    const html = await (await fetch(url,{signal:AbortSignal.timeout(20000)})).text();
    await writeFile(new URL(`../artifacts/lfg-art/site-${i}.html`,import.meta.url),html);
    console.log(url, JSON.stringify({og:html.match(/<meta[^>]*og:image[^>]*>/gi),logos:[...html.matchAll(/(?:src|srcset)="([^"]*(?:logo|Logo)[^"]*)"/g)].slice(0,8).map(m=>m[1])}));
  } catch(e){console.log(url,e.message);}
}));
