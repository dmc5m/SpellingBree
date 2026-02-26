"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { API_BASE, TTS_RATE, TTS_TIMEOUT_MS, HINT_TIMEOUT_MS, KEEPALIVE_INTERVAL_MS } from "@/lib/config"

export interface UseAudio {
  speak: (text: string) => Promise<void>
  speakHint: (misspelling: string, correct: string) => Promise<{ hintFailed: boolean }>
  stop: () => void
  prefetch: (text: string) => void
  isPlaying: boolean
  unlockRequired: boolean
  unlock: () => Promise<void>
}

export function useAudio(): UseAudio {
  const [isPlaying, setIsPlaying] = useState(false)
  const [unlockRequired, setUnlockRequired] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const currentAbortRef = useRef<AbortController | null>(null)
  const isSpeakingRef = useRef(false)
  const audioCache = useRef<Map<string, AudioBuffer>>(new Map())
  const inflightPrefetches = useRef(new Set<AbortController>())
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (document.visibilityState === "visible" && audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume().catch(console.error)
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [])

  // Close AudioContext and abort all in-flight fetches on unmount
  useEffect(() => {
    return () => {
      audioContextRef.current?.close()
      for (const ctrl of inflightPrefetches.current) ctrl.abort()
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current)
    }
  }, [])

  // Keep-alive ping gated on tab visibility
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetch(`${API_BASE}/health`, { mode: "no-cors" }).catch(() => {})
      }
    }, KEEPALIVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  function getOrCreateContext(): AudioContext {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return audioContextRef.current
  }

  const unlock = useCallback(async () => {
    const ctx = getOrCreateContext()
    // Play silent buffer — required for iOS
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

  const stop = useCallback(() => {
    currentAbortRef.current?.abort()
    currentAbortRef.current = null
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
    try {
      activeSourceRef.current?.stop()
    } catch {
      // Already stopped — fine
    }
    activeSourceRef.current = null
    isSpeakingRef.current = false
    setIsPlaying(false)
  }, [])

  async function fetchAudioBuffer(url: string, timeoutMs: number, signal: AbortSignal): Promise<ArrayBuffer | null> {
    const timeoutId = setTimeout(() => {
      if (!signal.aborted) currentAbortRef.current?.abort()
    }, timeoutMs)

    try {
      const res = await fetch(url, { signal })
      clearTimeout(timeoutId)
      if (!res.ok) return null
      const blob = await res.blob()
      return blob.arrayBuffer()
    } catch (err) {
      clearTimeout(timeoutId)
      if ((err as Error).name === "AbortError") return null
      return null
    }
  }

  async function playBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    const ctx = getOrCreateContext()
    if (ctx.state === "suspended") {
      await ctx.resume()
    }

    const decoded = await ctx.decodeAudioData(arrayBuffer)
    const source = ctx.createBufferSource()
    source.buffer = decoded
    source.connect(ctx.destination)
    activeSourceRef.current = source

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        activeSourceRef.current = null
        isSpeakingRef.current = false
        setIsPlaying(false)
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

  const speak = useCallback(async (text: string): Promise<void> => {
    stop()
    isSpeakingRef.current = true
    setIsPlaying(true)

    try {
      // Check cache first
      const cached = audioCache.current.get(text)
      if (cached) {
        const ctx = getOrCreateContext()
        if (ctx.state === "suspended") await ctx.resume()
        const source = ctx.createBufferSource()
        source.buffer = cached
        source.connect(ctx.destination)
        activeSourceRef.current = source

        return await new Promise<void>((resolve) => {
          const cleanup = () => {
            activeSourceRef.current = null
            isSpeakingRef.current = false
            setIsPlaying(false)
            if (safetyTimeoutRef.current) {
              clearTimeout(safetyTimeoutRef.current)
              safetyTimeoutRef.current = null
            }
            resolve()
          }
          source.onended = cleanup
          safetyTimeoutRef.current = setTimeout(() => {
            try { source.stop() } catch {}
            cleanup()
          }, (cached.duration + 2) * 1000)
          source.start(0)
        })
      }

      // Fetch from TTS API
      const controller = new AbortController()
      currentAbortRef.current = controller
      const params = new URLSearchParams({ text, rate: TTS_RATE.toString() })
      const raw = await fetchAudioBuffer(`${API_BASE}/api/tts?${params}`, TTS_TIMEOUT_MS, controller.signal)

      if (!raw) {
        throw new Error("TTS fetch failed")
      }

      // Decode and cache
      const ctx = getOrCreateContext()
      if (ctx.state === "suspended") await ctx.resume()
      const decoded = await ctx.decodeAudioData(raw)
      audioCache.current.set(text, decoded)

      // Play through AudioContext
      const source = ctx.createBufferSource()
      source.buffer = decoded
      source.connect(ctx.destination)
      activeSourceRef.current = source

      return await new Promise<void>((resolve) => {
        const cleanup = () => {
          activeSourceRef.current = null
          isSpeakingRef.current = false
          setIsPlaying(false)
          if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current)
            safetyTimeoutRef.current = null
          }
          resolve()
        }
        source.onended = cleanup
        safetyTimeoutRef.current = setTimeout(() => {
          try { source.stop() } catch {}
          cleanup()
        }, (decoded.duration + 2) * 1000)
        source.start(0)
      })
    } catch (err) {
      isSpeakingRef.current = false
      setIsPlaying(false)
      throw err
    }
  }, [stop])

  const speakHint = useCallback(async (misspelling: string, correct: string): Promise<{ hintFailed: boolean }> => {
    stop()
    isSpeakingRef.current = true
    setIsPlaying(true)

    const controller = new AbortController()
    currentAbortRef.current = controller

    const timeoutId = setTimeout(() => controller.abort(), HINT_TIMEOUT_MS)

    try {
      const res = await fetch(`${API_BASE}/api/speller-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ misspelling, correct, rate: TTS_RATE }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        isSpeakingRef.current = false
        setIsPlaying(false)
        return { hintFailed: true }
      }

      const blob = await res.blob()
      const arrayBuffer = await blob.arrayBuffer()
      await playBuffer(arrayBuffer)
      return { hintFailed: false }
    } catch {
      clearTimeout(timeoutId)
      isSpeakingRef.current = false
      setIsPlaying(false)
      return { hintFailed: true }
    }
  }, [stop])

  const prefetch = useCallback((text: string) => {
    if (audioCache.current.has(text)) return

    const controller = new AbortController()
    inflightPrefetches.current.add(controller)

    const params = new URLSearchParams({ text, rate: TTS_RATE.toString() })
    fetch(`${API_BASE}/api/tts?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return
        const blob = await res.blob()
        const raw = await blob.arrayBuffer()
        const ctx = getOrCreateContext()
        const decoded = await ctx.decodeAudioData(raw)
        audioCache.current.set(text, decoded)
      })
      .catch(() => {})
      .finally(() => inflightPrefetches.current.delete(controller))
  }, [])

  return { speak, speakHint, stop, prefetch, isPlaying, unlockRequired, unlock }
}
