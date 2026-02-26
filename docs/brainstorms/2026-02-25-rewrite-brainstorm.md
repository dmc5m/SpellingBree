# SpellingBee Rewrite Brainstorm

**Date:** 2026-02-25
**Status:** Approved

## What We're Building

A clean rewrite of the SpellingBee app — a kids' spelling game aligned with the UFLI (University of Florida Literacy Institute) phonics curriculum. The app speaks a word aloud, the kid types the spelling, and gets immediate spoken feedback. Weekly word/pattern sets follow UFLI's structured progression.

The owner (David) is a vibe coder who will never look at the code directly. Claude owns the codebase going forward.

## Why Rewrite (Not Refactor)

The existing prototype is a 500-line monolithic component with:
- Game logic, audio management, and UI tangled together
- Duplicate initialization paths (useEffect + unlockAudio)
- 11 independent useState calls with implicit dependencies
- Hardcoded word lists and API URL
- No error handling for API failures
- Untestable structure

A rewrite is faster than untangling this for an app this simple.

## Key Decisions

- **Keep the existing Flask backend** — API contract stays the same, performance tuning is a separate task
- **Keep the visual design** — vibrant kid-friendly palette (coral/pink, sky blue, green), same UI feel
- **Keep the tech stack** — Next.js 15, React 19, Tailwind v4, Framer Motion, shadcn/ui, pnpm
- **Keep PWA setup** — manifest, icons, iOS meta tags
- **Separate concerns into hooks** — `useSpellingGame` (game state, progression, persistence) and `useAudio` (TTS, caching, iOS unlock)
- **Small focused components** — SplashScreen, AudioUnlock, GameBoard, FeedbackDisplay, StatsBar
- **Word lists as data files** — easy to swap weekly, not hardcoded in the component
- **API URL via environment variable** — no more hardcoding

## What UFLI Is

University of Florida Literacy Institute. K-3 phonics curriculum. Introduces one spelling pattern per lesson in a structured 12-group progression (CVC → digraphs → CVCe → r-controlled vowels → vowel teams → etc). Weekly pattern sets with associated word lists. Free resources at ufli.education.ufl.edu.

## Open Questions

None — proceeding to planning.
