import { useParams, useNavigate } from "react-router-dom"
import { useNightDetail } from "./hooks/use-night-detail"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { NightStatsBar } from "./components/night-stats-bar"
import { HourlyChart } from "./components/hourly-chart"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { RefreshCw, Play, ExternalLink } from "lucide-react"
import { formatFullDate, formatClockTime, formatDuration } from "@/shared/lib/utils"

export default function NightDetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { data: night, isLoading } = useNightDetail(date)
  const { isRunning, reprocessNight } = useProcessing()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-[280px]" />
          <Skeleton className="h-[280px]" />
        </div>
      </div>
    )
  }

  if (!night) return null

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={formatFullDate(date!)}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reprocessNight.mutate(date!)}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <Spinner data-icon="inline-start" />
              Processing...
            </>
          ) : (
            <>
              <RefreshCw data-icon="inline-start" />
              Reprocess Night
            </>
          )}
        </Button>
      </PageHeader>

      {/* Stats bar */}
      <NightStatsBar night={night} />

      {/* Main content: chart + segments side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hourly distribution */}
        <div className="lg:col-span-2">
          {night.hourly_distribution && night.hourly_distribution.length > 0 ? (
            <HourlyChart hourly={night.hourly_distribution} />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
                No hourly data available
              </CardContent>
            </Card>
          )}
        </div>

        {/* Video segments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Video Segments ({night.videos?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(night.videos || []).map((v) => (
              <button
                key={v.id}
                onClick={() => navigate(`/videos/${v.id}`)}
                className="flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm tabular-nums">
                    {formatClockTime(v.start_local)} -{" "}
                    {formatClockTime(v.end_local)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(v.duration_sec / 3600)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {v.processed !== false ? (
                    <Badge
                      variant="secondary"
                      className="bg-severity-normal/15 text-severity-normal text-[10px]"
                    >
                      Analyzed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Pending
                    </Badge>
                  )}
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </div>
              </button>
            ))}
            {(!night.videos || night.videos.length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No video segments
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Arousal summary if available */}
      {night.arousal_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cardiac Arousal Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm tabular-nums">
              <div>
                <span className="text-muted-foreground">PLMAI: </span>
                <span className="font-medium">
                  {night.arousal_summary.plmai}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Arousal Rate: </span>
                <span className="font-medium">
                  {night.arousal_summary.arousal_percentage}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg HR Spike: </span>
                <span className="font-medium">
                  {night.arousal_summary.mean_magnitude_bpm.toFixed(1)} bpm
                </span>
              </div>
              <Button
                variant="link"
                size="sm"
                className="ml-auto"
                onClick={() => navigate("/heart-rate")}
              >
                View heart rate details
                <ExternalLink data-icon="inline-end" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
