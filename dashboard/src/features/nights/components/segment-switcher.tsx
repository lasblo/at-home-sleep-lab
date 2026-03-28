import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatClockTime } from "@/shared/lib/utils"
import type { VideoInfo } from "@/shared/types/api"

interface SegmentSwitcherProps {
  videos: VideoInfo[]
  selectedId: string
  onSelect: (videoId: string) => void
}

export function SegmentSwitcher({
  videos,
  selectedId,
  onSelect,
}: SegmentSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={selectedId}
      onValueChange={(v) => v && onSelect(v)}
      size="sm"
      className="flex-wrap justify-start"
    >
      {videos.map((v) => (
        <ToggleGroupItem key={v.id} value={v.id} className="tabular-nums text-xs">
          {formatClockTime(v.start_local)}-{formatClockTime(v.end_local)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
