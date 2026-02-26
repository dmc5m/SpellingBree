"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Volume2, SkipForward, Star, Trophy, Zap, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import Confetti from "@/components/confetti"
import type { LastResult } from "@/hooks/use-spelling-game"

interface GameBoardProps {
  level: number
  correctCount: number
  attempts: number
  currentWord: string
  lastResult: LastResult
  showConfetti: boolean
  isPlaying: boolean
  isInHintChain: boolean
  onSubmit: (answer: string) => void
  onSkip: () => void
  onSayItAgain: () => void
  onReset: () => void
}

export function GameBoard({
  level,
  correctCount,
  attempts,
  currentWord,
  lastResult,
  showConfetti,
  isPlaying,
  isInHintChain,
  onSubmit,
  onSkip,
  onSayItAgain,
  onReset,
}: GameBoardProps) {
  const [answer, setAnswer] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Buttons are locked during audio playback or hint chain
  const buttonsLocked = isPlaying || isInHintChain
  // Input is only locked during playback or hint chain, UNLESS in show-word mode
  const inShowWord = lastResult?.kind === "show-word"
  const inputLocked = inShowWord ? false : buttonsLocked

  // Clear answer when word changes or on correct answer
  useEffect(() => {
    setAnswer("")
    inputRef.current?.focus()
  }, [currentWord])

  // Clear answer after incorrect attempt feedback resolves
  useEffect(() => {
    if (lastResult?.kind === "incorrect") {
      setAnswer("")
    }
  }, [lastResult])

  // Focus input when entering show-word mode
  useEffect(() => {
    if (inShowWord) {
      setAnswer("")
      inputRef.current?.focus()
    }
  }, [inShowWord])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim()) return
    // In show-word mode, always allow submit
    if (!inShowWord && buttonsLocked) return
    onSubmit(answer)
  }

  function handleReset() {
    if (confirm("Are you sure you want to reset your progress? This will take you back to Level 1.")) {
      onReset()
    }
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
          <Button onClick={handleReset} variant="outline" size="sm" className="font-semibold border-2 bg-transparent">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Level
          </Button>
        </motion.div>

        {/* Stats Bar (inline) */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="grid grid-cols-3 gap-4 mb-8"
        >
          <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20">
            <div className="flex items-center gap-2 justify-center">
              <Trophy className="w-6 h-6 text-primary" />
              <div>
                <div className="text-2xl font-bold text-primary">Level {level}</div>
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
                key={inShowWord ? "show-word" : currentWord}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-3 mb-6"
              >
                {inShowWord ? (
                  <>
                    <Sparkles className="w-8 h-8 text-secondary" />
                    <h2 className="text-3xl md:text-4xl font-bold text-foreground">Type It Out!</h2>
                    <Sparkles className="w-8 h-8 text-secondary" />
                  </>
                ) : (
                  <>
                    <Sparkles className="w-8 h-8 text-accent" />
                    <h2 className="text-3xl md:text-4xl font-bold text-foreground">Listen & Spell!</h2>
                    <Sparkles className="w-8 h-8 text-primary" />
                  </>
                )}
              </motion.div>

              {/* Show correct word prominently in forced-typing mode */}
              {inShowWord && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-6 p-4 rounded-2xl bg-secondary/20 border-2 border-secondary"
                >
                  <p className="text-sm font-medium text-foreground/60 mb-1">The word is:</p>
                  <p className="text-4xl md:text-5xl font-black text-secondary tracking-wider">
                    {lastResult.word}
                  </p>
                </motion.div>
              )}

              <div className="flex gap-3 justify-center mb-8">
                <Button
                  onClick={onSayItAgain}
                  disabled={buttonsLocked || inShowWord}
                  size="lg"
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold shadow-lg disabled:opacity-50"
                >
                  {isPlaying && !isInHintChain ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Volume2 className="w-5 h-5 mr-2" />
                  )}
                  Say It Again
                </Button>

                <Button
                  onClick={onSkip}
                  disabled={buttonsLocked || inShowWord}
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
                  ref={inputRef}
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={inputLocked}
                  placeholder={inShowWord ? "Type the word above..." : "Type your answer here..."}
                  className="text-2xl md:text-3xl h-16 md:h-20 text-center font-bold border-4 focus-visible:ring-4 focus-visible:ring-primary/50 disabled:opacity-50"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <Button
                type="submit"
                disabled={(!inShowWord && buttonsLocked) || !answer.trim()}
                size="lg"
                className="w-full h-14 text-xl font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg disabled:opacity-50"
              >
                {isInHintChain ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Bree is thinking...
                  </>
                ) : isPlaying ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Please wait...
                  </>
                ) : inShowWord ? (
                  "Check Spelling"
                ) : (
                  "Check Answer"
                )}
              </Button>
            </form>

            <AnimatePresence mode="wait">
              {lastResult !== null && lastResult.kind !== "show-word" && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: -10 }}
                  className={`mt-6 p-6 rounded-2xl text-center font-bold text-lg ${
                    lastResult.kind === "correct"
                      ? "bg-accent/20 text-accent border-2 border-accent"
                      : "bg-destructive/20 text-destructive border-2 border-destructive"
                  }`}
                >
                  {lastResult.kind === "correct" ? (
                    <div className="flex items-center justify-center gap-2">
                      <Star className="w-6 h-6 fill-current" />
                      <span>Amazing! That&apos;s correct!</span>
                      <Star className="w-6 h-6 fill-current" />
                    </div>
                  ) : isInHintChain ? (
                    <span>Listen to Bree&apos;s hint...</span>
                  ) : lastResult.hintFailed ? (
                    <span>Not quite! Try again!</span>
                  ) : (
                    <span>Not quite! Listen to the hint...</span>
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
