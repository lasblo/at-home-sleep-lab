import { useRef, useEffect } from 'react'

const HEIGHT = 20

export default function Sparkline({ values, sampleRate }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !values || values.length === 0) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height

    ctx.clearRect(0, 0, w, h)

    // Downsample to ~1 point per pixel
    const step = Math.max(1, Math.floor(values.length / w))
    const maxVal = Math.max(...values.filter(v => v < 1)) || 1 // ignore normalized spikes at 1.0

    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let i = 0; i < values.length; i += step) {
      const x = (i / values.length) * w
      const y = h - (Math.min(values[i], maxVal) / maxVal) * h * 0.9
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(79, 143, 247, 0.2)'
    ctx.fill()

    ctx.beginPath()
    for (let i = 0; i < values.length; i += step) {
      const x = (i / values.length) * w
      const y = h - (Math.min(values[i], maxVal) / maxVal) * h * 0.9
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.strokeStyle = 'rgba(79, 143, 247, 0.5)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }, [values, sampleRate])

  if (!values || values.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: HEIGHT, display: 'block', marginTop: 4 }}
    />
  )
}
