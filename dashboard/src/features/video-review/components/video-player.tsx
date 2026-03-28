import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Play, Pause } from "lucide-react"
import { formatTime } from "@/shared/lib/utils"
import { PLAYBACK_SPEEDS } from "@/shared/lib/constants"

interface VideoPlayerProps {
  filename: string
  seekTo: number | null
  onTimeUpdate: (time: number) => void
}

export function VideoPlayer({
  filename,
  seekTo,
  onTimeUpdate,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Seek when prop changes
  useEffect(() => {
    if (seekTo != null && videoRef.current) {
      videoRef.current.currentTime = seekTo
    }
  }, [seekTo])

  // Speed changes
  useEffect(() => {
    if (!videoRef.current) return
    try {
      videoRef.current.playbackRate = speed
    } catch {
      videoRef.current.playbackRate = 16
    }
    videoRef.current.muted = speed > 2
  }, [speed])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return

      const v = videoRef.current
      if (!v) return

      if (e.code === "Space") {
        e.preventDefault()
        v.paused ? v.play() : v.pause()
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        v.currentTime = Math.max(0, v.currentTime - 5)
      } else if (e.code === "ArrowRight") {
        e.preventDefault()
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 5)
      } else if (e.code === "ArrowUp") {
        e.preventDefault()
        const idx = PLAYBACK_SPEEDS.indexOf(
          speed as (typeof PLAYBACK_SPEEDS)[number]
        )
        if (idx < PLAYBACK_SPEEDS.length - 1) setSpeed(PLAYBACK_SPEEDS[idx + 1])
      } else if (e.code === "ArrowDown") {
        e.preventDefault()
        const idx = PLAYBACK_SPEEDS.indexOf(
          speed as (typeof PLAYBACK_SPEEDS)[number]
        )
        if (idx > 0) setSpeed(PLAYBACK_SPEEDS[idx - 1])
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [speed])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.paused ? v.play() : v.pause()
  }, [])

  return (
    <div className="flex flex-col gap-0">
      <video
        ref={videoRef}
        src={`/api/videos/${encodeURIComponent(filename)}`}
        className="w-full bg-black"
        style={{ maxHeight: "40vh" }}
        onTimeUpdate={() => {
          const t = videoRef.current?.currentTime ?? 0
          setCurrentTime(t)
          onTimeUpdate(t)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
      />
      <div className="flex items-center gap-3 border-t bg-card px-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          className="size-8"
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="ml-auto">
          <ToggleGroup
            type="single"
            value={speed.toString()}
            onValueChange={(v) => v && setSpeed(Number(v))}
            size="sm"
          >
            {PLAYBACK_SPEEDS.map((s) => (
              <ToggleGroupItem
                key={s}
                value={s.toString()}
                className="text-xs tabular-nums"
              >
                {s}x
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
    </div>
  )
}
