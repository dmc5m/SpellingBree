#!/usr/bin/env node
/**
 * Generate all static MP3 audio files using Azure Speech REST API.
 *
 * Usage:
 *   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... node scripts/generate-audio.mjs
 *
 * Or source the Flask .env:
 *   source ../gratitude-flask/.env && node scripts/generate-audio.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_AUDIO = join(__dirname, "..", "public", "audio")

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION

if (!SPEECH_KEY || !SPEECH_REGION) {
  console.error("Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION")
  process.exit(1)
}

const VOICE = "en-US-Bree:DragonHDLatestNeural"
const TTS_URL = `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
const OUTPUT_FORMAT = "audio-16khz-32kbitrate-mono-mp3"

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

async function generateMp3(text, rate = "-30%") {
  const ssml = `<speak version="1.0" xml:lang="en-US">
  <voice name="${VOICE}">
    <prosody rate="${rate}">${escapeXml(text)}</prosody>
  </voice>
</speak>`

  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": SPEECH_KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
      "User-Agent": "SpellingBee-AudioGen",
    },
    body: ssml,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Azure TTS error ${res.status}: ${body}`)
  }

  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) {
    throw new Error(`Azure TTS returned empty audio for: "${text}"`)
  }
  return Buffer.from(buf)
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function generateFile(subdir, filename, text, rate = "-30%") {
  const dir = join(PUBLIC_AUDIO, subdir)
  ensureDir(dir)
  const outPath = join(dir, filename)

  process.stdout.write(`  ${subdir}/${filename} ... `)
  const mp3 = await generateMp3(text, rate)
  writeFileSync(outPath, mp3)
  console.log(`${mp3.byteLength} bytes`)

  // Small delay to avoid Azure rate limits
  await new Promise((r) => setTimeout(r, 300))
}

// ── Word list (must match lib/words.ts) ──────────────────────────
const WORDS = {
  1: ["polar", "nectar", "collar", "author", "harbor", "actor"],
  2: ["factor", "dollar", "wizard", "lizard", "whom"],
}

// ── Phrases ──────────────────────────────────────────────────────
const PHRASES = [
  { file: "spell-the-word.mp3", text: "Please spell the word." },
  { file: "correct.mp3", text: "Great job! You spelled the word correctly." },
  {
    file: "correct-level-up.mp3",
    text: "Great job! You spelled it correctly. Moving on to the next level.",
  },
  {
    file: "completed.mp3",
    text: "Congratulations! You finished all the levels! Amazing job!",
  },
  { file: "now-you-got-it.mp3", text: "Now you've got it!", rate: "0%" },
]

// ── Level announcements ──────────────────────────────────────────
const maxLevel = Object.keys(WORDS).length

// ── Buffer chain lines ───────────────────────────────────────────
const BUFFERS = [
  {
    file: "buffer-1.mp3",
    text: "Hmmm, I'll think of a good hint for you.",
    rate: "-30%",
  },
  {
    file: "buffer-2.mp3",
    text: "I'm working on a good idea for how to explain this.",
    rate: "-30%",
  },
  {
    file: "buffer-3.mp3",
    text: "Hmm, this is a tricky one even for me!",
    rate: "-30%",
  },
  {
    file: "buffer-4a.mp3",
    text: "Okay, here's what I'm thinking.",
    rate: "0%",
  },
  {
    file: "buffer-4b.mp3",
    text: "You know what, let me just show you this one. We'll get it next time!",
    rate: "0%",
  },
]

async function main() {
  console.log("Generating SpellingBee audio files...\n")

  // Words
  console.log("Words:")
  const allWords = Object.values(WORDS).flat()
  for (const word of allWords) {
    await generateFile("words", `${word}.mp3`, word)
  }

  // Level announcements
  console.log("\nLevel announcements:")
  for (let level = 1; level <= maxLevel; level++) {
    await generateFile("phrases", `level-${level}.mp3`, `Level ${level}.`)
  }

  // Phrases
  console.log("\nPhrases:")
  for (const { file, text, rate } of PHRASES) {
    await generateFile("phrases", file, text, rate ?? "-30%")
  }

  // Buffer chain
  console.log("\nBuffer chain:")
  for (const { file, text, rate } of BUFFERS) {
    await generateFile("buffer", file, text, rate)
  }

  console.log("\nDone! Generated audio in public/audio/")
}

main().catch((err) => {
  console.error("\nFailed:", err.message)
  process.exit(1)
})
