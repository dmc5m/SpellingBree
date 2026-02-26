"use client"

import { motion } from "framer-motion"
import { Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AudioUnlockProps {
  onUnlock: () => void
}

export function AudioUnlock({ onUnlock }: AudioUnlockProps) {
  return (
    <div className="relative z-50 h-screen bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="mb-8"
        >
          <Volume2 className="w-24 h-24 mx-auto text-primary" />
        </motion.div>
        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent mb-4">
          Enable Audio
        </h1>
        <p className="text-lg text-foreground/80 mb-8">
          Tap the button below to enable audio for the spelling game
        </p>
        <Button
          onClick={onUnlock}
          size="lg"
          style={{ pointerEvents: "auto", touchAction: "manipulation" }}
          className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold text-xl px-8 py-6 shadow-lg cursor-pointer"
        >
          <Volume2 className="w-6 h-6 mr-2" />
          Start Game
        </Button>
      </motion.div>
    </div>
  )
}
