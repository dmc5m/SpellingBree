"use client"

import { motion } from "framer-motion"
import { Trophy, Star, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import Confetti from "@/components/confetti"

interface CelebrationProps {
  correctCount: number
  attempts: number
  onReset: () => void
}

export function Celebration({ correctCount, attempts, onReset }: CelebrationProps) {
  function handleReset() {
    if (confirm("Start over from Level 1?")) {
      onReset()
    }
  }

  return (
    <main className="h-screen overflow-y-auto bg-gradient-to-br from-accent/20 via-background to-primary/20 flex items-center justify-center p-4">
      <Confetti />

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, type: "spring" }}
        className="text-center max-w-lg"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="mb-6"
        >
          <Trophy className="w-24 h-24 mx-auto text-accent" />
        </motion.div>

        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-secondary mb-4 text-balance">
          You Did It!
        </h1>

        <p className="text-xl text-foreground/80 mb-2">
          You completed all the levels!
        </p>

        <div className="flex items-center justify-center gap-6 mb-8 text-foreground/60">
          <div className="flex items-center gap-1">
            <Star className="w-5 h-5 text-accent fill-accent" />
            <span className="font-bold">{correctCount} correct</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold">{attempts} total tries</span>
          </div>
        </div>

        <Button
          onClick={handleReset}
          size="lg"
          className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold text-xl px-8 py-6 shadow-lg"
        >
          <RotateCcw className="w-6 h-6 mr-2" />
          Play Again
        </Button>
      </motion.div>
    </main>
  )
}
