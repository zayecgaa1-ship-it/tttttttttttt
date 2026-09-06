# Arabic humor library

The bot serves all 4,455 rows labelled `yes` in `humor.tsv` from
`src/arabic-humor.ts`. No editorial filter or deduplication is applied, so every
source row remains available. History cycles through the full live bank before
returning the oldest result.

The generated bank in `src/arabic-humor.ts` contains all humorous entries from
[Arabic-Humor](https://github.com/iwan-rg/Arabic-Humor) by Al-Khalifa et al. (2022).
The source dataset is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Run `node scripts/import-arabic-humor.mjs` to refresh the local bank. The importer
keeps every row whose source label is `yes` and normalizes Unicode presentation
forms and whitespace before generating the TypeScript file.

Meme image source details are documented in the repository-level `MEME-SOURCES.md`.
