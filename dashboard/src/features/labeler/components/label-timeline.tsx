import { useRef } from "react"
import type { Label } from "@/shared/types/api"
import { CATEGORIES } from "../categories"

interface LabelTimelineProps {
  labels: Label[]
  duration: number
  currentTime: number
  onSeek: (time: number) => void
  onSelect: (label: Label) => void
  selectedId: number | null
}

export function LabelTimeline({
  labels,
  duration,
  currentTime,
  onSeek,
  onSelect,
  selectedId,
}: LabelTimelineProps) {
  const barRef = useRef<HTMLDivElement>(null)

  const handleClick = (e: React.MouseEvent) => {
    if (!barRef.current || duration <= 0) return
    const rect = barRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(duration, pct * duration)))
  }

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Labels Timeline</span>
        <span>{labels.length} labels</span>
      </div>
      <div
        ref={barRef}
        className="relative h-10 cursor-crosshair rounded-md border bg-muted/30"
        onClick={handleClick}
      >
        {/* Label markers */}
        {labels.map((label) => {
          const leftPct = (label.timestamp_sec / duration) * 100
          const widthPct = Math.max(
            0.3,
            (label.duration_sec / duration) * 100,
          )
          const cat = CATEGORIES.find((c) => c.key === label.category)
          const isSelected = label.id === selectedId
          return (
            <div
              key={label.id}
              className="absolute top-1 bottom-1 rounded-sm transition-opacity hover:opacity-80"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                minWidth: 4,
                backgroundColor: cat?.color ?? "#888",
                opacity: isSelected ? 1 : 0.7,
                outline: isSelected
                  ? "2px solid var(--color-foreground)"
                  : undefined,
                outlineOffset: 1,
                zIndex: isSelected ? 10 : 1,
              }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(label)
              }}
              title={`${cat?.label ?? label.category} @ ${label.timestamp_sec.toFixed(1)}s`}
            />
          )
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground"
          style={{ left: `${playheadPct}%`, zIndex: 20 }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {CATEGORIES.map((cat) => {
          const count = labels.filter((l) => l.category === cat.key).length
          if (count === 0) return null
          return (
            <div key={cat.key} className="flex items-center gap-1">
              <div
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-muted-foreground">
                {cat.label} ({count})
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
