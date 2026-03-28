import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatClockTime } from "@/shared/lib/utils"
import type { VideoInfo } from "@/shared/types/api"

interface SegmentListProps {
  videos: VideoInfo[]
  selectedId?: string
  onSelect: (videoId: string) => void
}

export function SegmentList({ videos, selectedId, onSelect }: SegmentListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Video Segments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {videos.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-xs tabular-nums transition-colors",
              "border-l-2 hover:bg-accent/50",
              v.id === selectedId
                ? "border-l-primary bg-accent/30 text-foreground"
                : "border-l-transparent text-muted-foreground"
            )}
          >
            <span>
              {formatClockTime(v.start_local)} - {formatClockTime(v.end_local)}
            </span>
            <span className="text-muted-foreground">
              {(v.duration_sec / 60).toFixed(0)} min
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
