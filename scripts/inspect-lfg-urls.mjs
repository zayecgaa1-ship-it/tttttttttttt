import { readFileSync } from 'node:fs';
for(const i of [0,1,2,4,5]) {
 const html=readFileSync(new URL(`../artifacts/lfg-art/site-${i}.html`,import.meta.url),'utf8');
 const urls=[...new Set(html.match(/(?:https?:\/\/|\/content\/dam\/)[^\s"<>\\]+?\.(?:png|jpg|webp|svg)/g)||[])];
 console.log(i,urls.filter(x=>i!==0||/home|Homepage|logo/i.test(x)).slice(0,35));
}
