"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { HINT_TIMEOUT_MS } from "@/lib/config"

// ── Public interface ─────────────────────────────────────────────
export interface UseAudio {
  /** Play a static MP3 from public/audio/. Path relative to /audio/. */
  playStatic: (path: string) => Promise<void>
  /** Play multiple static files in sequence. */
  playSequence: (paths: string[]) => Promise<void>
  /**
   * Run the hint buffer chain: fire GPT hint in background, play buffer
   * lines while waiting, resolve with the hint audio or fall through to 4b.
   */
  speakHint: (
    misspelling: string,
    correct: string,
  ) => Promise<{ hintFailed: boolean }>
  /** Stop all audio and cancel in-flight requests. */
  stop: () => void
  /** Preload a static MP3 into the decoded cache. */
  preload: (path: string) => void
  /** Whether audio is currently playing. */
  isPlaying: boolean
  /** Whether the hint buffer chain is running (locks UI). */
  isInHintChain: boolean
  /** Whether iOS/Safari audio unlock is required. */
  unlockRequired: boolean
  /** Unlock AudioContext with a silent buffer (iOS requirement). */
  unlock: () => Promise<void>
}

// Buffer chain file paths
const BUFFER_1 = "buffer/buffer-1.mp3"
const BUFFER_2 = "buffer/buffer-2.mp3"
const BUFFER_3 = "buffer/buffer-3.mp3"
const BUFFER_4A = "buffer/buffer-4a.mp3"
const BUFFER_4B = "buffer/buffer-4b.mp3"

const BUFFER_PAUSE_MS = 1000

export function useAudio(): UseAudio {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isInHintChain, setIsInHintChain] = useState(false)
  const [unlockRequired, setUnlockRequired] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintAbortRef = useRef<AbortController | null>(null)
  const chainAbortedRef = useRef(false)
  const audioCache = useRef<Map<string, AudioBuffer>>(new Map())

  // Detect iOS/Safari on mount
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    if (isIOS || isSafari) {
      setUnlockRequired(true)
    }
  }, [])

  // Resume AudioContext when app returns from background (iOS suspends it)
  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        audioContextRef.current?.state === "suspended"
      ) {
        audioContextRef.current.resume().catch(console.error)
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [])

  // Close AudioContext on unmount
  useEffect(() => {
    return () => {
      audioContextRef.current?.close()
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current)
    }
  }, [])

  // Preload buffer chain files on mount so they're ready instantly
  useEffect(() => {
    const paths = [BUFFER_1, BUFFER_2, BUFFER_3, BUFFER_4A, BUFFER_4B]
    for (const p of paths) preloadPath(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getOrCreateContext(): AudioContext {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)()
    }
    return audioContextRef.current
  }

  // ── Core: load and decode a static MP3 ─────────────────────────
  async function loadAudioBuffer(path: string): Promise<AudioBuffer> {
    const cached = audioCache.current.get(path)
    if (cached) return cached

    const res = await fetch(`/audio/${path}`)
    if (!res.ok) throw new Error(`Failed to load /audio/${path}: ${res.status}`)
    const raw = await res.arrayBuffer()
    const ctx = getOrCreateContext()
    const decoded = await ctx.decodeAudioData(raw)
    audioCache.current.set(path, decoded)
    return decoded
  }

  // ── Core: play a decoded AudioBuffer, resolve when done ────────
  async function playDecodedBuffer(decoded: AudioBuffer): Promise<void> {
    const ctx = getOrCreateContext()
    if (ctx.state === "suspended") await ctx.resume()

    const source = ctx.createBufferSource()
    source.buffer = decoded
    source.connect(ctx.destination)
    activeSourceRef.current = source

    return new Promise<void>((resolve) => {
      let resolved = false
      const cleanup = () => {
        if (resolved) return
        resolved = true
        activeSourceRef.current = null
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current)
          safetyTimeoutRef.current = null
        }
        resolve()
      }

      source.onended = cleanup

      // Safety timeout: Safari sometimes never fires onended
      safetyTimeoutRef.current = setTimeout(() => {
        try {
          source.stop()
        } catch {
          // Already stopped
        }
        cleanup()
      }, (decoded.duration + 2) * 1000)

      source.start(0)
    })
  }

  // ── Preload into cache (fire and forget) ───────────────────────
  function preloadPath(path: string) {
    if (audioCache.current.has(path)) return
    loadAudioBuffer(path).catch(() => {})
  }

  // ── Stop everything ────────────────────────────────────────────
  const stop = useCallback(() => {
    chainAbortedRef.current = true
    hintAbortRef.current?.abort()
    hintAbortRef.current = null
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
    try {
      activeSourceRef.current?.stop()
    } catch {
      // Already stopped
    }
    activeSourceRef.current = null
    setIsPlaying(false)
    setIsInHintChain(false)
  }, [])

  // ── Unlock (iOS) ───────────────────────────────────────────────
  const unlock = useCallback(async () => {
    const ctx = getOrCreateContext()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
    setUnlockRequired(false)
  }, [])

  // ── Play a single static file ─────────────────────────────────
  const playStatic = useCallback(
    async (path: string): Promise<void> => {
      stop()
      setIsPlaying(true)
      try {
        const decoded = await loadAudioBuffer(path)
        await playDecodedBuffer(decoded)
      } finally {
        setIsPlaying(false)
      }
    },
    [stop],
  )

  // ── Play multiple static files in sequence ─────────────────────
  const playSequence = useCallback(
    async (paths: string[]): Promise<void> => {
      stop()
      chainAbortedRef.current = false
      setIsPlaying(true)
      try {
        for (const path of paths) {
          if (chainAbortedRef.current) break
          const decoded = await loadAudioBuffer(path)
          if (chainAbortedRef.current) break
          await playDecodedBuffer(decoded)
        }
      } finally {
        setIsPlaying(false)
      }
    },
    [stop],
  )

  // ── Hint buffer chain ─────────────────────────────────────────
  const speakHint = useCallback(
    async (
      misspelling: string,
      correct: string,
    ): Promise<{ hintFailed: boolean }> => {
      stop()
      chainAbortedRef.current = false
      setIsPlaying(true)
      setIsInHintChain(true)

      // Fire GPT hint request in background
      const hintController = new AbortController()
      hintAbortRef.current = hintController

      const timeoutId = setTimeout(
        () => hintController.abort(),
        HINT_TIMEOUT_MS,
      )

      let hintAudio: ArrayBuffer | null = null
      let hintFailed = false
      let hintSettled = false

      const hintPromise = fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ misspelling, correct }),
        signal: hintController.signal,
      })
        .then(async (res) => {
          clearTimeout(timeoutId)
          if (!res.ok) {
            hintFailed = true
            return
          }
          const blob = await res.blob()
          const buf = await blob.arrayBuffer()
          if (buf.byteLength === 0) {
            hintFailed = true
            return
          }
          hintAudio = buf
        })
        .catch(() => {
          hintFailed = true
        })
        .finally(() => {
          hintSettled = true
        })

      // Helper: wait ms, resolve early if chain aborted
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          const id = setTimeout(resolve, ms)
          // If chain gets aborted during wait, resolve early
          const check = setInterval(() => {
            if (chainAbortedRef.current) {
              clearTimeout(id)
              clearInterval(check)
              resolve()
            }
          }, 50)
          // Clean up interval when timeout fires naturally
          setTimeout(() => clearInterval(check), ms + 100)
        })

      // Helper: check if hint is ready
      const hintReady = () => hintSettled && hintAudio !== null
      const hintDead = () => hintSettled && hintFailed

      // Helper: play the GPT hint audio
      const playHint = async (): Promise<boolean> => {
        if (!hintAudio || chainAbortedRef.current) return false
        try {
          const ctx = getOrCreateContext()
          if (ctx.state === "suspended") await ctx.resume()
          const decoded = await ctx.decodeAudioData(hintAudio)
          await playDecodedBuffer(decoded)
          return true
        } catch {
          return false
        }
      }

      try {
        // ── Buffer 1 ──────────────────────────────────────────
        if (chainAbortedRef.current) return { hintFailed: true }
        const buf1 = await loadAudioBuffer(BUFFER_1)
        if (chainAbortedRef.current) return { hintFailed: true }
        await playDecodedBuffer(buf1)

        // Wait 1 second, then check
        await wait(BUFFER_PAUSE_MS)
        if (chainAbortedRef.current) return { hintFailed: true }

        if (hintReady()) {
          // Hint arrived quickly — play directly, no transition needed
          const ok = await playHint()
          return { hintFailed: !ok }
        }
        if (hintDead()) {
          // API already failed — skip ahead to 4b
          const buf4b = await loadAudioBuffer(BUFFER_4B)
          await playDecodedBuffer(buf4b)
          return { hintFailed: true }
        }

        // ── Buffer 2 ──────────────────────────────────────────
        if (chainAbortedRef.current) return { hintFailed: true }
        const buf2 = await loadAudioBuffer(BUFFER_2)
        if (chainAbortedRef.current) return { hintFailed: true }
        await playDecodedBuffer(buf2)

        await wait(BUFFER_PAUSE_MS)
        if (chainAbortedRef.current) return { hintFailed: true }

        if (hintReady()) {
          // Play 4a transition then hint
          const buf4a = await loadAudioBuffer(BUFFER_4A)
          await playDecodedBuffer(buf4a)
          const ok = await playHint()
          return { hintFailed: !ok }
        }
        if (hintDead()) {
          const buf4b = await loadAudioBuffer(BUFFER_4B)
          await playDecodedBuffer(buf4b)
          return { hintFailed: true }
        }

        // ── Buffer 3 ──────────────────────────────────────────
        if (chainAbortedRef.current) return { hintFailed: true }
        const buf3 = await loadAudioBuffer(BUFFER_3)
        if (chainAbortedRef.current) return { hintFailed: true }
        await playDecodedBuffer(buf3)

        await wait(BUFFER_PAUSE_MS)
        if (chainAbortedRef.current) return { hintFailed: true }

        if (hintReady()) {
          const buf4a = await loadAudioBuffer(BUFFER_4A)
          await playDecodedBuffer(buf4a)
          const ok = await playHint()
          return { hintFailed: !ok }
        }

        // ── Give up: play 4b ──────────────────────────────────
        // Wait for hint promise to fully settle (or it already has)
        await Promise.race([hintPromise, wait(500)])

        if (hintReady()) {
          const buf4a = await loadAudioBuffer(BUFFER_4A)
          await playDecodedBuffer(buf4a)
          const ok = await playHint()
          return { hintFailed: !ok }
        }

        const buf4b = await loadAudioBuffer(BUFFER_4B)
        if (chainAbortedRef.current) return { hintFailed: true }
        await playDecodedBuffer(buf4b)
        return { hintFailed: true }
      } finally {
        clearTimeout(timeoutId)
        hintAbortRef.current = null
        setIsPlaying(false)
        setIsInHintChain(false)
      }
    },
    [stop],
  )

  // ── Preload (public API) ───────────────────────────────────────
  const preload = useCallback((path: string) => {
    preloadPath(path)
  }, [])

  return {
    playStatic,
    playSequence,
    speakHint,
    stop,
    preload,
    isPlaying,
    isInHintChain,
    unlockRequired,
    unlock,
  }
}
