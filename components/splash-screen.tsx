"use client"

import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

export function SplashScreen({ slow }: { slow?: boolean }) {
  return (
    <div className="h-screen bg-gradient-to-br from-primary/20 via-background to-secondary/20 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <motion.h1
          className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent mb-4 text-balance"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Spelling Bee
        </motion.h1>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="inline-block"
        >
          <Sparkles className="w-12 h-12 text-accent" />
        </motion.div>
        {slow && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 text-muted-foreground text-sm font-medium"
          >
            Still loading...
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
