# Meme image sources

The bot displays all 100 original image URLs from the public
[AHA-MEMES sample](https://github.com/MohamedBayan/AHA-MEMES-sample).
The generated catalogue is in `packages/fun/src/source-memes.ts`. It contains
all 65 `Not Hateful` and all 35 `Hateful` rows in the public sample. The bot
shows a content warning on entries whose source label is `Hateful`.

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
