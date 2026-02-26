# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Install dependencies:** `pnpm install`
- **Dev server:** `pnpm next dev`
- **Build:** `pnpm next build`
- **Type check:** `pnpm next lint` (note: ESLint and TypeScript errors are ignored during builds via next.config.mjs)

No test framework is configured.

## Architecture

SpellingBee is a **kids' spelling game** for the UFLI phonics curriculum, built as a Next.js 15 app (React 19, Tailwind CSS v4, Framer Motion). It's a PWA targeting iOS/Safari with careful audio handling.

### File structure

- `lib/config.ts` — API base URL (env var), timeouts, constants
- `lib/words.ts` — Weekly UFLI word lists by level. **Update this file when David brings new words.**
- `hooks/use-audio.ts` — Audio engine: AudioContext management, iOS unlock, TTS speak/stop/prefetch, decoded AudioBuffer cache, keepalive ping
- `hooks/use-spelling-game.ts` — Game state: phase machine, level progression, localStorage persistence, answer checking
- `components/game-board.tsx` — Main game UI (stats bar, input, buttons, feedback)
- `components/splash-screen.tsx` — Loading screen while API wakes
- `components/audio-unlock.tsx` — iOS/Safari audio enable screen
- `components/celebration.tsx` — Completion screen after all levels
- `components/confetti.tsx` — Canvas-based confetti with requestAnimationFrame
- `app/page.tsx` — Thin shell that wires hooks together and renders screens by GamePhase

### Game phases

`loading` → `audio-unlock` (iOS) or `splash` → `playing` → `completed`. Error state available at `splash` → `error` with retry.

### Backend dependency

The app calls a **separate Flask API** hosted on Azure (source in `../gratitude-flask/speller.py`):

- `GET /api/tts?text=...&rate=...` — Azure Speech TTS using "Bree Dragon HD" voice, returns MP3
- `POST /api/speller-voice` — GPT-generated teacher hints on wrong answers, returned as audio
- `GET /health` — Kept warm with a 5-minute ping interval

API base URL is configured via `NEXT_PUBLIC_API_BASE` env var (falls back to production URL).

### Audio design

- Single shared AudioContext, reused across the session
- All audio routes through `speak()` — including GPT hint responses
- Decoded AudioBuffers cached in a Map (no eviction needed, word lists are small)
- AbortController on every fetch; `stop()` cancels in-flight requests and playing audio
- `speak()` returns a Promise that resolves when audio **ends**, not starts
- Safety timeout on playback in case Safari's `onended` never fires
- `visibilitychange` handler resumes AudioContext after iOS backgrounding
- AudioContext closed on unmount; all in-flight prefetches aborted

### Key conventions

- **Package manager:** pnpm
- **Path aliases:** `@/*` maps to project root
- **UI components:** shadcn/ui in `components/ui/` (Button, Card, Input)
- **Styling:** Tailwind v4 with CSS custom properties (vibrant kid-friendly palette in `app/globals.css`)
- **Owner:** David is a vibe coder who never reads code. Claude owns this codebase.
