import fs from 'node:fs';
const tmp = fs.readFileSync('apps/web/public/app.js','utf8');
const i = tmp.indexOf('const lfgArtworkSlugs');
console.log(tmp.slice(i, i+900));