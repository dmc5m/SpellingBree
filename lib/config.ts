// Falls back to production URL if env var is not set.
// Set NEXT_PUBLIC_API_BASE in .env.local for local development.
// MUST use literal process.env access — Next.js inlines at build time.
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://gratitude-web-app4-gsfxc4cpfugcggbt.westus-01.azurewebsites.net"

export const TTS_TIMEOUT_MS = 8000
export const HINT_TIMEOUT_MS = 15000
export const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000
export const TTS_RATE = -30
export const CORRECT_TO_LEVEL_UP = 5
