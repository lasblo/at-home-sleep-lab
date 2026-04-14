import { useParams, useNavigate } from "react-router-dom"
import { useSessionDetail } from "./hooks/use-sessions"
import { PageHeader } from "@/shared/components/page-header"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { StatCard } from "@/shared/components/stat-card"
import { NotFound, ErrorState } from "@/shared/components/error-state"
import { HourlyChart } from "@/shared/components/hourly-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ExternalLink } from "lucide-react"
import {
  formatFullDate,
  formatDuration,
  formatClockTime,
} from "@/shared/lib/utils"

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
  } = useSessionDetail(sessionId)

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
  const es = session.event_stats
  const hr = session.hr_stats
  const sq = session.sleep_quality

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
          Started:{" "}
          {new Date(session.started_at).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </Badge>
        {session.stopped_at && (
          <Badge variant="outline">
            Stopped:{" "}
            {new Date(session.stopped_at).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </Badge>
        )}
        {session.total_hours && (
          <Badge variant="outline">{formatDuration(session.total_hours)}</Badge>
        )}
        {session.hr_enabled && (
          <Badge variant="secondary" className="text-[10px]">
            BLE HR
          </Badge>
        )}
      </div>

      {/* PLM Analytics */}
      {session.summary && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">
            PLM Analytics
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="PLMI"
              value={session.summary.plmi.toFixed(1)}
              tooltip="Periodic Limb Movement Index — PLMs per hour of recording"
            />
            <StatCard
              label="Total PLMs"
              value={String(session.summary.plm_count)}
              description={`${session.summary.total_movements} total events`}
            />
            <StatCard
              label="PLM Series"
              value={String(session.summary.series_count)}
              tooltip="Groups of 4+ PLMs with 5–90s intervals (AASM criteria)"
              description={
                es
                  ? `${es.plms_in_series} in series, ${es.isolated_plms} isolated`
                  : undefined
              }
            />
            <StatCard
              label="Body Movements"
              value={String(session.summary.body_movements)}
              tooltip="High-amplitude, long-duration movements classified as whole-body"
            />
            <StatCard
              label="Mean Duration"
              value={es ? `${es.mean_duration_sec}s` : "—"}
              tooltip="Average PLM duration in seconds"
              description={
                es
                  ? `${es.min_duration_sec}s – ${es.max_duration_sec}s`
                  : undefined
              }
            />
            <StatCard
              label="Mean Interval"
              value={
                es?.mean_interval_sec ? `${es.mean_interval_sec}s` : "—"
              }
              tooltip="Average onset-to-onset interval between consecutive PLMs (within AASM 5–90s range)"
              description={
                es?.median_interval_sec
                  ? `median ${es.median_interval_sec}s`
                  : undefined
              }
            />
          </div>
        </>
      )}

      {/* Sleep Quality */}
      {sq && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">
            Sleep Quality (estimated from motion)
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label="Sleep Efficiency"
              value={sq.efficiency_pct != null ? `${sq.efficiency_pct}%` : "—"}
              tooltip="Estimated time asleep / total recording time. Normal: >85%"
            />
            <StatCard
              label="WASO"
              value={`${sq.waso_min} min`}
              tooltip="Wake After Sleep Onset — estimated minutes awake after falling asleep, based on motion clusters"
            />
            <StatCard
              label="Wake Bouts"
              value={String(sq.wake_bouts)}
              tooltip="Number of distinct wake episodes (>5 min apart) after sleep onset"
            />
          </div>
        </>
      )}

      {/* Heart Rate */}
      {hr && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">
            Heart Rate
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Average HR"
              value={`${hr.avg_hr} bpm`}
              tooltip="Mean heart rate across the entire recording"
            />
            <StatCard
              label="Min HR"
              value={`${hr.min_hr} bpm`}
            />
            <StatCard
              label="Max HR"
              value={`${hr.max_hr} bpm`}
            />
            <StatCard
              label="Sleeping HR"
              value={hr.sleeping_hr != null ? `${hr.sleeping_hr} bpm` : "—"}
              tooltip="Lowest 5-minute rolling median — robust estimate of deepest sleep heart rate"
            />
            <StatCard
              label="Waking HR"
              value={hr.waking_hr != null ? `${hr.waking_hr} bpm` : "—"}
              tooltip="Median HR during first 30 minutes (pre-sleep settling)"
            />
            <StatCard
              label="Nocturnal Dip"
              value={hr.dip_pct != null ? `${hr.dip_pct}%` : "—"}
              tooltip="HR drop from waking to sleeping. Normal dipping: 10–20%"
            />
          </div>
        </>
      )}

      {/* Cardiac Arousal */}
      {es && es.arousal_count > 0 && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">
            Cardiac Arousal
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard
              label="PLMAI"
              value={es.plmai.toFixed(1)}
              tooltip="PLM Arousal Index — PLMs with cardiac arousal per hour"
            />
            <StatCard
              label="Arousal Rate"
              value={`${es.arousal_pct}%`}
              tooltip="Percentage of PLMs that triggered a cardiac arousal response"
              description={`${es.arousal_count} of ${es.plm_count} PLMs`}
            />
            <StatCard
              label="Mean HR Spike"
              value={
                es.mean_arousal_magnitude_bpm != null
                  ? `${es.mean_arousal_magnitude_bpm} bpm`
                  : "—"
              }
              tooltip="Average heart rate increase during PLM-triggered arousals"
            />
            <StatCard
              label="Mean Arousal Duration"
              value={
                es.mean_arousal_duration_sec != null
                  ? `${es.mean_arousal_duration_sec}s`
                  : "—"
              }
              tooltip="Average duration of cardiac arousal episodes"
            />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hourly chart */}
        <div className="lg:col-span-2">
          {session.hourly_distribution &&
          session.hourly_distribution.length > 0 ? (
            <HourlyChart hourly={session.hourly_distribution} />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
                {isRecording
                  ? "Hourly data will appear as videos are processed"
                  : "No hourly data"}
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
                onClick={() =>
                  v.processed !== false && navigate(`/videos/${v.id}`)
                }
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
                      <Badge
                        variant="secondary"
                        className="bg-severity-normal/15 text-[10px] text-severity-normal"
                      >
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
    </div>
  )
}
