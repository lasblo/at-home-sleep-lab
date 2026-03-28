import { useNavigate } from "react-router-dom"
import { useSessions, useActiveSession } from "@/features/sessions/hooks/use-sessions"
import { useDashboardStats } from "./hooks/use-dashboard-stats"
import { PageHeader } from "@/shared/components/page-header"
import { StatsOverview } from "./components/stats-overview"
import { PlmiTrendChart } from "./components/plmi-trend-chart"
import { MetricChart } from "./components/metric-chart"
import { HourlyHeatmap } from "./components/hourly-heatmap"
import { StatCard } from "@/shared/components/stat-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Moon, ArrowRight, Settings } from "lucide-react"
import { ErrorState } from "@/shared/components/error-state"
import { formatDate } from "@/shared/lib/utils"
import type { Night } from "@/shared/types/api"

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: sessions, isLoading, isError, refetch } = useSessions()
  const { data: active } = useActiveSession()

  // Convert sessions to Night-like format for existing stats hook
  const nightsLike: Night[] = (sessions ?? [])
    .filter((s) => s.status === "analyzed")
    .map((s) => ({
      night_date: s.night_date,
      start_local: s.started_at,
      end_local: s.stopped_at ?? s.started_at,
      total_hours: s.total_hours ?? 0,
      video_ids: [],
      videos_total: 0,
      videos_processed: 0,
      summary: null,
      hourly_distribution: null,
      arousal_summary: null,
    }))

  const stats = useDashboardStats(nightsLike)

  if (isError) {
    return <ErrorState title="Failed to load dashboard" retry={refetch} />
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Dashboard" description="Sleep health overview" />

        {/* Active session banner */}
        {active && (
          <div className="flex items-center gap-3 rounded-lg border border-chart-1/30 bg-chart-1/5 p-4">
            <div className="size-3 animate-pulse rounded-full bg-chart-1" />
            <span className="font-medium">Sleep session in progress</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => navigate(`/sessions/${active.id}`)}
            >
              View live
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        )}

        <Empty className="min-h-[400px]">
          <EmptyMedia variant="icon">
            <Moon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Welcome to Sleep Lab</EmptyTitle>
            <EmptyDescription>
              {active
                ? "Your first session is recording. Results will appear here after you stop it."
                : "Start a sleep session from the sidebar to begin tracking your sleep."}
            </EmptyDescription>
          </EmptyHeader>
          {!active && (
            <Button variant="outline" onClick={() => navigate("/settings")}>
              <Settings data-icon="inline-start" />
              Configure UniFi Protect first
            </Button>
          )}
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Dashboard" description="Sleep health overview" />

      {/* Active session banner */}
      {active && (
        <div className="flex items-center gap-3 rounded-lg border border-chart-1/30 bg-chart-1/5 p-4">
          <div className="size-3 animate-pulse rounded-full bg-chart-1" />
          <span className="font-medium">Sleep session in progress</span>
          <Badge variant="outline" className="tabular-nums">
            {new Date(active.started_at).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", hour12: false,
            })}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => navigate(`/sessions/${active.id}`)}
          >
            View live
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      )}

      {/* Stats — only if we have analyzed sessions with data */}
      {stats && <StatsOverview stats={stats} />}

      {stats && (
        <>
          <PlmiTrendChart data={stats.chartData} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricChart
              title="Sleep Duration"
              data={stats.chartData}
              dataKey="hours"
              color="var(--color-chart-5)"
              formatValue={(v) => `${v.toFixed(1)}h`}
            />
            <MetricChart
              title="PLM Count"
              data={stats.chartData}
              dataKey="plmCount"
              color="var(--color-chart-2)"
              type="bar"
              formatValue={(v) => v.toFixed(0)}
            />
            {stats.hasArousalData && stats.arousalChartData.length > 0 && (
              <MetricChart
                title="PLMAI Trend"
                description="PLM Arousal Index"
                data={stats.arousalChartData}
                dataKey="plmai"
                color="var(--color-chart-3)"
              />
            )}
            <MetricChart
              title="Series per Night"
              data={stats.chartData}
              dataKey="series"
              color="var(--color-chart-4)"
              type="bar"
              formatValue={(v) => v.toFixed(0)}
            />
          </div>

          <HourlyHeatmap nights={nightsLike} />
        </>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => navigate("/sessions")}>
          View all sessions
          <ArrowRight data-icon="inline-end" />
        </Button>
        {stats?.hasArousalData && (
          <Button variant="outline" onClick={() => navigate("/heart-rate")}>
            Heart rate analysis
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}
      </div>
    </div>
  )
}
