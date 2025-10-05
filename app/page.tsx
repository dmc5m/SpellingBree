"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Volume2, SkipForward, Star, Trophy, Zap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import Confetti from "@/components/confetti"

const levels = {
  1: ["cat", "dog", "sun", "hat"],
  2: ["apple", "green", "chair", "cloud"],
  3: ["simple", "castle", "wonder", "puzzle"],
}

const API_BASE = "https://gratitude-web-app4-gsfxc4cpfugcggbt.westus-01.azurewebsites.net"

export default function SpellingBee() {
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [currentLevel, setCurrentLevel] = useState(1)
  const [correctCount, setCorrectCount] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [currentWord, setCurrentWord] = useState("")
  const [answer, setAnswer] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)

  const rate = -15

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const audioUnlocked = localStorage.getItem("audioUnlocked")

    console.log("[v0] iOS:", isIOS, "Safari:", isSafari, "Audio unlocked:", audioUnlocked)

    if ((isIOS || isSafari) && !audioUnlocked) {
      console.log("[v0] Showing audio unlock screen")
      setNeedsAudioUnlock(true)
      setShowSplash(false)
      return
    }

    const savedLevel = localStorage.getItem("level")
    const savedCorrect = localStorage.getItem("correctCount")
    const levelToUse = savedLevel ? Number.parseInt(savedLevel) : 1
    const correctToUse = savedCorrect ? Number.parseInt(savedCorrect) : 0

    if (savedLevel) setCurrentLevel(levelToUse)
    if (savedCorrect) setCorrectCount(correctToUse)

    console.log("[v0] Initializing with level:", levelToUse, "correct:", correctToUse)

    const init = async () => {
      await wakeApi()
      setTimeout(() => {
        setShowSplash(false)
        pickWord(levelToUse)
      }, 3000)
    }
    init()
  }, [])

  async function unlockAudio() {
    console.log("[v0] unlockAudio called!")
    try {
      console.log("[v0] Creating audio element...")
      const audio = new Audio()
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
      console.log("[v0] Playing audio...")
      await audio.play()
      console.log("[v0] Audio played successfully")

      localStorage.setItem("audioUnlocked", "true")
      console.log("[v0] Set audioUnlocked in localStorage")

      setNeedsAudioUnlock(false)
      setShowSplash(true)

      const savedLevel = localStorage.getItem("level")
      const savedCorrect = localStorage.getItem("correctCount")
      const levelToUse = savedLevel ? Number.parseInt(savedLevel) : 1
      const correctToUse = savedCorrect ? Number.parseInt(savedCorrect) : 0

      if (savedLevel) setCurrentLevel(levelToUse)
      if (savedCorrect) setCorrectCount(correctToUse)

      const init = async () => {
        await wakeApi()
        setTimeout(() => {
          setShowSplash(false)
          pickWord(levelToUse)
        }, 3000)
      }
      init()
    } catch (err) {
      console.error("[v0] Error unlocking audio:", err)
    }
  }

  async function wakeApi() {
    try {
      await fetch(`${API_BASE}/health`)
    } catch (e) {
      console.error("Error waking API:", e)
    }
  }

  async function speak(text: string) {
    if (isLoading) return
    setIsLoading(true)
    const params = new URLSearchParams({ text, rate: rate.toString() })
    try {
      const res = await fetch(`${API_BASE}/api/tts?${params.toString()}`, { method: "GET" })
      if (!res.ok) {
        console.error("TTS error:", await res.text())
        setIsLoading(false)
        return
      }
      const blob = await res.blob()
      const audio = new Audio(URL.createObjectURL(blob))
      audio.play()
      audio.onended = () => {
        setIsLoading(false)
      }
      audio.onerror = () => {
        setIsLoading(false)
      }
    } catch (err) {
      console.error("Error:", err)
      setIsLoading(false)
    }
  }

  function pickWord(level?: number) {
    const levelToUse = level ?? currentLevel
    console.log("[v0] Picking word for level:", levelToUse)
    const words = levels[levelToUse as keyof typeof levels]
    const word = words[Math.floor(Math.random() * words.length)]
    console.log("[v0] Selected word:", word, "from level", levelToUse)
    setCurrentWord(word)
    setAnswer("")
    setIsCorrect(null)
    setFeedback("")
    speak(`Level ${levelToUse}. Please spell the word... ${word}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim() || isLoading) return

    const newAttempts = attempts + 1
    setAttempts(newAttempts)
    const userAnswer = answer.trim().toLowerCase()

    console.log("[v0] Checking answer:", userAnswer, "against:", currentWord)

    if (userAnswer === currentWord.toLowerCase()) {
      const newCorrect = correctCount + 1
      setCorrectCount(newCorrect)
      setIsCorrect(true)
      setShowConfetti(true)
      localStorage.setItem("correctCount", newCorrect.toString())
      localStorage.setItem("level", currentLevel.toString())

      console.log("[v0] Correct! New count:", newCorrect, "Current level:", currentLevel)

      await speak(`Great job! You spelled the word correctly.`)

      if (newCorrect % 5 === 0 && currentLevel < Object.keys(levels).length) {
        const newLevel = currentLevel + 1
        console.log("[v0] Leveling up to:", newLevel)
        setCurrentLevel(newLevel)
        localStorage.setItem("level", newLevel.toString())
        await speak(`Excellent! Moving on to level ${newLevel}.`)
      }

      setTimeout(() => {
        setShowConfetti(false)
        pickWord()
      }, 2000)
    } else {
      setIsCorrect(false)
      setIsLoading(true)
      try {
        const payload = { misspelling: userAnswer, correct: currentWord, rate }
        const res = await fetch(`${API_BASE}/api/speller-voice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const blob = await res.blob()
          const audio = new Audio(URL.createObjectURL(blob))
          audio.play()
          audio.onended = () => {
            setIsLoading(false)
          }
          audio.onerror = () => {
            setIsLoading(false)
          }
        } else {
          setIsLoading(false)
        }
      } catch (err) {
        console.error("Error:", err)
        setIsLoading(false)
      }
    }
  }

  if (needsAudioUnlock) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          padding: "20px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          <Volume2 style={{ width: "80px", height: "80px", margin: "0 auto 20px", color: "white" }} />
          <h1 style={{ fontSize: "36px", fontWeight: "bold", color: "white", marginBottom: "20px" }}>Enable Audio</h1>
          <p style={{ fontSize: "18px", color: "rgba(255,255,255,0.9)", marginBottom: "30px" }}>
            Tap the button below to start
          </p>
          <button
            onClick={(e) => {
              console.log("[v0] Button onClick fired!")
              e.preventDefault()
              unlockAudio()
            }}
            onTouchStart={(e) => {
              console.log("[v0] Button onTouchStart fired!")
              e.preventDefault()
              unlockAudio()
            }}
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              padding: "20px 40px",
              backgroundColor: "#48bb78",
              color: "white",
              border: "none",
              borderRadius: "12px",
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              userSelect: "none",
            }}
          >
            Start Game
          </button>
        </div>
      </div>
    )
  }

  if (showSplash) {
    return (
      <div className="h-screen bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <motion.h1
            className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent mb-4 text-balance"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
          >
            Spelling Bee!!!!!
          </motion.h1>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            className="inline-block"
          >
            <Sparkles className="w-12 h-12 text-accent" />
          </motion.div>
        </motion.div>
      </div>
    )
  }

  return (
    <main className="h-screen overflow-y-auto bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4 md:p-8">
      {showConfetti && <Confetti />}

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center mb-8">
          <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent mb-4 text-balance">
            Spelling Bee
          </h1>
        </motion.div>

        {/* Stats Bar */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="grid grid-cols-3 gap-4 mb-8"
        >
          <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20">
            <div className="flex items-center gap-2 justify-center">
              <Trophy className="w-6 h-6 text-primary" />
              <div>
                <div className="text-2xl font-bold text-primary">Level {currentLevel}</div>
                <div className="text-xs text-foreground/60 font-medium">Current Level</div>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-accent/10 to-accent/5 border-2 border-accent/20">
            <div className="flex items-center gap-2 justify-center">
              <Star className="w-6 h-6 text-accent fill-accent" />
              <div>
                <div className="text-2xl font-bold text-accent">{correctCount}</div>
                <div className="text-xs text-foreground/60 font-medium">Correct</div>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-secondary/10 to-secondary/5 border-2 border-secondary/20">
            <div className="flex items-center gap-2 justify-center">
              <Zap className="w-6 h-6 text-secondary" />
              <div>
                <div className="text-2xl font-bold text-secondary">{attempts}</div>
                <div className="text-xs text-foreground/60 font-medium">Total Tries</div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Main Game Card */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card className="p-8 md:p-12 bg-card/80 backdrop-blur-sm border-2 shadow-2xl">
            <div className="text-center mb-8">
              <motion.div
                key={currentWord}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-3 mb-6"
              >
                <Sparkles className="w-8 h-8 text-accent" />
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Listen & Spell!</h2>
                <Sparkles className="w-8 h-8 text-primary" />
              </motion.div>

              <div className="flex gap-3 justify-center mb-8">
                <Button
                  onClick={() => speak(currentWord)}
                  disabled={isLoading}
                  size="lg"
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold shadow-lg disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Volume2 className="w-5 h-5 mr-2" />}
                  Say It Again
                </Button>

                <Button
                  onClick={pickWord}
                  disabled={isLoading}
                  variant="outline"
                  size="lg"
                  className="font-bold border-2 bg-transparent disabled:opacity-50"
                >
                  <SkipForward className="w-5 h-5 mr-2" />
                  Skip
                </Button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="relative">
                <Input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={isLoading}
                  placeholder="Type your answer here..."
                  className="text-2xl md:text-3xl h-16 md:h-20 text-center font-bold border-4 focus-visible:ring-4 focus-visible:ring-primary/50 disabled:opacity-50"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || !answer.trim()}
                size="lg"
                className="w-full h-14 text-xl font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Please wait...
                  </>
                ) : (
                  "Check Answer"
                )}
              </Button>
            </form>

            <AnimatePresence mode="wait">
              {isCorrect !== null && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: -10 }}
                  className={`mt-6 p-6 rounded-2xl text-center font-bold text-lg ${
                    isCorrect
                      ? "bg-accent/20 text-accent border-2 border-accent"
                      : "bg-destructive/20 text-destructive border-2 border-destructive"
                  }`}
                >
                  {isCorrect ? (
                    <div className="flex items-center justify-center gap-2">
                      <Star className="w-6 h-6 fill-current" />
                      <span>Amazing! That's correct!</span>
                      <Star className="w-6 h-6 fill-current" />
                    </div>
                  ) : (
                    <span>Not quite! Try again!</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mt-8 text-muted-foreground"
        >
          <p className="text-sm font-medium">Keep practicing to level up!</p>
        </motion.div>
      </div>
    </main>
  )
}
