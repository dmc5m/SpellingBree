---
title: Rewrite SpellingBee App
type: refactor
status: completed
date: 2026-02-25
deepened: 2026-02-25
---

# Rewrite SpellingBee App

## Enhancement Summary

**Deepened on:** 2026-02-25
**Research agents used:** TypeScript reviewer, Performance oracle, Security sentinel, Architecture strategist, Code simplicity reviewer, Frontend races reviewer, Best practices researcher, Framework docs researcher

### Key Improvements
1. Audio engine design hardened with AbortController, playback timeouts, iOS backgrounding recovery, and proper AudioContext cleanup
2. Security fixes identified for the Flask backend (SSML injection, prompt injection, missing auth) — to be addressed separately
3. Simplified architecture: dropped `lib/api.ts` wrapper and `useReducer` in favor of `useState` with grouped state — right-sized for this app's complexity
4. Canvas-based confetti replaces 50 Framer Motion DOM nodes for better performance on kids' devices

### Critical Issues Discovered
- SSML injection vulnerability in Flask backend `/api/tts` (fix before rewrite)
- No auth on speller endpoints (cost exposure as more parents use the app)
- iOS AudioContext suspends when app is backgrounded — must handle `visibilitychange`
- Current `speak()` resolves on audio start, not end — causes race conditions with timers

---

## Overview

Clean rewrite of the SpellingBee app — a kids' spelling game for the UFLI phonics curriculum. Replace the current 500-line monolithic component with a well-structured, maintainable codebase. Keep the same visual design, backend API, and tech stack.

David (owner) is a vibe coder who will never read the code. Claude owns the codebase. Other parents in the class are starting to use the app, so reliability matters.

## Key Product Decisions

- **End state:** When all levels are completed, show a celebration screen with big confetti. Kid stays there until progress is reset.
- **Audio fallback:** If TTS fails after a timeout, show the word as text so the kid can still play.
- **Word lists:** Stored as a simple data file. David brings new words weekly, Claude updates the file.
- **Correct count:** Global running total. Every 5 correct answers = level up (matching current behavior).
- **After wrong answer:** GPT hint plays, then input clears and re-enables. Word is NOT re-spoken automatically — kid taps "Say It Again" if needed.
- **Audio collisions:** Stop any playing audio before starting new audio. No queuing, no overlap.
- **Submit:** Both button tap and Enter key. Button and input disabled while any API call is in flight.
- **Skip:** Free, no consequences. Skipped words can reappear. No effect on correct count.
- **Reset:** Small button in header area (like current design). Confirm dialog protects against accidental taps.
- **Word repetition within a level:** Random selection with replacement. Same word can appear twice in a row — that's fine for practice.

## Proposed Architecture

### File Structure

```
app/
  page.tsx              # Thin shell — picks which screen to show based on phase
  layout.tsx            # Keep as-is (fonts, meta, analytics)
  globals.css           # Keep theme as-is

components/
  splash-screen.tsx     # Loading screen while API wakes
  audio-unlock.tsx      # iOS/Safari audio enable screen
  game-board.tsx        # Main game UI (input, buttons, feedback, stats bar inline)
  celebration.tsx       # "You finished all levels!" screen
  confetti.tsx          # Canvas-based confetti with proper cleanup
  ui/                   # Keep shadcn components as-is

hooks/
  use-spelling-game.ts  # Game state, level progression, persistence
  use-audio.ts          # TTS, caching, iOS unlock, stop/play

lib/
  words.ts              # Word list data + getRandomWord()
  config.ts             # API_BASE from env var, constants
```

### Research Insight: Simplified from original plan

Dropped `lib/api.ts` — two fetch calls don't need an abstraction layer. `AbortController` timeout is inlined in `use-audio.ts`. Dropped `stats-bar.tsx` as a separate file — it's ~30 lines of display JSX that lives inline in `game-board.tsx`. Moved `getRandomWord` into `use-spelling-game.ts` since random selection is game logic, not data logic.

---

### `hooks/use-spelling-game.ts`

Uses grouped `useState` (not `useReducer` — the simplicity reviewer correctly identified that `useReducer` adds ceremony without benefit for this scale).

**State shape:**
```typescript
type GamePhase = 'loading' | 'audio-unlock' | 'splash' | 'playing' | 'completed' | 'error'

interface GameProgress {
  level: number
  correctCount: number
  attempts: number
}

// GamePhase is its own useState
// GameProgress is a grouped useState
// currentWord is its own useState
// lastResult is its own useState with discriminated union:
type LastResult =
  | { kind: 'correct' }
  | { kind: 'incorrect'; hintFailed: boolean }
  | null
```

**Research Insight:** `answer` (input value) does NOT belong in game state — it's local UI state in `game-board.tsx`. `showConfetti` is derived from `lastResult?.kind === 'correct'` with a timer, not stored in state.

**Responsibilities:**
- Initialize from localStorage with defensive parsing (`isFinite` checks, bounds clamping to `[1, maxLevel]`)
- Pick random word from current level
- Check answer, update counts, advance level
- Persist level + correctCount to localStorage via `useEffect` (not inline — must be pure)
- Detect completion (level exceeds max level)
- Reset progress (calls `audio.stop()` first)
- Skip word (calls `audio.stop()` first)

**Research Insight: localStorage parsing must be bulletproof:**
```typescript
function loadProgress(): { level: number; correctCount: number } {
  try {
    const level = parseInt(localStorage.getItem('level') ?? '', 10)
    const correctCount = parseInt(localStorage.getItem('correctCount') ?? '', 10)
    const maxLevel = getMaxLevel()
    return {
      level: isFinite(level) && level >= 1 && level <= maxLevel ? level : 1,
      correctCount: isFinite(correctCount) && correctCount >= 0 ? correctCount : 0,
    }
  } catch {
    return { level: 1, correctCount: 0 }
  }
}
```

**Research Insight: Valid phase transitions (enforced in state setters):**
```
loading → audio-unlock (iOS/Safari detected)
loading → splash (non-iOS)
audio-unlock → splash (after unlock succeeds)
splash → playing (after API wake)
splash → error (API wake failed after timeout)
playing → playing (next word, level up, skip)
playing → completed (max level exceeded)
completed → loading (reset)
error → splash (retry)
```

---

### `hooks/use-audio.ts`

The most complex piece — audio lifecycle, iOS workarounds, caching, and cleanup all live here.

**Interface:**
```typescript
interface UseAudio {
  speak: (text: string) => Promise<void>   // resolves when audio ENDS, not starts
  stop: () => void                          // stops playback AND aborts in-flight fetch
  prefetch: (text: string) => void          // fire-and-forget
  isPlaying: boolean
  unlockRequired: boolean
  unlock: () => Promise<void>
  startKeepalive: () => () => void          // returns cleanup function
}
```

**Critical implementation details (from race condition + performance reviews):**

1. **Cache decoded `AudioBuffer`, not raw `ArrayBuffer`:**
```typescript
const audioCache = useRef<Map<string, AudioBuffer>>(new Map())
```
This eliminates per-playback `.slice(0)` copies and re-decoding.

2. **Track active source for `stop()`:**
```typescript
const activeSourceRef = useRef<AudioBufferSourceNode | null>(null)
const currentAbortRef = useRef<AbortController | null>(null)

function stop() {
  currentAbortRef.current?.abort()  // cancel in-flight fetch
  try { activeSourceRef.current?.stop() } catch {}
  activeSourceRef.current = null
}
```

3. **`speak()` must return a Promise that resolves when audio ENDS:**
```typescript
async function speak(text: string): Promise<void> {
  stop()  // always stop previous audio first
  const controller = new AbortController()
  currentAbortRef.current = controller

  // ... fetch with signal: controller.signal ...
  // ... decode ...

  return new Promise((resolve) => {
    source.onended = () => {
      activeSourceRef.current = null
      setIsPlaying(false)
      resolve()
    }
    source.start(0)
    // Safety timeout in case onended never fires (known Safari bug)
    setTimeout(() => { try { source.stop() } catch {}; resolve() },
      (buffer.duration + 2) * 1000)
  })
}
```

4. **Guard with a ref, not React state (stale closure fix):**
```typescript
const isSpeakingRef = useRef(false)
// Check isSpeakingRef.current, not the isPlaying state value
```

5. **Handle iOS backgrounding — AudioContext suspends when app is backgrounded:**
```typescript
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(console.error)
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [])
```

6. **AudioContext unlock must `await resume()` before transitioning phase:**
```typescript
async function unlock() {
  const ctx = new AudioContext()
  // Play silent buffer (required for iOS)
  const buf = ctx.createBuffer(1, 1, 22050)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start(0)
  if (ctx.state === 'suspended') {
    await ctx.resume()  // MUST await before phase transition
  }
  audioContextRef.current = ctx
}
```

7. **Close AudioContext on unmount:**
```typescript
useEffect(() => {
  return () => { audioContextRef.current?.close() }
}, [])
```

8. **Abort in-flight prefetches on unmount:**
```typescript
const inflightPrefetches = useRef(new Set<AbortController>())
// ... in cleanup: for (const ctrl of inflightPrefetches.current) ctrl.abort()
```

9. **Keep-alive ping gated on tab visibility:**
```typescript
function startKeepalive() {
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetch(`${API_BASE}/health`).catch(() => {})
    }
  }, 5 * 60 * 1000)
  return () => clearInterval(interval)
}
```

10. **All audio routes through `speak()` — including GPT hint responses.** The wrong-answer path must NOT create `new Audio()` directly. The hint endpoint returns audio data; pass it through the same AudioContext pipeline.

---

### `lib/words.ts`

```typescript
// Simple structure — easy for Claude to update when David brings new words
const WORDS = {
  1: ["drew", "suit", "true", "threw", "bruise", "grew"],
  2: ["fruit", "flew", "glue", "blue", "new"],
  3: ["month", "few", "continue", "newborn"],
  4: ["fruity", "suited", "cute", "sidewalk"],
} as const satisfies Record<number, readonly string[]>

export function getMaxLevel(): number {
  return Object.keys(WORDS).length
}

export function getRandomWord(level: number): string {
  const levelWords = WORDS[level as keyof typeof WORDS]
  if (!levelWords) return WORDS[1][0]  // fallback safety
  return levelWords[Math.floor(Math.random() * levelWords.length)]
}
```

**Research Insight:** Use `as const satisfies Record<number, readonly string[]>` for type safety without losing the literal key types.

### `lib/config.ts`

```typescript
// Falls back to production URL if env var is not set.
// Set NEXT_PUBLIC_API_BASE in .env.local for local development.
// MUST use literal process.env access — Next.js inlines at build time.
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://gratitude-web-app4-gsfxc4cpfugcggbt.westus-01.azurewebsites.net"
```

**Research Insight:** Use `??` not `||` — empty string `""` is a valid (if broken) env value that `||` would fall through on. And `NEXT_PUBLIC_*` vars must be accessed with the literal string — dynamic lookups return `undefined`.

### `components/confetti.tsx` — Canvas-Based

```typescript
// Single <canvas> element with requestAnimationFrame
// No Framer Motion, no 50 DOM nodes
// Proper cleanup via cancelAnimationFrame in useEffect return
```

**Research Insight:** 50 `motion.div` particles cause visible frame drops on low-end phones (the target device). A single canvas with `requestAnimationFrame` renders more particles with zero DOM overhead.

### Screen flow in `app/page.tsx`

```
phase === 'loading'       → nothing (brief)
phase === 'audio-unlock'  → <AudioUnlock />
phase === 'splash'        → <SplashScreen />
phase === 'playing'       → <GameBoard />  (stats bar is inline)
phase === 'completed'     → <Celebration />
phase === 'error'         → error UI with retry button
```

### Hook coordination pattern

`page.tsx` calls both hooks and wires them together:
```typescript
const audio = useAudio()
const game = useSpellingGame()

// page.tsx passes audio.speak, audio.stop into game callbacks
// or game actions call audio methods via closures
```

This is the simplest coordination pattern. No third hook, no context provider.

---

### Framer Motion Notes

- Use `mode="wait"` on `AnimatePresence` (not the removed `exitBeforeEnter`)
- `key` prop must change on direct children to trigger exit animations
- Wrap app in `<MotionConfig reducedMotion="user">` to respect OS reduced-motion settings
- Animate only `transform`/`opacity` properties for GPU compositing — avoid `width`/`height` animations

---

## What We Keep As-Is

- `app/layout.tsx` — fonts, PWA meta tags, analytics
- `app/globals.css` — full theme (vibrant kid-friendly palette, iOS scrolling fixes)
- `components/ui/*` — shadcn Button, Card, Input
- `public/*` — manifest, icons, placeholders
- `components.json` — shadcn config
- Visual design — same gradient backgrounds, same color scheme, same feel

## What We Delete

- Current `app/page.tsx` (replaced entirely)
- Current `components/confetti.tsx` (replaced with canvas version)
- `components/theme-provider.tsx` (unused — app doesn't have dark mode toggle)
- `styles/globals.css` (duplicate of app/globals.css)

## Error Handling Strategy

| Scenario | Behavior |
|---|---|
| API wake-up takes >10s | Show "Still loading..." message on splash |
| API wake-up fails entirely | Show "Couldn't connect" + retry button (phase: 'error') |
| TTS fails for a word | Show the word as text after 8s timeout |
| GPT hint fails | Show generic "Not quite — try again!" text + re-enable input |
| localStorage corrupted/missing | Silently reset to level 1 with bounds clamping |
| AudioContext unlock fails | Show retry message on the unlock screen |
| AudioContext suspended after backgrounding | Auto-resume on `visibilitychange` |
| Multiple rapid submits | Input + button disabled; `isSpeakingRef` guards `speak()` |
| Audio playback hangs (onended never fires) | Safety timeout at `duration + 2s` |
| In-flight fetch during skip/reset | AbortController cancels the fetch |

## Security Notes (Backend — Separate Task)

These were discovered during the security review and should be fixed on the Flask backend before the rewrite ships to more parents:

1. **CRITICAL: SSML injection** in `/api/tts` — `text` param is inserted raw into SSML XML. Fix: `xml.sax.saxutils.escape()`.
2. **HIGH: No auth** on speller endpoints — API URL is in the public JS bundle. Consider adding API key + Next.js server-side proxy routes.
3. **HIGH: CORS too broad** — `*.vercel.app` allows any Vercel deployment. Lock to specific subdomain.
4. **HIGH: Prompt injection** — `misspelling` field sent directly to GPT with no validation. Add `re.match(r'^[a-zA-Z\'\- ]{1,50}$')` check.
5. **MEDIUM: Tracebacks in 500 responses** — log server-side only, return generic error to client.

## Acceptance Criteria

- [x] Game loop works: hear word → type → correct/incorrect feedback → next word
- [x] Level progression: every 5 correct → next level with announcement
- [x] Completion screen when all levels finished
- [x] iOS/Safari audio unlock flow works (including after backgrounding)
- [x] Progress persists across sessions via localStorage
- [x] Skip, Say It Again, Reset all work (all call `stop()` first)
- [x] Audio never overlaps (AbortController + source.stop() before every speak)
- [x] Submit disabled during loading (no double-submit)
- [x] Text fallback if TTS fails after timeout
- [x] Generic fallback if GPT hint fails
- [x] API URL configurable via NEXT_PUBLIC_API_BASE env var
- [x] Word lists easy to update (single file, obvious structure)
- [x] Confetti uses canvas, cleans up via cancelAnimationFrame
- [x] Splash screen has timeout + retry for API wake-up
- [x] AudioContext closed on unmount
- [x] In-flight fetches aborted on unmount
- [x] `speak()` promise resolves when audio ends, not when it starts
- [x] Reduced motion respected via MotionConfig

## Implementation Order

1. `lib/config.ts`, `lib/words.ts` — foundation
2. `hooks/use-audio.ts` — audio engine (most complex piece, build carefully)
3. `hooks/use-spelling-game.ts` — game state + persistence
4. `components/splash-screen.tsx`, `components/audio-unlock.tsx` — entry screens
5. `components/game-board.tsx` — main game (includes stats bar inline)
6. `components/confetti.tsx`, `components/celebration.tsx` — celebrations
7. `app/page.tsx` — wire hooks together, render screens by phase
8. Delete old files, test end-to-end on iOS Safari + Chrome
