import { useRef, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import type { MotionSignal, SleepEvent, HRReading } from "@/shared/types/api"

const TIMELINE_HEIGHT = 140
const PAD = { top: 10, bottom: 30, left: 50, right: 36 }

interface MotionTimelineProps {
  motionSignal: MotionSignal
  events: SleepEvent[]
  videoDuration: number
  onSeek: (time: number) => void
  currentTime: number
  hrData: HRReading[] | null
  videoStartEpoch: number | null
}

export function MotionTimeline({
  motionSignal,
  events,
  videoDuration,
  onSeek,
  currentTime,
  hrData,
  videoStartEpoch,
}: MotionTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayTimeRef = useRef(currentTime)
  const isDraggingRef = useRef(false)
  const rafRef = useRef<number>(0)

  // Update display time from prop (unless dragging)
  useEffect(() => {
    if (!isDraggingRef.current) {
      displayTimeRef.current = currentTime
    }
  }, [currentTime])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const cw = w - PAD.left - PAD.right
    const ch = h - PAD.top - PAD.bottom

    ctx.clearRect(0, 0, w, h)

    const dur = videoDuration || 1
    const vals = motionSignal.values
    const sampleRate = motionSignal.sample_rate_hz

    // Read theme colors from CSS
    const styles = getComputedStyle(canvas)
    const plmColor = styles.getPropertyValue("--chart-1").trim() || "#ef4444"
    const movColor = styles.getPropertyValue("--chart-2").trim() || "#f59e0b"
    const hrColor = "oklch(0.656 0.241 354)"
    const fgDim = styles.getPropertyValue("--muted-foreground").trim() || "#888"
    const primaryColor = styles.getPropertyValue("--primary").trim() || "#4f8ff7"

    // Motion signal
    if (vals.length > 0) {
      ctx.beginPath()
      ctx.moveTo(PAD.left, PAD.top + ch)
      for (let i = 0; i < vals.length; i++) {
        const t = i / sampleRate
        const x = PAD.left + (t / dur) * cw
        const v = Math.min(vals[i], 1)
        const y = PAD.top + ch * (1 - v)
        ctx.lineTo(x, y)
      }
      ctx.lineTo(
        PAD.left + ((vals.length - 1) / sampleRate / dur) * cw,
        PAD.top + ch
      )
      ctx.closePath()
      ctx.fillStyle = `color-mix(in oklch, ${fgDim}, transparent 85%)`
      ctx.fill()

      ctx.beginPath()
      for (let i = 0; i < vals.length; i++) {
        const t = i / sampleRate
        const x = PAD.left + (t / dur) * cw
        const v = Math.min(vals[i], 1)
        const y = PAD.top + ch * (1 - v)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `color-mix(in oklch, ${fgDim}, transparent 60%)`
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    // Event markers: non-PLM first, then PLM on top
    for (const e of events) {
      if (e.is_plm) continue
      const x = PAD.left + (e.timestamp_sec / dur) * cw
      ctx.strokeStyle = movColor
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, PAD.top + ch * 0.6)
      ctx.lineTo(x, PAD.top + ch)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    for (const e of events) {
      if (!e.is_plm) continue
      const x = PAD.left + (e.timestamp_sec / dur) * cw

      // Arousal highlight
      if (e.arousal?.has_arousal) {
        const startX = x
        const endSec =
          e.timestamp_sec +
          (e.arousal.onset_delay_sec ?? 0) +
          (e.arousal.duration_sec ?? 0)
        const endX = PAD.left + (endSec / dur) * cw
        ctx.fillStyle = `color-mix(in oklch, ${plmColor}, transparent 90%)`
        ctx.fillRect(startX, PAD.top, endX - startX, ch)
        ctx.fillStyle = plmColor
        ctx.fillRect(startX, PAD.top, endX - startX, 2)
      }

      ctx.strokeStyle = plmColor
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(x, PAD.top + ch * 0.2)
      ctx.lineTo(x, PAD.top + ch)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // HR curve
    if (hrData && hrData.length > 0 && videoStartEpoch) {
      const hrs = hrData.map((r) => ({
        t: r.epoch - videoStartEpoch,
        hr: r.hr,
      })).filter((r) => r.t >= 0 && r.t <= dur)

      if (hrs.length > 1) {
        const hrVals = hrs.map((r) => r.hr)
        const minHR = Math.min(...hrVals) - 5
        const maxHR = Math.max(...hrVals) + 5
        const hrRange = Math.max(maxHR - minHR, 10)

        ctx.beginPath()
        hrs.forEach((r, i) => {
          const x = PAD.left + (r.t / dur) * cw
          const y = PAD.top + ch * (1 - (r.hr - minHR) / hrRange)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.strokeStyle = hrColor
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.6
        ctx.stroke()
        ctx.globalAlpha = 1

        // HR Y-axis labels (right side)
        ctx.fillStyle = hrColor
        ctx.font = "9px ui-monospace, monospace"
        ctx.textAlign = "left"
        const steps = [minHR, (minHR + maxHR) / 2, maxHR]
        for (const val of steps) {
          const y = PAD.top + ch * (1 - (val - minHR) / hrRange)
          ctx.fillText(`${Math.round(val)}`, w - PAD.right + 4, y + 3)
        }
      }
    }

    // Time axis
    const interval = dur > 1800 ? 600 : 300
    ctx.fillStyle = fgDim
    ctx.font = "9px ui-monospace, monospace"
    ctx.textAlign = "center"
    for (let t = 0; t <= dur; t += interval) {
      const x = PAD.left + (t / dur) * cw
      const mins = Math.floor(t / 60)
      const secs = Math.floor(t % 60)
      ctx.fillText(
        `${mins}:${secs.toString().padStart(2, "0")}`,
        x,
        h - 6
      )
      ctx.strokeStyle = `color-mix(in oklch, ${fgDim}, transparent 85%)`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(x, PAD.top)
      ctx.lineTo(x, PAD.top + ch)
      ctx.stroke()
    }

    // Playhead
    const playX = PAD.left + (displayTimeRef.current / dur) * cw
    ctx.strokeStyle = primaryColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playX, PAD.top)
    ctx.lineTo(playX, PAD.top + ch)
    ctx.stroke()

    // Time label above playhead
    const ct = displayTimeRef.current
    const ctMins = Math.floor(ct / 60)
    const ctSecs = Math.floor(ct % 60)
    ctx.fillStyle = primaryColor
    ctx.font = "bold 9px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.fillText(
      `${ctMins}:${ctSecs.toString().padStart(2, "0")}`,
      playX,
      PAD.top - 2
    )
  }, [motionSignal, events, videoDuration, hrData, videoStartEpoch])

  // Animation loop for playhead
  useEffect(() => {
    const tick = () => {
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  // Click/drag to seek
  const getTimeFromX = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const cw = rect.width - PAD.left - PAD.right
      const frac = Math.max(0, Math.min(1, (x - PAD.left) / cw))
      return frac * videoDuration
    },
    [videoDuration]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true
      const t = getTimeFromX(e.clientX)
      displayTimeRef.current = t
      onSeek(t)

      const handleMove = (me: MouseEvent) => {
        const t2 = getTimeFromX(me.clientX)
        displayTimeRef.current = t2
        onSeek(t2)
      }
      const handleUp = () => {
        isDraggingRef.current = false
        window.removeEventListener("mousemove", handleMove)
        window.removeEventListener("mouseup", handleUp)
      }
      window.addEventListener("mousemove", handleMove)
      window.addEventListener("mouseup", handleUp)
    },
    [getTimeFromX, onSeek]
  )

  return (
    <Card>
      <CardContent className="p-2">
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: TIMELINE_HEIGHT,
            display: "block",
            cursor: "crosshair",
          }}
          onMouseDown={handleMouseDown}
        />
      </CardContent>
    </Card>
  )
}
