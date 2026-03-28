import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useVideos } from "./hooks/use-videos"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { ProcessButton } from "@/features/processing/components/process-button"
import { UploadZone } from "./components/upload-zone"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Video, ExternalLink } from "lucide-react"
import { formatClockTime, formatDuration } from "@/shared/lib/utils"

type Filter = "all" | "processed" | "pending"

export default function VideosPage() {
  const navigate = useNavigate()
  const { data: videos, isLoading } = useVideos()
  const { status } = useProcessing()
  const [filter, setFilter] = useState<Filter>("all")

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Videos">
          <ProcessButton />
        </PageHeader>
        <UploadZone />
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
        description={`${videos.length} videos \u00b7 ${processedCount} processed \u00b7 ${pendingCount} pending`}
      >
        <ProcessButton />
      </PageHeader>

      <UploadZone />

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time Range</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((v) => {
              const progress = status?.progress?.[v.id]
              const isVideoProcessing =
                status?.running && progress != null && progress < 1

              return (
                <TableRow
                  key={v.id}
                  className="cursor-pointer"
                  onClick={() =>
                    v.processed
                      ? navigate(`/videos/${v.id}`)
                      : undefined
                  }
                >
                  <TableCell className="font-medium tabular-nums">
                    {formatClockTime(v.start_local)} -{" "}
                    {formatClockTime(v.end_local)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDuration(v.duration_sec / 3600)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.start_local?.slice(0, 10)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {v.id}
                  </TableCell>
                  <TableCell>
                    {v.processed ? (
                      <Badge
                        variant="secondary"
                        className="bg-severity-normal/15 text-severity-normal text-[10px]"
                      >
                        Analyzed
                      </Badge>
                    ) : isVideoProcessing ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          Processing
                        </Badge>
                        {progress != null && (
                          <Progress
                            value={progress * 100}
                            className="h-1 w-20"
                          />
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.processed && (
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
