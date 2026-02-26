---
title: "feat: Audio Architecture Overhaul"
type: feat
status: active
date: 2026-02-26
---

# feat: Audio Architecture Overhaul

## Overview

Replace the unreliable Flask-on-Azure-F1 audio chain with pre-generated static MP3s for all known content and a Vercel API route for GPT-powered hints. Introduces a "hint buffer chain" that plays pre-recorded Bree audio to fill latency while GPT generates personalized feedback.

## Problem Statement

The current architecture chains: Browser → Flask (F1 free tier, 20-30s cold start) → Azure OpenAI → Azure Speech → back to browser. This fails ~75% of the time on first load and consistently fails for misspelled-word hints (SSML escaping issues, GPT parameter incompatibilities, compound failure from chaining two Azure APIs in one blocking request).

## Proposed Solution

### 1. Pre-generated static audio (Vercel CDN)

All word pronunciations, game phrases, and hint buffer lines pre-generated as MP3 files using Azure Bree Dragon HD voice. Committed to `public/audio/` and served instantly from Vercel's edge CDN.

### 2. Vercel API route for GPT hints

A Next.js API route (`app/api/hint/route.ts`) calls Azure OpenAI + Azure Speech REST API directly. No Flask middleman, no cold start.

### 3. Hint buffer chain

Pre-recorded Bree audio fills the wait while GPT generates a hint in the background. If GPT is fast, the hint plays seamlessly. If slow, Bree "thinks out loud." If it fails entirely, the correct word is shown and the child types it.

## Technical Approach

### Architecture

```
BEFORE:
  All audio → Flask (F1 cold start) → Azure APIs → back

AFTER:
  Words/phrases:  public/audio/*.mp3 → Vercel CDN → instant
  GPT hints:      /api/hint → Azure OpenAI + Azure Speech REST → MP3
  Buffer chain:   public/audio/buffer-*.mp3 → Vercel CDN → instant
```

### Azure Speech REST API (replaces Python SDK)

The Python `azure.cognitiveservices.speech` SDK cannot run on Vercel. Use the REST API instead:

```typescript
// POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
// Headers:
//   Ocp-Apim-Subscription-Key: <key>
//   Content-Type: application/ssml+xml
//   X-Microsoft-OutputFormat: audio-16khz-32kbitrate-mono-mp3
// Body: SSML
// Response: raw MP3 bytes
```

### Azure OpenAI from Node.js

Use the `openai` npm package with `AzureOpenAI` class — same package the Flask backend uses in Python. Environment variables match the existing Flask config pattern.

### Hint Buffer Chain Flow

```
User submits wrong answer
  ├─ Fire POST /api/hint immediately → store Promise in ref
  │
  ├─ Play buffer-1.mp3: "Hmmm, I'll think of a good hint for you." (slow, -30%)
  │     └─ buffer-1 ends → wait 1s → check hintPromise:
  │          ├─ Resolved with audio → play hint directly
  │          └─ Pending →
  │               Play buffer-2.mp3: "I'm working on a good idea..." (slow, -30%)
  │                    └─ buffer-2 ends → wait 1s → check:
  │                         ├─ Resolved → play buffer-4a.mp3 → play hint
  │                         └─ Pending →
  │                              Play buffer-3.mp3: "Hmm, this is a tricky one..." (slow, -30%)
  │                                   └─ buffer-3 ends → wait 1s → check:
  │                                        ├─ Resolved → play buffer-4a.mp3 → play hint
  │                                        └─ Pending/failed →
  │                                             Play buffer-4b.mp3 → show word → forced typing
```

**Key rules:**
- If hint arrives DURING a buffer line playing (not during a 1s wait), finish the current line first, then skip ahead. Never interrupt Bree mid-sentence.
- 4a ("Okay, here's what I'm thinking.") only plays after buffer 2 or 3. After buffer 1, the hint plays directly since Bree already said she'd think of a hint.
- 4a plays immediately (no 1s pause).
- Buffer lines 1, 2, 3 at slow rate (-30%). Lines 4a, 4b at normal rate (0%).
- If the /api/hint request errors (non-200), treat as failed immediately — jump to wherever we are in the chain and let it reach 4b.

**After 4b (give up):**
- Display the correct word prominently above the input
- Child must type the word correctly to continue
- No celebration, no attempt count increment
- Brief Bree audio "Now you've got it!" when typed correctly, then next word

### Static Audio Files

```
public/audio/
├── words/
│   ├── drew.mp3              # Each word from lib/words.ts
│   ├── suit.mp3
│   └── ...
├── phrases/
│   ├── level-1.mp3           # "Level 1."
│   ├── level-2.mp3           # "Level 2."  (etc.)
│   ├── spell-the-word.mp3    # "Please spell the word..."
│   ├── correct.mp3           # "Great job! You spelled the word correctly."
│   ├── correct-level-up.mp3  # "Great job! You spelled it correctly. Moving on to the next level."
│   ├── completed.mp3         # "Congratulations! You finished all the levels! Amazing job!"
│   └── now-you-got-it.mp3    # "Now you've got it!" (after forced typing)
├── buffer/
│   ├── buffer-1.mp3          # "Hmmm, I'll think of a good hint for you."
│   ├── buffer-2.mp3          # "I'm working on a good idea for how to explain this."
│   ├── buffer-3.mp3          # "Hmm, this is a tricky one even for me!"
│   ├── buffer-4a.mp3         # "Okay, here's what I'm thinking."
│   └── buffer-4b.mp3         # "You know what, let me just show you this one. We'll get it next time!"
```

All generated with Azure Bree Dragon HD voice (`en-US-Bree:DragonHDLatestNeural`).
Audio format: `audio-16khz-32kbitrate-mono-mp3` (matches current Flask config).
Words and buffer 1-3 at rate `-30%`. Buffer 4a, 4b and `now-you-got-it` at rate `0%`.
Level-up phrase uses generic "next level" (not level number) to avoid generating per-level files — the level number is only needed at game start, which can use `"Level N."` + `spell-the-word.mp3` + word.

### New State: `isInHintChain`

The existing `isPlaying` boolean is insufficient — during the 1-second pauses between buffer lines, no audio is playing but the UI should remain locked. A new `isInHintChain` ref prevents the child from tapping Skip, Say It Again, or submitting during the chain.

### New Game Sub-state: Forced Typing

After buffer 4b, the game enters a sub-state where:
- The correct word is displayed prominently above the input
- The input is enabled for typing
- Submitting anything other than the correct spelling re-shows the word (infinite retry)
- On correct submission: play `now-you-got-it.mp3`, advance to next word
- Skip and Say It Again are disabled
- Does not count as an attempt or affect stats

### Environment Variables (Vercel)

```
# Azure Speech (for /api/hint TTS)
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...

# Azure OpenAI (for /api/hint GPT)
AZURE_OPENAI_ENDPOINT=...       # same as AZURE_OPENAI_ENDPOINT_5 in Flask
AZURE_OPENAI_KEY=...            # same as AZURE_API_KEY_5 in Flask
AZURE_OPENAI_API_VERSION=...    # same as AZURE_OPENAI_API_VERSION_5 in Flask
AZURE_OPENAI_DEPLOYMENT=...     # same as AZURE_OPENAI_DEPLOYMENT_NAME_5 in Flask
```

### What Gets Removed

- `NEXT_PUBLIC_API_BASE` env var and `API_BASE` in `lib/config.ts` — no more Flask dependency
- Keepalive health ping in `use-audio.ts` — no server to keep warm
- `KEEPALIVE_INTERVAL_MS` constant
- `TTS_TIMEOUT_MS` — static files don't need timeouts
- The entire `fetchAudioBuffer()` helper — replaced by static file loading

### Implementation Phases

#### Phase 1: Audio Generation Script + Static Files

Create a one-time Node.js script that calls Azure Speech REST API to generate all MP3 files and saves them to `public/audio/`.

- [ ] Create `scripts/generate-audio.ts` — reads words from `lib/words.ts`, generates all word + phrase + buffer MP3s via Azure Speech REST API
- [ ] Run the script, commit generated MP3 files to `public/audio/`
- [ ] Verify files play correctly

#### Phase 2: Vercel API Route for Hints

- [ ] Install `openai` npm package (`pnpm add openai`)
- [ ] Create `app/api/hint/route.ts` — POST endpoint that accepts `{misspelling, correct}`, calls Azure OpenAI for teacher feedback, calls Azure Speech REST API for TTS, returns MP3 blob
- [ ] XML-escape GPT output before SSML injection
- [ ] Add env vars to Vercel project settings
- [ ] Test the endpoint returns valid MP3 audio

#### Phase 3: Refactor `use-audio.ts`

Replace the current Flask-dependent audio hook with static file loading and the hint buffer chain.

- [ ] Replace `speak()` — load from `/audio/words/{word}.mp3` and `/audio/phrases/{key}.mp3` instead of calling Flask TTS API
- [ ] Add `playStatic(path)` helper — fetch static MP3, decode, play through AudioContext, return Promise
- [ ] Cache decoded AudioBuffers for static files (same Map pattern, keyed by path)
- [ ] Preload buffer chain MP3s on mount (small files, always needed)
- [ ] Implement `speakHintWithBufferChain(misspelling, correct)` — fires hint fetch, runs buffer chain, checks Promise at each wait point
- [ ] Add `isInHintChain` ref — locks UI during entire chain including 1s pauses
- [ ] Remove Flask-related code: `fetchAudioBuffer()`, keepalive ping, `API_BASE` usage, `TTS_TIMEOUT_MS`
- [ ] Keep iOS AudioContext unlock, visibilitychange resume, safety timeouts — those are still needed

#### Phase 4: Refactor `use-spelling-game.ts`

Update game logic for static audio and the new forced-typing sub-state.

- [ ] Update `startGame()` — play static `level-N.mp3` + `spell-the-word.mp3` + `{word}.mp3` instead of speaking a concatenated sentence
- [ ] Update `checkAnswer()` correct path — play static `correct.mp3` or `correct-level-up.mp3`
- [ ] Update `checkAnswer()` incorrect path — call `speakHintWithBufferChain()` instead of `speakHint()`
- [ ] Add forced-typing sub-state: new `showCorrectWord` state, UI shows word, requires correct typing before advancing
- [ ] Update `sayItAgain()` — play static `{word}.mp3`
- [ ] Update `skip()` — cancel any in-flight hint chain
- [ ] Remove `API_BASE` health ping from `startGame()`

#### Phase 5: Update Config and Cleanup

- [ ] Update `lib/config.ts` — remove `API_BASE`, `TTS_TIMEOUT_MS`, `KEEPALIVE_INTERVAL_MS`. Keep `TTS_RATE`, `CORRECT_TO_LEVEL_UP`. Add `HINT_TIMEOUT_MS = 25000`
- [ ] Update `components/game-board.tsx` — add forced-typing UI (show correct word, different submit behavior), show "Bree is thinking..." during hint chain instead of generic spinner
- [ ] Update `CLAUDE.md` — reflect new architecture (no Flask dependency, static audio, Vercel API route)
- [ ] Verify build passes
- [ ] Test full flow: word audio, correct answer, incorrect answer with hint, incorrect answer with 4b fallback

## Acceptance Criteria

- [ ] Word pronunciation plays instantly from static MP3 (no API call)
- [ ] Game phrases (level, correct, completion) play from static MP3s
- [ ] Wrong answer triggers hint buffer chain with pre-recorded Bree audio filling the wait
- [ ] GPT hint plays seamlessly when it arrives (after buffer 1 directly, after 2/3 with 4a transition)
- [ ] If hint never arrives, buffer 4b plays and correct word is shown for forced typing
- [ ] Child must type word correctly after 4b before advancing
- [ ] UI stays locked (buttons disabled) during entire hint chain including 1s pauses
- [ ] Skip cancels the hint chain and moves to next word
- [ ] /api/hint route works on Vercel (returns MP3 audio from Azure OpenAI + Azure Speech REST)
- [ ] No Flask dependency remains in the frontend codebase
- [ ] iOS/Safari AudioContext handling still works (unlock, visibilitychange, safety timeouts)
- [ ] All buffer lines in Bree voice: 1,2,3 at -30% rate, 4a,4b at 0% rate

## Dependencies & Risks

- **Azure Speech REST API**: Must work from Vercel serverless. Research confirms it does (pure HTTP, no SDK needed).
- **Azure OpenAI**: The `openai` npm package supports `AzureOpenAI` class. Same API as Flask's Python `openai` package.
- **Env vars on Vercel**: David needs to copy Azure credentials to Vercel project settings.
- **MP3 file size in git**: ~20 words + ~10 phrases + 5 buffer lines ≈ 35 small MP3 files. At ~5-10KB each, total ~200-350KB. Fine for git.
- **Voice name**: `en-US-Bree:DragonHDLatestNeural` — must verify this exact name works with the REST API (the SDK and REST API may use slightly different voice identifiers).

## References

- Brainstorm: `docs/brainstorms/2026-02-26-audio-architecture-overhaul-brainstorm.md`
- Previous plan: `docs/plans/2026-02-25-refactor-spelling-bee-rewrite-plan.md`
- Current audio hook: `hooks/use-audio.ts`
- Current game hook: `hooks/use-spelling-game.ts`
- Word list: `lib/words.ts`
- Flask backend (reference only): `../gratitude-flask/speller.py`
- Azure Speech REST API: `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`
