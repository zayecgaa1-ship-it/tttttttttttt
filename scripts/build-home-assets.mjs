import sharp from 'sharp';
import {mkdirSync} from 'node:fs';
mkdirSync('apps/web/public/assets/home',{recursive:true});
for(const [name,left,top,width,height] of [['scene-left',0,73,150,868],['scene-right',1557,74,115,867],['bot',1380,99,128,120]]) await sharp('image.png').extract({left,top,width,height}).webp({quality:88}).toFile(`apps/web/public/assets/home/${name}.webp`);

for(const [name,left,width] of [['valorant',525,140],['fc',681,141],['apex',838,141],['warzone',994,141],['lol',1151,141],['minecraft',1308,141]])await sharp('image.png').extract({left,top:844,width,height:53}).resize({width:280}).webp({quality:88}).toFile(`apps/web/public/assets/home/game-${name}.webp`);
