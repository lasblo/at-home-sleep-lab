import { useRef, useEffect, useCallback } from 'react'

const TIMELINE_HEIGHT = 140
const PADDING = { top: 10, bottom: 30, left: 50, right: 36 }

const styles = {
  container: {
    height: TIMELINE_HEIGHT,
    minHeight: TIMELINE_HEIGHT,
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    position: 'relative',
    cursor: 'crosshair',
    userSelect: 'none',
  },
  legend: {
    position: 'absolute',
    top: 4,
    right: 8,
    display: 'flex',
    gap: 12,
    fontSize: 11,
    color: 'var(--text-dim)',
    pointerEvents: 'none',
  },
  dot: (color) => ({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    marginRight: 4,
    verticalAlign: 'middle',
  }),
}

function formatTimeAxis(sec) {
  const m = Math.floor(sec / 60)
  return `${m}m`
}

export default function Timeline({ motionSignal, events, videoDuration, onSeek, currentTime, hrData, videoStartEpoch }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const isDraggingRef = useRef(false)
  const displayTimeRef = useRef(0)

  // Keep displayTime in sync with currentTime prop when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      displayTimeRef.current = currentTime || 0
    }
  }, [currentTime])

  const xToTime = useCallback((clientX) => {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const plotW = rect.width - PADDING.left - PADDING.right
    const t = ((x - PADDING.left) / plotW) * videoDuration
    return Math.max(0, Math.min(t, videoDuration))
  }, [videoDuration])

  const handleMouseDown = useCallback((e) => {
    isDraggingRef.current = true
    const t = xToTime(e.clientX)
    displayTimeRef.current = t
    onSeek(t)

    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return
      const t = xToTime(e.clientX)
      displayTimeRef.current = t
      onSeek(t)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [xToTime, onSeek])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const plotW = w - PADDING.left - PADDING.right
    const plotH = h - PADDING.top - PADDING.bottom

    ctx.clearRect(0, 0, w, h)

    const values = motionSignal?.values || []
    const sampleRate = motionSignal?.sample_rate_hz || 10
    if (values.length === 0) return

    const xScale = (t) => PADDING.left + (t / videoDuration) * plotW
    const yScale = (v) => PADDING.top + plotH - v * plotH

    // Draw motion signal as filled area
    ctx.beginPath()
    ctx.moveTo(xScale(0), yScale(0))
    for (let i = 0; i < values.length; i++) {
      const t = i / sampleRate
      ctx.lineTo(xScale(t), yScale(Math.min(values[i], 1)))
    }
    ctx.lineTo(xScale((values.length - 1) / sampleRate), yScale(0))
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()

    // Draw signal line
    ctx.beginPath()
    for (let i = 0; i < values.length; i++) {
      const t = i / sampleRate
      const x = xScale(t)
      const y = yScale(Math.min(values[i], 1))
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 0.5
    ctx.stroke()

    // Draw events — non-PLM first, then PLM on top
    for (const e of (events || []).filter(e => !e.is_plm)) {
      const x = xScale(e.timestamp_sec)
      ctx.beginPath()
      ctx.moveTo(x, PADDING.top + plotH)
      ctx.lineTo(x, PADDING.top + plotH - plotH * 0.4)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
      ctx.stroke()
    }
    for (const e of (events || []).filter(e => e.is_plm)) {
      const x = xScale(e.timestamp_sec)
      ctx.beginPath()
      ctx.moveTo(x, PADDING.top + plotH)
      ctx.lineTo(x, PADDING.top + plotH - plotH * 0.8)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 0.9
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Draw arousal highlight regions (behind HR curve)
    if (events) {
      for (const e of events) {
        if (!e.arousal?.has_arousal) continue
        const startSec = e.timestamp_sec
        const endSec = startSec + (e.arousal.onset_delay_sec || 0) + (e.arousal.duration_sec || 5)
        const x1 = xScale(startSec)
        const x2 = xScale(Math.min(endSec, videoDuration))
        // Red highlight region
        ctx.fillStyle = 'rgba(239, 68, 68, 0.10)'
        ctx.fillRect(x1, PADDING.top, x2 - x1, plotH)
        // Top red accent line
        ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'
        ctx.fillRect(x1, PADDING.top, x2 - x1, 2)
      }
    }

    // Draw HR curve (right Y-axis)
    if (hrData && hrData.length > 0 && videoStartEpoch) {
      const hrMin = Math.min(...hrData.map(r => r.hr))
      const hrMax = Math.max(...hrData.map(r => r.hr))
      const hrRange = Math.max(hrMax - hrMin, 10) // at least 10bpm range
      const hrBottom = Math.max(hrMin - 5, 30)
      const hrTop = hrMax + 5

      // HR Y-axis labels (right side)
      ctx.fillStyle = 'rgba(236, 72, 153, 0.5)'
      ctx.font = '9px ui-monospace, monospace'
      ctx.textAlign = 'left'
      const hrSteps = [hrBottom, Math.round((hrBottom + hrTop) / 2), hrTop]
      for (const val of hrSteps) {
        const y = PADDING.top + plotH * (1 - (val - hrBottom) / (hrTop - hrBottom))
        ctx.fillText(`${val}`, w - PADDING.right + 2, y + 3)
      }

      // Draw HR line
      ctx.beginPath()
      let started = false
      for (const r of hrData) {
        const t = r.epoch - videoStartEpoch
        if (t < 0 || t > videoDuration) continue
        const x = xScale(t)
        const y = PADDING.top + plotH * (1 - (r.hr - hrBottom) / (hrTop - hrBottom))
        if (!started) { ctx.moveTo(x, y); started = true }
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.6)'
      ctx.lineWidth = 1.2
      ctx.stroke()

      // Gradient fill under HR curve
      if (started) {
        const gradient = ctx.createLinearGradient(0, PADDING.top, 0, PADDING.top + plotH)
        gradient.addColorStop(0, 'rgba(236, 72, 153, 0.12)')
        gradient.addColorStop(1, 'rgba(236, 72, 153, 0.02)')
        ctx.lineTo(xScale(hrData[hrData.length - 1].epoch - videoStartEpoch), PADDING.top + plotH)
        ctx.lineTo(xScale(Math.max(0, hrData[0].epoch - videoStartEpoch)), PADDING.top + plotH)
        ctx.closePath()
        ctx.fillStyle = gradient
        ctx.fill()
      }
    }

    // Time axis
    ctx.fillStyle = '#8b8d97'
    ctx.font = '11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    const step = videoDuration > 1800 ? 600 : 300
    for (let t = 0; t <= videoDuration; t += step) {
      const x = xScale(t)
      ctx.fillText(formatTimeAxis(t), x, h - 6)
      ctx.beginPath()
      ctx.moveTo(x, PADDING.top)
      ctx.lineTo(x, PADDING.top + plotH)
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Playhead
    const px = xScale(displayTimeRef.current)
    ctx.beginPath()
    ctx.moveTo(px, PADDING.top)
    ctx.lineTo(px, PADDING.top + plotH)
    ctx.strokeStyle = '#4f8ff7'
    ctx.lineWidth = 2
    ctx.stroke()

    // Playhead time label
    const timeStr = `${Math.floor(displayTimeRef.current / 60)}:${Math.floor(displayTimeRef.current % 60).toString().padStart(2, '0')}`
    ctx.fillStyle = '#4f8ff7'
    ctx.font = '10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(timeStr, Math.max(px, PADDING.left + 15), PADDING.top - 1)
  }, [motionSignal, events, videoDuration, hrData, videoStartEpoch])

  // Animation loop for playhead
  useEffect(() => {
    const tick = () => {
      draw()
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const obs = new ResizeObserver(() => draw())
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [draw])

  return (
    <div style={styles.container}>
      <div style={styles.legend}>
        <span><span style={styles.dot('#ef4444')} />PLM</span>
        <span><span style={styles.dot('#f59e0b')} />Movement</span>
        {hrData && hrData.length > 0 && <span><span style={styles.dot('rgba(236,72,153,0.8)')} />HR</span>}
        {events?.some(e => e.arousal?.has_arousal) && <span><span style={styles.dot('rgba(239,68,68,0.5)')} />Arousal</span>}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
