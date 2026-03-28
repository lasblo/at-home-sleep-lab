import { useNavigate } from "react-router-dom"
import { useNights } from "./hooks/use-nights"
import { useDashboardStats } from "./hooks/use-dashboard-stats"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { ProcessButton } from "@/features/processing/components/process-button"
import { StatsOverview } from "./components/stats-overview"
import { PlmiTrendChart } from "./components/plmi-trend-chart"
import { MetricChart } from "./components/metric-chart"
import { HourlyHeatmap } from "./components/hourly-heatmap"
import { StatCard } from "@/shared/components/stat-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Video, ArrowRight } from "lucide-react"
import { formatDate } from "@/shared/lib/utils"

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: nights, isLoading } = useNights()
  const stats = useDashboardStats(nights ?? [])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
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
            <EmptyTitle>No data yet</EmptyTitle>
            <EmptyDescription>
              Add MP4 files to the videos/ directory and process them to see
              your sleep analysis dashboard.
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
        <Empty className="min-h-[300px]">
          <EmptyHeader>
            <EmptyTitle>No processed nights</EmptyTitle>
            <EmptyDescription>
              {nights.length} night{nights.length !== 1 && "s"} found but none
              processed yet. Click Process All Videos to start.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Dashboard" description="Sleep health overview">
        <ProcessButton />
      </PageHeader>

      {/* Key metrics */}
      <StatsOverview stats={stats} />

      {/* Primary trend chart */}
      <PlmiTrendChart data={stats.chartData} />

      {/* Secondary charts */}
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

      {/* Hourly pattern */}
      <HourlyHeatmap nights={nights} />

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
        <StatCard
          label="Total PLMs"
          value={stats.totalPLMs.toLocaleString()}
          description={`${stats.totalSeries} series total`}
        />
        <StatCard
          label="Movement Rate"
          value={`${stats.avgMovementIntensity.toFixed(1)}/h`}
          description="avg events per hour"
        />
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => navigate("/nights")}>
          Browse all nights
          <ArrowRight data-icon="inline-end" />
        </Button>
        <Button variant="outline" onClick={() => navigate("/videos")}>
          Manage videos
          <ArrowRight data-icon="inline-end" />
        </Button>
        {stats.hasArousalData && (
          <Button variant="outline" onClick={() => navigate("/heart-rate")}>
            Heart rate analysis
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}
      </div>
    </div>
  )
}
