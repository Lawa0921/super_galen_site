---
name: gemini-music-gen
description: Generate background music (BGM) / instrumental music loops for the SuperGalen site via Google Gemini's Lyria 3 models. Use when the user asks to generate, create, or compose music / BGM / a soundtrack / a looping track (e.g. for the /games arcade or game pages). Pure-Node wrapper around the Lyria 3 generateContent API; outputs ready-to-use mp3. NOT for sound effects (games use Web Audio synthesis) or speech (use a TTS path).
---

# Gemini Music Generation (Lyria 3)

Pure-Node wrapper around Lyria 3 (`lyria-3-clip-preview` / `lyria-3-pro-preview`) via the
Gemini `:generateContent` API. Lyria returns a ready-to-use **mp3** (stereo 44.1kHz, ~30s)
directly — no transcode needed for basic use.

## Pre-flight
- API key chain: `--key` → `process.env.GEMINI_API_KEY` → `~/.gemini/.env` (`GEMINI_API_KEY=…`).
- `ffmpeg`/`ffprobe` only needed for `--normalize` / `--webloop`.
- Run from project root so bare filenames resolve into `public/assets/games/bgm/`.

## Command

```bash
node .claude/skills/gemini-music-gen/scripts/generate-music.mjs \
  "<style prompt>" <output> \
  [--model clip|pro] [--seed N] [--negative "..."] \
  [--webloop] [--normalize] [--mp3-bitrate 192k] [--key K]
```

- Output path: absolute → as-is; has `/` → from cwd; bare name → `public/assets/games/bgm/`.
- `--model clip` (default, 30s) / `pro` (higher quality).
- `--normalize`: loudnorm to -16 LUFS (consistent levels across tracks).
- `--webloop`: short fade in/out to avoid clicks at the `<audio loop>` seam.
- `--seed`: best-effort reproducibility (may be ignored by the model).

## Prompt tips
Always instrumental + "seamless loop" + a clear genre/mood + tempo feel. Keep tracks in one
sonic palette so a multi-page soundtrack feels unified.

## Tests
`node --test .claude/skills/gemini-music-gen/scripts/generate-music.test.mjs` (pure helpers, no network).

## Notes
- The HTTP call uses `node:https` (not `fetch`) because undici `fetch` can time out
  (ETIMEDOUT) on this WSL2 environment; `node:https` is reliable here.
