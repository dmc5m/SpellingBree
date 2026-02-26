"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { getMaxLevel, getRandomWord } from "@/lib/words"
import { API_BASE } from "@/lib/config"
import { CORRECT_TO_LEVEL_UP } from "@/lib/config"
import type { UseAudio } from "@/hooks/use-audio"

export type GamePhase = "loading" | "audio-unlock" | "splash" | "playing" | "completed" | "error"

export type LastResult =
  | { kind: "correct" }
  | { kind: "incorrect"; hintFailed: boolean }
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
    // localStorage unavailable (e.g. private browsing) — silently ignore
  }
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

  const startGame = useCallback(async (audio: UseAudio) => {
    // Wake the API
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      await fetch(`${API_BASE}/health`, { signal: controller.signal })
      clearTimeout(timeoutId)
    } catch {
      setPhase("error")
      return
    }

    setPhase("playing")
    const word = pickWord()

    // Speak the word, then prefetch standalone word audio
    try {
      await audio.speak(`Level ${progress.level}. Please spell the word... ${word}`)
    } catch {
      // TTS failed on first word — game still starts, text fallback will show
    }
    audio.prefetch(word)
  }, [pickWord, progress.level])

  const checkAnswer = useCallback(async (answer: string, audio: UseAudio) => {
    const trimmed = answer.trim().toLowerCase()
    if (!trimmed) return

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
          await audio.speak("Congratulations! You finished all the levels! Amazing job!")
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
          await audio.speak(`Great job! You spelled it correctly. Moving on to level ${newLevel}.`)
        } else {
          await audio.speak("Great job! You spelled the word correctly.")
        }
      } catch {}

      // After celebration, move to next word
      pickWordTimeoutRef.current = setTimeout(async () => {
        setShowConfetti(false)
        setLastResult(null)
        const nextWord = pickWord(newLevel)

        try {
          await audio.speak(`Please spell the word... ${nextWord}`)
        } catch {}
        audio.prefetch(nextWord)
      }, 2000)
    } else {
      // Incorrect
      setProgress((prev) => ({ ...prev, attempts: newAttempts }))
      setLastResult({ kind: "incorrect", hintFailed: false })

      const result = await audio.speakHint(trimmed, currentWord)
      if (result.hintFailed) {
        setLastResult({ kind: "incorrect", hintFailed: true })
      }
    }
  }, [currentWord, progress, pickWord])

  const skip = useCallback((audio: UseAudio) => {
    audio.stop()
    if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current)
    if (pickWordTimeoutRef.current) clearTimeout(pickWordTimeoutRef.current)
    setShowConfetti(false)

    const word = pickWord()
    // Fire and forget — don't await so the UI updates immediately
    audio.speak(`Please spell the word... ${word}`).catch(() => {})
    audio.prefetch(word)
  }, [pickWord])

  const sayItAgain = useCallback((audio: UseAudio) => {
    audio.stop()
    audio.speak(currentWord).catch(() => {})
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
    audio.speak(`Level 1. Please spell the word... ${word}`).catch(() => {})
    audio.prefetch(word)
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
