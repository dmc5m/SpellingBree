"use client"

import { useEffect, useCallback } from "react"
import { MotionConfig } from "framer-motion"
import { useAudio } from "@/hooks/use-audio"
import { useSpellingGame } from "@/hooks/use-spelling-game"
import { SplashScreen } from "@/components/splash-screen"
import { AudioUnlock } from "@/components/audio-unlock"
import { GameBoard } from "@/components/game-board"
import { Celebration } from "@/components/celebration"
import { Button } from "@/components/ui/button"
import { RotateCcw } from "lucide-react"

export default function SpellingBee() {
  const audio = useAudio()
  const game = useSpellingGame()

  // On mount: detect phase and initialize
  useEffect(() => {
    if (audio.unlockRequired) {
      game.setPhase("audio-unlock")
    } else {
      game.setPhase("splash")
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When phase transitions to splash, start the game
  useEffect(() => {
    if (game.phase === "splash") {
      game.startGame(audio)
    }
  }, [game.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnlock = useCallback(async () => {
    await audio.unlock()
    game.setPhase("splash")
  }, [audio, game])

  const handleSubmit = useCallback((answer: string) => {
    game.checkAnswer(answer, audio)
  }, [audio, game])

  const handleSkip = useCallback(() => {
    game.skip(audio)
  }, [audio, game])

  const handleSayItAgain = useCallback(() => {
    game.sayItAgain(audio)
  }, [audio, game])

  const handleReset = useCallback(() => {
    game.reset(audio)
    game.setPhase("playing")
  }, [audio, game])

  const handleResetFromCelebration = useCallback(() => {
    game.reset(audio)
    game.setPhase("playing")
  }, [audio, game])

  const handleRetry = useCallback(() => {
    game.setPhase("splash")
  }, [game])

  return (
    <MotionConfig reducedMotion="user">
      {game.phase === "loading" && null}

      {game.phase === "audio-unlock" && (
        <AudioUnlock onUnlock={handleUnlock} />
      )}

      {game.phase === "splash" && (
        <SplashScreen />
      )}

      {game.phase === "playing" && (
        <GameBoard
          level={game.progress.level}
          correctCount={game.progress.correctCount}
          attempts={game.progress.attempts}
          currentWord={game.currentWord}
          lastResult={game.lastResult}
          showConfetti={game.showConfetti}
          isPlaying={audio.isPlaying}
          isInHintChain={audio.isInHintChain}
          onSubmit={handleSubmit}
          onSkip={handleSkip}
          onSayItAgain={handleSayItAgain}
          onReset={handleReset}
        />
      )}

      {game.phase === "completed" && (
        <Celebration
          correctCount={game.progress.correctCount}
          attempts={game.progress.attempts}
          onReset={handleResetFromCelebration}
        />
      )}

      {game.phase === "error" && (
        <div className="h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <h1 className="text-3xl font-black text-foreground mb-4">
              Couldn&apos;t Connect
            </h1>
            <p className="text-foreground/60 mb-8">
              Having trouble reaching the server. Check your internet connection and try again.
            </p>
            <Button
              onClick={handleRetry}
              size="lg"
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold text-xl px-8 py-6 shadow-lg"
            >
              <RotateCcw className="w-6 h-6 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      )}
    </MotionConfig>
  )
}
