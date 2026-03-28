import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { formatDate, formatClockTime, formatDuration } from "@/shared/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import type { Night } from "@/shared/types/api"
import type { ProcessingStatus } from "@/shared/types/api"

interface NightCardProps {
  night: Night
  processing?: ProcessingStatus
}

export function NightCard({ night, processing }: NightCardProps) {
  const navigate = useNavigate()
  const s = night.summary
  const videoIds = night.video_ids || []
  const progress = processing?.progress || {}
  const processingCount = videoIds.filter(
    (id) => id in progress && progress[id] < 1
  ).length
  const isProcessing = processing?.running && processingCount > 0

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() => navigate(`/nights/${night.night_date}`)}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">
          {formatDate(night.night_date)}
        </CardTitle>
        {s ? (
          <PlmiBadge value={s.plmi} showLabel />
        ) : isProcessing ? (
          <Badge variant="secondary">
            <Spinner className="mr-1" />
            Processing
          </Badge>
        ) : (
          <Badge variant="outline">Not processed</Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
          {s ? (
            <>
              <span>
                <strong className="text-foreground">{s.plm_count}</strong> PLMs
              </span>
              <span>
                <strong className="text-foreground">{s.series_count}</strong>{" "}
                series
              </span>
              <span>
                <strong className="text-foreground">
                  {s.body_movements || 0}
                </strong>{" "}
                body
              </span>
              <span>
                {formatClockTime(night.start_local)}-
                {formatClockTime(night.end_local)}
              </span>
              <span>{formatDuration(night.total_hours)}</span>
            </>
          ) : (
            <>
              <span>
                <strong className="text-foreground">
                  {night.videos_total}
                </strong>{" "}
                {night.videos_total === 1 ? "video" : "videos"}
              </span>
              <span>{formatDuration(night.total_hours)}</span>
              {isProcessing && (
                <span className="text-primary">
                  {night.videos_processed}/{night.videos_total} done
                </span>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
