import { useParams, useNavigate } from "react-router-dom"
import { useSessionDetail } from "./hooks/use-sessions"
import { PageHeader } from "@/shared/components/page-header"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { NotFound, ErrorState } from "@/shared/components/error-state"
import { HourlyChart } from "@/features/nights/components/hourly-chart"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ExternalLink } from "lucide-react"
import { formatFullDate, formatDuration, formatClockTime } from "@/shared/lib/utils"

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { data: session, isLoading, isError, error, refetch } = useSessionDetail(sessionId)

  if (isError) {
    return error?.message === "not_found" ? (
      <NotFound
        title="Session not found"
        description="This session doesn't exist or has been deleted."
        backTo="/sessions"
        backLabel="Back to sessions"
      />
    ) : (
      <ErrorState title="Failed to load session" retry={refetch} />
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[280px]" />
      </div>
    )
  }

  if (!session) return null

  const isRecording = session.status === "recording"

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={formatFullDate(session.night_date)}>
        {isRecording && (
          <Badge variant="secondary" className="text-sm">
            <Spinner className="mr-1" />
            Recording in progress
          </Badge>
        )}
        {session.status === "analyzed" && session.summary && (
          <PlmiBadge value={session.summary.plmi} showLabel />
        )}
      </PageHeader>

      {/* Session info */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">
          Started: {new Date(session.started_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </Badge>
        {session.stopped_at && (
          <Badge variant="outline">
            Stopped: {new Date(session.stopped_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </Badge>
        )}
        {session.total_hours && (
          <Badge variant="outline">{formatDuration(session.total_hours)}</Badge>
        )}
        {session.hr_enabled && (
          <Badge variant="secondary" className="text-[10px]">WHOOP HR</Badge>
        )}
        {session.summary && (
          <>
            <Badge variant="secondary">
              <span className="font-semibold text-chart-1">{session.summary.plm_count}</span>
              &nbsp;PLMs
            </Badge>
            <Badge variant="secondary">
              <span className="font-semibold">{session.summary.series_count}</span>
              &nbsp;Series
            </Badge>
            <Badge variant="secondary">
              <span className="font-semibold">{session.summary.body_movements}</span>
              &nbsp;Body
            </Badge>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hourly chart */}
        <div className="lg:col-span-2">
          {session.hourly_distribution && session.hourly_distribution.length > 0 ? (
            <HourlyChart hourly={session.hourly_distribution} />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
                {isRecording ? "Hourly data will appear as videos are processed" : "No hourly data"}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Video segments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Video Segments ({session.videos?.length ?? 0})
              {isRecording && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  auto-updating
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(session.videos || []).map((v) => (
              <button
                key={v.id}
                onClick={() => v.processed !== false && navigate(`/videos/${v.id}`)}
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
                    <>
                      <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal text-[10px]">
                        Analyzed
                      </Badge>
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    </>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      <Spinner className="mr-1" />
                      Processing
                    </Badge>
                  )}
                </div>
              </button>
            ))}
            {(!session.videos || session.videos.length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {isRecording
                  ? "First video will appear after ~1 hour"
                  : "No video segments"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Arousal summary */}
      {session.arousal_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cardiac Arousal Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm tabular-nums">
              <div>
                <span className="text-muted-foreground">PLMAI: </span>
                <span className="font-medium">{session.arousal_summary.plmai}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Arousal Rate: </span>
                <span className="font-medium">{session.arousal_summary.arousal_percentage}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg HR Spike: </span>
                <span className="font-medium">{session.arousal_summary.mean_magnitude_bpm.toFixed(1)} bpm</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
