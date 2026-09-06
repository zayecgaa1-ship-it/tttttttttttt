# Meme image sources

The bot displays 24 explicitly selected original image URLs from the public
[AHA-MEMES sample](https://github.com/MohamedBayan/AHA-MEMES-sample).
The allowlist is in `packages/fun/src/source-memes.ts`. The selection covers
everyday situations, studying, family, and work; all selected entries have the
sample's `Not Hateful` label. This is an explicit list, not an automatic feed.

Images are embedded directly from the source. No captions, crops, branding, or
other edits are applied. The embed links to the source and credits the original
image owners. Availability depends on GitHub and Discord's image proxy.
The generated template renderer is no longer used. Jokes remain separate.
Per-user history lasts for the bot process lifetime and avoids repeats until
the selected library is exhausted.

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
