import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { RefreshCw } from "lucide-react"
import type { VideoResults, ProcessingStatus } from "@/shared/types/api"

interface VideoSummaryProps {
  results: VideoResults
  videoId: string
  onReanalyze: (videoId: string) => void
  processing?: ProcessingStatus
}

export function VideoSummary({
  results,
  videoId,
  onReanalyze,
  processing,
}: VideoSummaryProps) {
  const s = results.summary
  const isProcessing =
    processing?.running && processing.progress[videoId] != null
  const hasDebug = results.events.some((e) => e.debug)

  if (!s) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-3">
          <span className="text-sm text-muted-foreground">
            No summary -- reanalyze to generate
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReanalyze(videoId)}
            disabled={isProcessing}
          >
            <RefreshCw data-icon="inline-start" />
            Reanalyze
          </Button>
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
        {hasDebug && (
          <span className="text-[10px] text-severity-normal">debug info available</span>
        )}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReanalyze(videoId)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Spinner data-icon="inline-start" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw data-icon="inline-start" />
                Reanalyze
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
