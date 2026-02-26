"use client"

import { useEffect, useRef } from "react"

const COLORS = ["#f43f5e", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"]
const PARTICLE_COUNT = 80
const GRAVITY = 0.12
const DRAG = 0.98

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
}

function createParticles(width: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 2 + 1,
    size: Math.random() * 6 + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 8,
  }))
}

export default function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Size canvas to viewport
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    particlesRef.current = createParticles(canvas.width)

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      let alive = 0
      for (const p of particlesRef.current) {
        p.vy += GRAVITY
        p.vx *= DRAG
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotationSpeed

        if (p.y > canvas.height + 20) continue
        alive++

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      }

      if (alive > 0) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      aria-hidden="true"
    />
  )
}
