# Audio Architecture Overhaul Brainstorm

**Date:** 2026-02-26
**Status:** Approved

## What We're Building

A complete overhaul of the audio and API architecture for SpellingBee. The current chain (browser → Flask on Azure F1 free tier → Azure Speech TTS → browser) is unreliable — cold starts of 20-30 seconds, ~75% stall rate on first load, and hint audio for misspelled words consistently fails (empty responses from SSML escaping issues, GPT parameter incompatibilities, compound failure modes from chaining GPT + TTS in a single request).

The new architecture eliminates the Flask middleman for word pronunciation entirely and introduces a "buffer chain" pattern for GPT-powered hints that turns API latency into conversational personality.

## Why This Approach

- **Flask on F1 is the bottleneck.** Free-tier Azure Web App cold-starts in 20-30s, blocks a single worker thread during TTS synthesis, and chains two Azure API calls (GPT + Speech) in one blocking request.
- **Word lists are small and known in advance.** There are ~20 words per week. Pre-generating audio for all of them eliminates API calls entirely for the core game loop.
- **The app sunsets in ~4 months.** Over-engineering is the enemy. Static files + one API route is the simplest possible architecture.
- **Latency can become personality.** Instead of hiding buffering behind a spinner, pre-recorded Bree audio fills the wait while GPT thinks.

## Key Decisions

### 1. Pre-generated static audio for all known content

All word pronunciations, game phrases ("Please spell the word...", "Great job!", "Level 2"), and hint buffer lines are pre-generated as MP3 files using Azure Bree Dragon HD voice. Served from Vercel's CDN — instant, zero latency, zero API calls.

- **Words**: All entries from `lib/words.ts`, regenerated when David brings new words
- **Game phrases**: Level announcements, correct/incorrect stingers, completion celebration
- **Buffer lines** (see below): The 5 pre-recorded hint flow lines
- **Speech rate**: -30% for buffer lines 1, 2, 3. Normal (0%) for 4a and 4b.

### 2. Vercel API route replaces Flask for hints

A Next.js API route (serverless or edge) calls Azure OpenAI + Azure Speech directly. Eliminates Flask cold starts entirely. The Flask backend continues serving other apps (gratitude, quests) but SpellingBee no longer depends on it.

### 3. Hint buffer chain — latency as personality

When the user misspells a word, pre-recorded Bree audio fills the wait while GPT generates a hint in the background. The flow:

```
User submits wrong answer
  ├─ Fire GPT hint request immediately (background)
  │
  ├─ Play 1: "Hmmm, I'll think of a good hint for you." (slow rate)
  │     └─ 1 ends → wait 1s → check for hint audio:
  │          ├─ Arrived → Play hint directly (no transition needed)
  │          └─ Not arrived →
  │               Play 2: "I'm working on a good idea for how to explain this." (slow rate)
  │                    └─ 2 ends → wait 1s → check:
  │                         ├─ Arrived → Play 4a immediately → then play hint
  │                         └─ Not arrived →
  │                              Play 3: "Hmm, this is a tricky one even for me!" (slow rate)
  │                                   └─ 3 ends → wait 1s → check:
  │                                        ├─ Arrived → Play 4a immediately → then play hint
  │                                        └─ Not arrived →
  │                                             Play 4b → show word on screen → kid must type it
```

**Buffer lines:**
1. "Hmmm, I'll think of a good hint for you." (slow, -30%)
2. "I'm working on a good idea for how to explain this." (slow, -30%)
3. "Hmm, this is a tricky one even for me!" (slow, -30%)
4a. "Okay, here's what I'm thinking." (normal rate, 0%) — transition into hint, only after 2 or 3
4b. "You know what, let me just show you this one. We'll get it next time!" (normal rate, 0%) — give up

**Timing rules:**
- After each buffer line (1, 2, 3): wait 1 second, then check if hint audio has arrived
- 4a plays immediately (no extra pause) when hint arrives after 2 or 3
- 4b triggers only after 3's pause — total buffer time is roughly 15-20 seconds before giving up

**After 4b (give up):**
- Display the correct spelling on screen
- Kid must type the word correctly before moving to the next word
- This reinforces learning even when the hint fails

**Note on GPT hint content:** The API typically returns something like "Oooh, nice try! See the two O's in a row? That's called a vowel team..." — it has its own conversational opener, so after buffer 1 the hint flows naturally without a transition line. After buffer 2 or 3, the "Okay, here's what I'm thinking" (4a) bridges the longer wait.

### 4. Everything in Bree's voice

All pre-generated audio uses the Azure Bree Dragon HD voice. No browser speechSynthesis fallback — consistent personality throughout.

### 5. Flask stays for other apps

The Flask backend on Azure continues serving gratitude, quests, and email_scan. SpellingBee simply stops calling it. No changes needed to the Flask codebase.

## Architecture Summary

```
BEFORE:
  Browser → Flask (F1, cold start) → Azure OpenAI → Azure Speech → Flask → Browser

AFTER:
  Word audio:    Browser → Vercel CDN (static MP3s) — instant
  Game phrases:  Browser → Vercel CDN (static MP3s) — instant
  Hint buffer:   Browser → Vercel CDN (static MP3s) — instant
  GPT hints:     Browser → Vercel API route → Azure OpenAI + Azure Speech → Browser
```

## Open Questions

None — proceeding to planning.
