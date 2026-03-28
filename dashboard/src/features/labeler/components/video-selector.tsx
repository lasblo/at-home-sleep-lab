import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatClockTime } from "@/shared/lib/utils"
import type { VideoInfo, LabelStats } from "@/shared/types/api"

interface VideoSelectorProps {
  videos: VideoInfo[]
  labelStats: LabelStats[]
  selectedId: string | undefined
  onSelect: (videoId: string) => void
}

export function VideoSelector({
  videos,
  labelStats,
  selectedId,
  onSelect,
}: VideoSelectorProps) {
  const statsMap = new Map(labelStats.map((s) => [s.video_id, s]))

  return (
    <Select value={selectedId ?? ""} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a video to label..." />
      </SelectTrigger>
      <SelectContent>
        {videos.map((video) => {
          const stats = statsMap.get(video.id)
          return (
            <SelectItem key={video.id} value={video.id}>
              <div className="flex items-center gap-2">
                <span>
                  {new Date(video.start_local).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  {formatClockTime(video.start_local)} –{" "}
                  {formatClockTime(video.end_local)}
                </span>
                {stats && (
                  <span className="text-xs text-muted-foreground">
                    ({stats.label_count} labels)
                  </span>
                )}
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
