import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { DashboardSummary, DashboardSession } from "@/shared/types/api"
import { plmiSeverity, type PlmiSeverity } from "@/shared/lib/utils"

export interface DashboardStats {
  sessions: DashboardSession[]
  nightCount: number
  meanPLMI: number
  medianPLMI: number
  minPLMI: number
  maxPLMI: number
  plmiTrend: number | null
  avgHours: number
  avgBedtime: string
  avgWaketime: string
  severityDistribution: Record<PlmiSeverity, number>
  hasArousalData: boolean
  meanArousalPct: number | null
  meanPLMAI: number | null
  arousalTrend: number | null
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function trend7d(sessions: DashboardSession[], key: (s: DashboardSession) => number | null): number | null {
  const sorted = [...sessions].sort((a, b) => a.night_date.localeCompare(b.night_date))
  if (sorted.length < 4) return null
  const recent = sorted.slice(-7).map(key).filter((v): v is number => v != null)
  const prior = sorted.slice(0, -7).map(key).filter((v): v is number => v != null)
  if (recent.length === 0 || prior.length === 0) return null
  return avg(recent) - avg(prior)
}

function formatDecimalTime(dec: number): string {
  const h = Math.floor(dec % 24)
  const m = Math.round((dec % 1) * 60)
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/summary")
      if (!res.ok) throw new Error("Failed to fetch dashboard summary")
      return res.json()
    },
  })
}

export function useDashboardStats(sessions: DashboardSession[]): DashboardStats | null {
  return useMemo(() => {
    if (sessions.length === 0) return null

    const plmis = sessions.map((s) => s.plmi)
    const hours = sessions.map((s) => s.total_hours)

    const bedtimes = sessions
      .filter((s) => s.started_at)
      .map((s) => {
        const d = new Date(s.started_at!)
        const h = d.getHours()
        const m = d.getMinutes()
        return h < 12 ? h + m / 60 + 24 : h + m / 60
      })

    const arousalSessions = sessions.filter((s) => s.arousal_pct != null)

    const dist: Record<PlmiSeverity, number> = { normal: 0, mild: 0, moderate: 0, severe: 0 }
    for (const s of sessions) {
      dist[plmiSeverity(s.plmi)]++
    }

    return {
      sessions,
      nightCount: sessions.length,
      meanPLMI: avg(plmis),
      medianPLMI: median(plmis),
      minPLMI: Math.min(...plmis),
      maxPLMI: Math.max(...plmis),
      plmiTrend: trend7d(sessions, (s) => s.plmi),
      avgHours: avg(hours),
      avgBedtime: bedtimes.length > 0 ? formatDecimalTime(avg(bedtimes)) : "",
      avgWaketime: "",
      severityDistribution: dist,
      hasArousalData: arousalSessions.length > 0,
      meanArousalPct: arousalSessions.length > 0
        ? avg(arousalSessions.map((s) => s.arousal_pct!))
        : null,
      meanPLMAI: arousalSessions.length > 0
        ? avg(arousalSessions.map((s) => s.plmai!))
        : null,
      arousalTrend: trend7d(sessions, (s) => s.arousal_pct),
    }
  }, [sessions])
}
