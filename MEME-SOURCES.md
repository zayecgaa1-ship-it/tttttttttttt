# Meme image sources

## Primary library

The live meme command uses 1,957 entries from
[QCRI/Prop2Hate-Meme](https://huggingface.co/datasets/QCRI/Prop2Hate-Meme).
Every entry must have all three source labels: `not_propaganda`, `not-hateful`,
and `humor`. The bot stores stable split and row indexes, then asks the official
Hugging Face datasets server for a fresh image URL when the meme is requested.
Run `node scripts/import-prop2hate-memes.mjs` to rebuild the validated index.

Prop2Hate-Meme is licensed CC BY-NC-SA 4.0. This integration credits and links
the source, does not modify images, and is intended for non-commercial use.

## Fallback library

The repository also indexes all 100 original image URLs from the public
[AHA-MEMES sample](https://github.com/MohamedBayan/AHA-MEMES-sample).
The generated catalogue is in `packages/fun/src/source-memes.ts`. It contains
all 65 `Not Hateful` and all 35 `Hateful` rows in the public sample. The bot
records which entries have the source label `Hateful`. Only the original 24
hand-selected, non-hateful entries are used when the primary service is unavailable.

Images are embedded directly from the source. No captions, crops, branding, or
other edits are applied. The embed links to the source and credits the original
image owners. Availability depends on GitHub and Discord's image proxy.
The generated template renderer is no longer used. Jokes remain separate.
Per-user history lasts for the bot process lifetime and avoids repeats until
the selected library is exhausted.

Run `node scripts/import-aha-memes.mjs` to refresh the catalogue from the public
sample metadata. The importer validates the row count, unique IDs, and label
distribution before generating the TypeScript file.

## Source terms

The sample README restricts annotations and meta-features to research use,
prohibits commercial use of the dataset, and reserves image rights to the
original creators. Public availability is not a blanket image license. This
repository contains image references, not a redistribution of the images or
annotations; commercial use requires appropriate permission.

The [full Hugging Face dataset](https://huggingface.co/datasets/QCRI/AHA-MEMES)
has gated access with research-only, non-commercial and non-redistribution
conditions. It was not downloaded, and no access terms were accepted.
Do not use its gated files as an entertainment feed.
