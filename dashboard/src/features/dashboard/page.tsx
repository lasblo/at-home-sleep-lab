import { useNights } from "./hooks/use-nights"
import { useDashboardStats } from "./hooks/use-dashboard-stats"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { ProcessButton } from "@/features/processing/components/process-button"
import { StatsOverview } from "./components/stats-overview"
import { PlmiTrendChart } from "./components/plmi-trend-chart"
import { MetricChart } from "./components/metric-chart"
import { HourlyHeatmap } from "./components/hourly-heatmap"
import { NightsGrid } from "./components/nights-grid"
import { StatCard } from "@/shared/components/stat-card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Video } from "lucide-react"
import { formatDate } from "@/shared/lib/utils"

export default function DashboardPage() {
  const { data: nights, isLoading } = useNights()
  const { status } = useProcessing()
  const stats = useDashboardStats(nights ?? [])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[280px]" />
      </div>
    )
  }

  if (!nights || nights.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Dashboard">
          <ProcessButton />
        </PageHeader>
        <Empty className="min-h-[400px]">
          <EmptyMedia variant="icon">
            <Video />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No videos found</EmptyTitle>
            <EmptyDescription>
              Add MP4 files to the videos/ directory and click Process All
              Videos.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Dashboard">
          <ProcessButton />
        </PageHeader>
        <NightsGrid nights={nights} processing={status ?? undefined} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Dashboard">
        <ProcessButton />
      </PageHeader>

      <StatsOverview stats={stats} />

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PlmiTrendChart data={stats.chartData} />

        {stats.hasArousalData && stats.arousalChartData.length > 0 && (
          <MetricChart
            title="PLMAI Trend"
            description="PLM Arousal Index"
            data={stats.arousalChartData}
            dataKey="plmai"
            color="var(--color-chart-3)"
            className="col-span-full"
          />
        )}

        <MetricChart
          title="PLM Count"
          data={stats.chartData}
          dataKey="plmCount"
          color="var(--color-chart-2)"
          type="bar"
          formatValue={(v) => v.toFixed(0)}
        />
        <MetricChart
          title="Series per Night"
          data={stats.chartData}
          dataKey="series"
          color="var(--color-chart-4)"
          type="bar"
          formatValue={(v) => v.toFixed(0)}
        />
        <MetricChart
          title="Sleep Duration"
          data={stats.chartData}
          dataKey="hours"
          color="var(--color-chart-5)"
          formatValue={(v) => `${v.toFixed(1)}h`}
        />
        <MetricChart
          title="Body Movements"
          data={stats.chartData}
          dataKey="body"
          color="var(--color-chart-2)"
          type="bar"
          formatValue={(v) => v.toFixed(0)}
        />

        <HourlyHeatmap nights={nights} />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total PLMs"
          value={stats.totalPLMs.toLocaleString()}
          description={`across ${stats.nightsAnalyzed} nights`}
        />
        <StatCard
          label="Total Series"
          value={stats.totalSeries.toString()}
          description={`avg ${stats.avgPLMsPerSeries.toFixed(1)} PLMs/series`}
        />
        <StatCard
          label="Body Movements"
          value={stats.totalBody.toString()}
          description={`avg ${(stats.totalBody / stats.nightsAnalyzed).toFixed(0)}/night`}
        />
        <StatCard
          label="Movement Rate"
          value={`${stats.avgMovementIntensity.toFixed(1)}/h`}
          description="all events per hour"
        />
        <StatCard
          label="Best Night"
          value={`${stats.minPLMI.toFixed(1)} PLMI`}
          description={stats.bestNight ? formatDate(stats.bestNight) : ""}
          valueClassName="text-severity-normal"
        />
        <StatCard
          label="Worst Night"
          value={`${stats.maxPLMI.toFixed(1)} PLMI`}
          description={stats.worstNight ? formatDate(stats.worstNight) : ""}
          valueClassName="text-severity-severe"
        />
      </div>

      {stats.hasArousalData && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <StatCard
            label="Avg Arousal %"
            value={`${stats.avgArousalPct?.toFixed(0) ?? "-"}%`}
            description={
              (stats.avgArousalPct ?? 0) > 50
                ? "majority disruptive"
                : "some subclinical"
            }
          />
          <StatCard
            label="Avg HR Spike"
            value={`${stats.avgArousalMag?.toFixed(1) ?? "-"} bpm`}
            description="mean arousal magnitude"
          />
        </div>
      )}

      <Separator />

      {/* All nights */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          All Nights
        </h2>
        <NightsGrid nights={nights} processing={status ?? undefined} />
      </div>
    </div>
  )
}
