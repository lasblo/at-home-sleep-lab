import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import type { VideoResults } from "@/shared/types/api"

interface VideoSummaryProps {
  results: VideoResults
}

export function VideoSummary({ results }: VideoSummaryProps) {
  const s = results.summary

  if (!s) {
    return (
      <Card>
        <CardContent className="py-3">
          <span className="text-sm text-muted-foreground">
            No summary available
          </span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-3">
        <PlmiBadge value={s.plmi} showLabel />
        <Badge variant="secondary">
          <span className="font-semibold text-chart-1">{s.plm_count}</span>
          &nbsp;PLMs
        </Badge>
        <Badge variant="secondary">
          <span className="font-semibold">{s.series_count}</span>&nbsp;Series
        </Badge>
        <Badge variant="secondary">
          <span className="font-semibold">{s.total_movements}</span>&nbsp;Events
        </Badge>
        {results.events.some((e) => e.debug) && (
          <span className="text-[10px] text-severity-normal">debug info available</span>
        )}
      </CardContent>
    </Card>
  )
}
