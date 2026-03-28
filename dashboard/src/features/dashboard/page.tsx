import { useNavigate } from "react-router-dom"
import { useActiveSession } from "@/features/sessions/hooks/use-sessions"
import { useDashboardSummary, useDashboardStats } from "./hooks/use-dashboard"
import { PlmiTrendChart } from "./components/plmi-trend-chart"
import { HRTrendChart } from "./components/hr-trend-chart"
import { SleepQualityChart } from "./components/sleep-quality-chart"
import { SeverityChart } from "./components/severity-chart"
import { AggregateHourlyChart } from "./components/aggregate-hourly"
import { SessionsTable } from "./components/sessions-table"
import { SleepInsight } from "./components/sleep-insight"
import { PageHeader } from "@/shared/components/page-header"
import { StatCard } from "@/shared/components/stat-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { plmiSeverity } from "@/shared/lib/utils"

const severityValueClass: Record<string, string> = {
  normal: "text-severity-normal",
  mild: "text-severity-mild",
  moderate: "text-severity-moderate",
  severe: "text-severity-severe",
}

function ActiveSessionBanner({
  session,
}: {
  session: { id: string; started_at: string }
}) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="size-3 animate-pulse rounded-full bg-primary" />
      <span className="font-medium">Sleep session in progress</span>
      <Badge variant="outline" className="tabular-nums">
        {new Date(session.started_at).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        onClick={() => navigate(`/sessions/${session.id}`)}
      >
        View live
        <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: summary, isLoading, isError, refetch } = useDashboardSummary()
  const { data: active } = useActiveSession()
  const stats = useDashboardStats(summary?.sessions ?? [])

  if (isError) {
    return <ErrorState title="Failed to load dashboard" retry={refetch} />
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Dashboard"
          description="Your personal sleep health overview"
        />
        {active && <ActiveSessionBanner session={active} />}
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
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        title="Dashboard"
        description="Your personal sleep health overview"
      />

      {active && <ActiveSessionBanner session={active} />}

      {/* Sleep Insights — plain language summary */}
      <SleepInsight stats={stats} />

      {/* Key Metrics */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Key Metrics
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <StatCard
            label="Mean PLMI"
            value={stats.meanPLMI}
            valueClassName={severityValueClass[plmiSeverity(stats.meanPLMI)]}
            description={`${plmiSeverity(stats.meanPLMI).charAt(0).toUpperCase()}${plmiSeverity(stats.meanPLMI).slice(1)}`}
            tooltip="Periodic Limb Movement Index — how many times per hour your legs move during sleep. Under 5 is normal, 5-15 mild, 15-25 moderate, 25+ severe."
            trend={
              stats.plmiTrend != null ? { value: stats.plmiTrend } : undefined
            }
          />
          <StatCard
            label="Median PLMI"
            value={stats.medianPLMI}
            valueClassName={severityValueClass[plmiSeverity(stats.medianPLMI)]}
            description={`Range: ${stats.minPLMI.toFixed(0)}–${stats.maxPLMI.toFixed(0)}`}
            tooltip="The middle value of all your nightly PLMI scores. Less affected by outliers than the average."
          />
          <StatCard
            label="Avg Sleep"
            value={`${stats.avgHours.toFixed(1)}h`}
            description={
              stats.avgBedtime ? `bedtime ~${stats.avgBedtime}` : undefined
            }
            tooltip="Your average total sleep time across all recorded nights. Adults typically need 7-9 hours."
          />
          <StatCard
            label="Nights Analyzed"
            value={stats.nightCount.toString()}
            tooltip="Total number of sleep sessions that have been recorded and analyzed. More data means more reliable patterns."
          />
          {stats.hasArousalData && stats.meanArousalPct != null && (
            <StatCard
              label="Arousal Rate"
              value={`${stats.meanArousalPct.toFixed(0)}%`}
              description="PLMs causing arousals"
              tooltip="The percentage of leg movements that cause brief micro-awakenings (arousals). A high rate means movements are disrupting your sleep more."
              trend={
                stats.arousalTrend != null
                  ? { value: stats.arousalTrend }
                  : undefined
              }
            />
          )}
          {stats.hasArousalData && stats.meanPLMAI != null && (
            <StatCard
              label="Mean PLMAI"
              value={stats.meanPLMAI}
              valueClassName={severityValueClass[plmiSeverity(stats.meanPLMAI)]}
              description="PLM Arousal Index"
              tooltip="PLM Arousal Index — counts only the limb movements that actually wake you up. A PLMI of 20 with low PLMAI means the movements aren't as harmful."
            />
          )}
          {stats.hasHRStats && stats.avgSleepingHR != null && (
            <StatCard
              label="Sleeping HR"
              value={`${stats.avgSleepingHR} bpm`}
              description={
                stats.avgHRDip != null
                  ? `${stats.avgHRDip}% nocturnal dip`
                  : undefined
              }
              tooltip="Your lowest sustained heart rate during sleep (5-minute median). A healthy range is typically 40-60 bpm during deep sleep."
              trend={
                stats.sleepingHRTrend != null
                  ? { value: stats.sleepingHRTrend }
                  : undefined
              }
            />
          )}
          {stats.hasSleepQuality && stats.avgEfficiency != null && (
            <StatCard
              label="Sleep Efficiency"
              value={`${stats.avgEfficiency}%`}
              description={
                stats.avgWasoMin != null
                  ? `WASO ~${stats.avgWasoMin}m`
                  : undefined
              }
              tooltip="The percentage of time in bed that you actually spend sleeping. Above 85% is considered good. WASO = Wake After Sleep Onset."
              trend={
                stats.efficiencyTrend != null
                  ? { value: stats.efficiencyTrend }
                  : undefined
              }
            />
          )}
          {stats.hasSleepQuality && stats.avgOnsetMin != null && (
            <StatCard
              label="Sleep Onset"
              value={`${stats.avgOnsetMin}m`}
              description="Avg time to fall asleep"
              tooltip="How many minutes it takes you to fall asleep after getting into bed. 10-20 minutes is typical and healthy."
            />
          )}
        </div>
      </section>

      {/* PLMI trend — primary chart */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Trends Over Time
        </h2>
        <PlmiTrendChart sessions={stats.sessions} />

        {/* HR + Sleep Quality trend charts */}
        {(stats.hasHRStats || stats.hasSleepQuality) && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {stats.hasHRStats && <HRTrendChart sessions={stats.sessions} />}
            {stats.hasSleepQuality && (
              <SleepQualityChart sessions={stats.sessions} />
            )}
          </div>
        )}
      </section>

      {/* Severity distribution + hourly pattern */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Patterns & Distribution
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SeverityChart
            distribution={stats.severityDistribution}
            total={stats.nightCount}
          />
          <AggregateHourlyChart
            data={summary?.aggregate_hourly ?? []}
            nightCount={stats.nightCount}
          />
        </div>
      </section>

      {/* Sessions table */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            All Sessions
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/sessions")}
          >
            View details
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
        <SessionsTable
          sessions={stats.sessions}
          hasArousalData={stats.hasArousalData}
          hasHRStats={stats.hasHRStats}
          hasSleepQuality={stats.hasSleepQuality}
        />
      </section>
    </div>
  )
}
