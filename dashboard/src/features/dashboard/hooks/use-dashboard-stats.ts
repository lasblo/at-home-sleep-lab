import { useMemo } from "react"
import type { Night } from "@/shared/types/api"

export interface ChartDataPoint {
  date: string
  plmi: number
  plmCount: number
  series: number
  body: number
  hours: number
  plmai: number | null
  arousalPct: number | null
}

export interface DashboardStats {
  avgPLMI: number
  medianPLMI: number
  plmiTrend: number | null
  maxPLMI: number
  minPLMI: number
  worstNight: string | null
  bestNight: string | null
  avgHours: number
  hoursTrend: number | null
  totalPLMs: number
  totalSeries: number
  totalBody: number
  avgBedtime: string
  avgWaketime: string
  plmFreePercent: number
  avgPLMsPerSeries: number
  avgMovementIntensity: number
  chartData: ChartDataPoint[]
  hasArousalData: boolean
  avgPLMAI: number | null
  plmaiTrend: number | null
  avgArousalPct: number | null
  avgArousalMag: number | null
  arousalChartData: ChartDataPoint[]
  nightsAnalyzed: number
  nightsPending: number
}

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function trend(arr: number[]): number | null {
  if (arr.length < 3) return null
  return avg(arr.slice(-3)) - avg(arr.slice(0, 3))
}

function formatDecimalTime(dec: number): string {
  const h = Math.floor(dec % 24)
  const m = Math.round((dec % 1) * 60)
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

export function useDashboardStats(
  nights: Night[]
): DashboardStats | null {
  return useMemo(() => {
    const scored = nights
      .filter((n) => n.summary)
      .sort((a, b) => a.night_date.localeCompare(b.night_date))

    if (scored.length === 0) return null

    const plmis = scored.map((n) => n.summary!.plmi)
    const hours = scored.map((n) => n.total_hours)
    const plmCounts = scored.map((n) => n.summary!.plm_count)
    const seriesCounts = scored.map((n) => n.summary!.series_count)
    const bodyCounts = scored.map((n) => n.summary!.body_movements || 0)

    const bedtimes = scored.map((n) => {
      const h = parseInt(n.start_local.slice(11, 13))
      const m = parseInt(n.start_local.slice(14, 16))
      return h < 12 ? h + m / 60 + 24 : h + m / 60
    })
    const waketimes = scored.map((n) => {
      const h = parseInt(n.end_local.slice(11, 13))
      const m = parseInt(n.end_local.slice(14, 16))
      return h + m / 60
    })

    const plmFreeHours = scored.reduce((sum, n) => {
      const hd = n.hourly_distribution || []
      return sum + hd.filter((h) => h.plm_count === 0).length
    }, 0)
    const totalHoursRecorded = scored.reduce((sum, n) => {
      const hd = n.hourly_distribution || []
      return sum + hd.length
    }, 0)

    const worstIdx = plmis.indexOf(Math.max(...plmis))
    const bestIdx = plmis.indexOf(Math.min(...plmis))

    const arousalNights = scored.filter((n) => n.arousal_summary)
    const plmais = arousalNights.map((n) => n.arousal_summary!.plmai)
    const arousalPcts = arousalNights.map(
      (n) => n.arousal_summary!.arousal_percentage
    )
    const arousalMags = arousalNights
      .map((n) => n.arousal_summary!.mean_magnitude_bpm)
      .filter((v) => v > 0)

    const chartData: ChartDataPoint[] = scored.map((n) => ({
      date: n.night_date,
      plmi: n.summary!.plmi,
      plmCount: n.summary!.plm_count,
      series: n.summary!.series_count,
      body: n.summary!.body_movements || 0,
      hours: n.total_hours,
      plmai: n.arousal_summary?.plmai ?? null,
      arousalPct: n.arousal_summary?.arousal_percentage ?? null,
    }))

    const totalSeriesSum = seriesCounts.reduce((a, b) => a + b, 0)
    const avgPLMsPerSeries =
      totalSeriesSum > 0
        ? plmCounts.reduce((a, b) => a + b, 0) / totalSeriesSum
        : 0

    const movementIntensity = scored.map(
      (n) => n.summary!.total_movements / n.total_hours
    )

    return {
      avgPLMI: avg(plmis),
      medianPLMI: median(plmis),
      plmiTrend: trend(plmis),
      maxPLMI: Math.max(...plmis),
      minPLMI: Math.min(...plmis),
      worstNight: scored[worstIdx]?.night_date ?? null,
      bestNight: scored[bestIdx]?.night_date ?? null,
      avgHours: avg(hours),
      hoursTrend: trend(hours),
      totalPLMs: plmCounts.reduce((a, b) => a + b, 0),
      totalSeries: totalSeriesSum,
      totalBody: bodyCounts.reduce((a, b) => a + b, 0),
      avgBedtime: formatDecimalTime(avg(bedtimes)),
      avgWaketime: formatDecimalTime(avg(waketimes)),
      plmFreePercent:
        totalHoursRecorded > 0
          ? (plmFreeHours / totalHoursRecorded) * 100
          : 0,
      avgPLMsPerSeries,
      avgMovementIntensity: avg(movementIntensity),
      chartData,
      hasArousalData: arousalNights.length > 0,
      avgPLMAI: plmais.length > 0 ? avg(plmais) : null,
      plmaiTrend: plmais.length >= 3 ? trend(plmais) : null,
      avgArousalPct: arousalPcts.length > 0 ? avg(arousalPcts) : null,
      avgArousalMag: arousalMags.length > 0 ? avg(arousalMags) : null,
      arousalChartData: chartData.filter((d) => d.plmai != null),
      nightsAnalyzed: scored.length,
      nightsPending: nights.length - scored.length,
    }
  }, [nights])
}
