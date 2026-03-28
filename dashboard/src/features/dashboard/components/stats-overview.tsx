import { StatCard } from "@/shared/components/stat-card"
import { plmiSeverity } from "@/shared/lib/utils"
import type { DashboardStats } from "../hooks/use-dashboard-stats"

interface StatsOverviewProps {
  stats: DashboardStats
}

const severityValueClass: Record<string, string> = {
  normal: "text-severity-normal",
  mild: "text-severity-mild",
  moderate: "text-severity-moderate",
  severe: "text-severity-severe",
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <StatCard
        label="Avg PLMI"
        value={stats.avgPLMI}
        valueClassName={severityValueClass[plmiSeverity(stats.avgPLMI)]}
        description={`${plmiSeverity(stats.avgPLMI).charAt(0).toUpperCase()}${plmiSeverity(stats.avgPLMI).slice(1)}`}
        trend={stats.plmiTrend != null ? { value: stats.plmiTrend } : undefined}
      />
      <StatCard
        label="Median PLMI"
        value={stats.medianPLMI}
        valueClassName={severityValueClass[plmiSeverity(stats.medianPLMI)]}
        description={`Range: ${stats.minPLMI.toFixed(0)}-${stats.maxPLMI.toFixed(0)}`}
      />
      <StatCard
        label="Avg Sleep"
        value={`${stats.avgHours.toFixed(1)}h`}
        description={`${stats.avgBedtime} \u2192 ${stats.avgWaketime}`}
        trend={stats.hoursTrend != null ? { value: stats.hoursTrend } : undefined}
      />
      {stats.hasArousalData && stats.avgPLMAI != null && (
        <StatCard
          label="Avg PLMAI"
          value={stats.avgPLMAI}
          valueClassName={severityValueClass[plmiSeverity(stats.avgPLMAI)]}
          description={`${stats.avgArousalPct?.toFixed(0)}% arousals`}
          trend={stats.plmaiTrend != null ? { value: stats.plmaiTrend } : undefined}
        />
      )}
      <StatCard
        label="PLM-Free Hours"
        value={`${stats.plmFreePercent.toFixed(0)}%`}
        description="of recorded hours"
      />
      <StatCard
        label="Nights Analyzed"
        value={stats.nightsAnalyzed.toString()}
        description={
          stats.nightsPending > 0
            ? `${stats.nightsPending} pending`
            : "all processed"
        }
      />
    </div>
  )
}
