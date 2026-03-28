import { useState } from "react"
import { useVideos } from "./hooks/use-videos"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { ProcessButton } from "@/features/processing/components/process-button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Video } from "lucide-react"
import { formatClockTime, formatDuration } from "@/shared/lib/utils"

type Filter = "all" | "processed" | "pending"

export default function VideosPage() {
  const { data: videos, isLoading } = useVideos()
  const { status } = useProcessing()
  const [filter, setFilter] = useState<Filter>("all")

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Videos">
          <ProcessButton />
        </PageHeader>
        <Empty className="min-h-[400px]">
          <EmptyMedia variant="icon">
            <Video />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No videos found</EmptyTitle>
            <EmptyDescription>
              Add MP4 files to the videos/ directory.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const filtered = videos.filter((v) => {
    if (filter === "processed") return v.processed
    if (filter === "pending") return !v.processed
    return true
  })

  const processedCount = videos.filter((v) => v.processed).length
  const pendingCount = videos.length - processedCount

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Videos"
        description={`${videos.length} videos (${processedCount} processed, ${pendingCount} pending)`}
      >
        <ProcessButton />
      </PageHeader>

      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => v && setFilter(v as Filter)}
        size="sm"
      >
        <ToggleGroupItem value="all">All ({videos.length})</ToggleGroupItem>
        <ToggleGroupItem value="processed">
          Processed ({processedCount})
        </ToggleGroupItem>
        <ToggleGroupItem value="pending">
          Pending ({pendingCount})
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((v) => {
          const progress = status?.progress?.[v.id]
          const isVideoProcessing =
            status?.running && progress != null && progress < 1

          return (
            <Card key={v.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs tabular-nums truncate">
                    {formatClockTime(v.start_local)} -{" "}
                    {formatClockTime(v.end_local)}
                  </CardTitle>
                  {v.processed ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Processed
                    </Badge>
                  ) : isVideoProcessing ? (
                    <Badge className="text-[10px]">
                      Processing
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Pending
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDuration(v.duration_sec / 3600)}</span>
                  <span className="truncate text-[10px]">{v.id}</span>
                </div>
                {isVideoProcessing && progress != null && (
                  <Progress
                    value={progress * 100}
                    className="mt-2 h-1"
                  />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
