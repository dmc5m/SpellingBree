"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { getMaxLevel, getRandomWord } from "@/lib/words"
import { CORRECT_TO_LEVEL_UP } from "@/lib/config"
import type { UseAudio } from "@/hooks/use-audio"

export type GamePhase = "loading" | "audio-unlock" | "splash" | "playing" | "completed" | "error"

export type LastResult =
  | { kind: "correct" }
  | { kind: "incorrect"; hintFailed: boolean }
  | { kind: "show-word"; word: string }
  | null

interface GameProgress {
  level: number
  correctCount: number
  attempts: number
}

function loadProgress(): { level: number; correctCount: number } {
  try {
    const level = parseInt(localStorage.getItem("level") ?? "", 10)
    const correctCount = parseInt(localStorage.getItem("correctCount") ?? "", 10)
    const maxLevel = getMaxLevel()
    return {
      level: isFinite(level) && level >= 1 && level <= maxLevel ? level : 1,
      correctCount: isFinite(correctCount) && correctCount >= 0 ? correctCount : 0,
    }
  } catch {
    return { level: 1, correctCount: 0 }
  }
}

function saveProgress(level: number, correctCount: number) {
  try {
    localStorage.setItem("level", level.toString())
    localStorage.setItem("correctCount", correctCount.toString())
  } catch {
    // localStorage unavailable — silently ignore
  }
}

// ── Audio path helpers ─────────────────────────────────────────
function wordPath(word: string): string {
  return `words/${word}.mp3`
}

function levelPath(level: number): string {
  return `phrases/level-${level}.mp3`
}

export interface UseSpellingGame {
  phase: GamePhase
  progress: GameProgress
  currentWord: string
  lastResult: LastResult
  showConfetti: boolean
  setPhase: (phase: GamePhase) => void
  startGame: (audio: UseAudio) => Promise<void>
  pickWord: (level?: number) => string
  checkAnswer: (answer: string, audio: UseAudio) => Promise<void>
  skip: (audio: UseAudio) => void
  sayItAgain: (audio: UseAudio) => void
  reset: (audio: UseAudio) => void
}

export function useSpellingGame(): UseSpellingGame {
  const [phase, setPhase] = useState<GamePhase>("loading")
  const [progress, setProgress] = useState<GameProgress>(() => {
    const saved = loadProgress()
    return { level: saved.level, correctCount: saved.correctCount, attempts: 0 }
  })
  const [currentWord, setCurrentWord] = useState("")
  const [lastResult, setLastResult] = useState<LastResult>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const confettiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickWordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist to localStorage when level or correctCount changes
  useEffect(() => {
    saveProgress(progress.level, progress.correctCount)
  }, [progress.level, progress.correctCount])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current)
      if (pickWordTimeoutRef.current) clearTimeout(pickWordTimeoutRef.current)
    }
  }, [])

  const pickWord = useCallback((level?: number): string => {
    const lvl = level ?? progress.level
    const word = getRandomWord(lvl)
    setCurrentWord(word)
    setLastResult(null)
    return word
  }, [progress.level])

  /** Speak "Level N" + "Please spell the word" + word */
  async function speakWordPrompt(audio: UseAudio, word: string, level: number) {
    await audio.playSequence([
      levelPath(level),
      "phrases/spell-the-word.mp3",
      wordPath(word),
    ])
  }

  const startGame = useCallback(async (audio: UseAudio) => {
    setPhase("playing")
    const word = pickWord()

    try {
      await speakWordPrompt(audio, word, progress.level)
    } catch {
      // Audio failed — text fallback will show
    }
    // Preload the standalone word for "Say It Again"
    audio.preload(wordPath(word))
  }, [pickWord, progress.level])

  const checkAnswer = useCallback(async (answer: string, audio: UseAudio) => {
    const trimmed = answer.trim().toLowerCase()
    if (!trimmed) return

    // If in "show-word" sub-state, check if they typed the correct word
    if (lastResult?.kind === "show-word") {
      if (trimmed === lastResult.word.toLowerCase()) {
        // Correct! Play encouragement and move to next word
        setLastResult(null)
        try {
          await audio.playStatic("phrases/now-you-got-it.mp3")
        } catch {}

        const nextWord = pickWord()
        try {
          await audio.playSequence([
            "phrases/spell-the-word.mp3",
            wordPath(nextWord),
          ])
        } catch {}
        audio.preload(wordPath(nextWord))
      }
      // If wrong, just stay — they'll see the correct word and try again
      return
    }

    const newAttempts = progress.attempts + 1

    if (trimmed === currentWord.toLowerCase()) {
      // Correct!
      const newCorrect = progress.correctCount + 1
      const maxLevel = getMaxLevel()
      let newLevel = progress.level
      let leveledUp = false

      if (newCorrect % CORRECT_TO_LEVEL_UP === 0 && progress.level < maxLevel) {
        newLevel = progress.level + 1
        leveledUp = true
      } else if (newCorrect % CORRECT_TO_LEVEL_UP === 0 && progress.level >= maxLevel) {
        // Completed all levels!
        setProgress({ level: newLevel, correctCount: newCorrect, attempts: newAttempts })
        setLastResult({ kind: "correct" })
        setShowConfetti(true)

        try {
          await audio.playStatic("phrases/completed.mp3")
        } catch {}

        setPhase("completed")
        return
      }

      setProgress({ level: newLevel, correctCount: newCorrect, attempts: newAttempts })
      setLastResult({ kind: "correct" })
      setShowConfetti(true)

      // Clear any existing timers
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current)
      if (pickWordTimeoutRef.current) clearTimeout(pickWordTimeoutRef.current)

      try {
        if (leveledUp) {
          await audio.playStatic("phrases/correct-level-up.mp3")
        } else {
          await audio.playStatic("phrases/correct.mp3")
        }
      } catch {}

      // After celebration, move to next word
      pickWordTimeoutRef.current = setTimeout(async () => {
        setShowConfetti(false)
        setLastResult(null)
        const nextWord = pickWord(newLevel)

        try {
          await audio.playSequence([
            "phrases/spell-the-word.mp3",
            wordPath(nextWord),
          ])
        } catch {}
        audio.preload(wordPath(nextWord))
      }, 2000)
    } else {
      // Incorrect — run the hint buffer chain
      setProgress((prev) => ({ ...prev, attempts: newAttempts }))
      setLastResult({ kind: "incorrect", hintFailed: false })

      const result = await audio.speakHint(trimmed, currentWord)
      if (result.hintFailed) {
        // Buffer chain ended with 4b — show the word for forced typing
        setLastResult({ kind: "show-word", word: currentWord })
      }
    }
  }, [currentWord, progress, pickWord, lastResult])

  const skip = useCallback((audio: UseAudio) => {
    audio.stop()
    if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current)
    if (pickWordTimeoutRef.current) clearTimeout(pickWordTimeoutRef.current)
    setShowConfetti(false)

    const word = pickWord()
    audio.playSequence([
      "phrases/spell-the-word.mp3",
      wordPath(word),
    ]).catch(() => {})
    audio.preload(wordPath(word))
  }, [pickWord])

  const sayItAgain = useCallback((audio: UseAudio) => {
    audio.stop()
    audio.playStatic(wordPath(currentWord)).catch(() => {})
  }, [currentWord])

  const reset = useCallback((audio: UseAudio) => {
    audio.stop()
    if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current)
    if (pickWordTimeoutRef.current) clearTimeout(pickWordTimeoutRef.current)

    try {
      localStorage.removeItem("level")
      localStorage.removeItem("correctCount")
    } catch {}

    setProgress({ level: 1, correctCount: 0, attempts: 0 })
    setShowConfetti(false)
    setLastResult(null)

    const word = pickWord(1)
    audio.playSequence([
      levelPath(1),
      "phrases/spell-the-word.mp3",
      wordPath(word),
    ]).catch(() => {})
    audio.preload(wordPath(word))
  }, [pickWord])

  return {
    phase,
    progress,
    currentWord,
    lastResult,
    showConfetti,
    setPhase,
    startGame,
    pickWord,
    checkAnswer,
    skip,
    sayItAgain,
    reset,
  }
}
