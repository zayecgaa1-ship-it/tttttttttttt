# Arabic humor library

The bot now serves the edited dialect jokes and explicitly paired image captions
from `src/curated-fun.ts`. The imported corpus below is retained as an archive,
not as the live joke pool. Text/image Cartesian combinations are no longer served.
History cycles through the active bank before returning the oldest result.

The generated bank in `src/arabic-humor.ts` contains filtered entries from
[Arabic-Humor](https://github.com/iwan-rg/Arabic-Humor) by Iwan and A. Islam.
The source dataset is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Run `node scripts/import-arabic-humor.mjs` to refresh the local bank. The importer
keeps Arabic joke-shaped entries and removes links, mentions, political, religious,
adult, violent, discriminatory, and insulting terms before generating the TypeScript file.

The meme command uses a curated allowlist from Imgflip's free `get_memes` catalogue.
Only image URLs on `i.imgflip.com` are accepted. Zark downloads a known template,
caches it in memory, and renders its own Arabic caption locally with the bundled font.
