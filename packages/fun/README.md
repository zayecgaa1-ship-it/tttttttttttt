# Arabic humor library

The generated bank in `src/arabic-humor.ts` contains filtered entries from
[Arabic-Humor](https://github.com/iwan-rg/Arabic-Humor) by Iwan and A. Islam.
The source dataset is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Run `node scripts/import-arabic-humor.mjs` to refresh the local bank. The importer
keeps Arabic joke-shaped entries and removes links, mentions, political, religious,
adult, violent, discriminatory, and insulting terms before generating the TypeScript file.
