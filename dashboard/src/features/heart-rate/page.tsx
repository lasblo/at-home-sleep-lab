import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useDashboardSummary } from "@/features/dashboard/hooks/use-dashboard"
import { HRTrendChart } from "@/features/dashboard/components/hr-trend-chart"
import { PageHeader } from "@/shared/components/page-header"
import { StatCard } from "@/shared/components/stat-card"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Heart, Loader2, Wifi, WifiOff } from "lucide-react"
import { ErrorState } from "@/shared/components/error-state"
import { useActiveSession } from "@/features/sessions/hooks/use-sessions"
import { formatDate } from "@/shared/lib/utils"
import type { DashboardSession } from "@/shared/types/api"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

function dipColor(dip: number): string {
  if (dip >= 10) return "var(--color-severity-normal)"
  if (dip >= 5) return "var(--color-severity-mild)"
  return "var(--color-severity-moderate)"
}

const dipChartConfig = {
  dip_pct: {
    label: "Nocturnal Dip",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig

function NocturnalDipChart({ sessions }: { sessions: DashboardSession[] }) {
  const data = sessions
    .filter((s) => s.hr_stats?.dip_pct != null)
    .map((s) => ({
      date: s.night_date,
      dip_pct: s.hr_stats!.dip_pct!,
    }))

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Nocturnal Dip</CardTitle>
        <CardDescription>
          HR reduction during sleep — 10%+ is healthy (dipper pattern)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={dipChartConfig} className="h-[250px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatDate(v).replace(/,.*/, "")}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={32}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => formatDate(v as string)}
                  formatter={(value) => [
                    `${(value as number).toFixed(1)}%`,
                    "Dip",
                  ]}
                />
              }
            />
            <Bar dataKey="dip_pct" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={dipColor(d.dip_pct)} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

const rangeChartConfig = {
  min_hr: {
    label: "Min HR",
    color: "var(--color-chart-2)",
  },
  max_hr: {
    label: "Max HR",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig

function HRRangeChart({ sessions }: { sessions: DashboardSession[] }) {
  const data = sessions
    .filter((s) => s.hr_stats?.sleeping_hr != null)
    .map((s) => ({
      date: s.night_date,
      min_hr: s.hr_stats!.min_hr,
      max_hr: s.hr_stats!.max_hr,
      sleeping_hr: s.hr_stats!.sleeping_hr,
      waking_hr: s.hr_stats!.waking_hr,
    }))

  if (data.length === 0) return null

  const yMin = Math.floor(Math.min(...data.map((d) => d.min_hr)) / 5) * 5 - 5
  const yMax = Math.ceil(Math.max(...data.map((d) => d.max_hr)) / 5) * 5 + 5

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">HR Range</CardTitle>
        <CardDescription>
          Nightly min–max range with sleeping HR band
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={rangeChartConfig} className="h-[250px] w-full">
          <AreaChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatDate(v).replace(/,.*/, "")}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={32}
              domain={[yMin, yMax]}
              tickFormatter={(v) => `${v}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => formatDate(v as string)}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      max_hr: "Max HR",
                      min_hr: "Min HR",
                    }
                    return [
                      `${Math.round(value as number)} bpm`,
                      labels[name as string] ?? name,
                    ]
                  }}
                />
              }
            />
            <defs>
              <linearGradient id="fillRange" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-chart-4)"
                  stopOpacity={0.15}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-chart-4)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="max_hr"
              stroke="var(--color-chart-4)"
              fill="url(#fillRange)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="min_hr"
              stroke="var(--color-chart-2)"
              fill="var(--color-chart-2)"
              fillOpacity={0.08}
              strokeWidth={1.5}
              dot={{ r: 3, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default function HeartRatePage() {
  const navigate = useNavigate()
  const { data: summary, isLoading, isError, refetch } = useDashboardSummary()
  const { data: activeSession } = useActiveSession()
  const { data: hrStatus } = useQuery({
    queryKey: ["hr", "status"],
    queryFn: async () => {
      const res = await fetch("/api/hr/status")
      if (!res.ok) throw new Error("Failed to fetch HR status")
      return res.json()
    },
    refetchInterval: 10000,
  })

  const hrSessions = useMemo(
    () =>
      (summary?.sessions ?? []).filter(
        (s) => s.hr_enabled && s.hr_stats?.sleeping_hr != null
      ),
    [summary]
  )

  const stats = useMemo(() => {
    if (hrSessions.length === 0) return null
    const sleepingHRs = hrSessions.map((s) => s.hr_stats!.sleeping_hr!)
    const avgHRs = hrSessions.map((s) => s.hr_stats!.avg_hr)
    const dips = hrSessions
      .filter((s) => s.hr_stats!.dip_pct != null)
      .map((s) => s.hr_stats!.dip_pct!)
    const arousals = hrSessions
      .filter((s) => s.arousal_pct != null)
      .map((s) => s.arousal_pct!)
    const readings = hrSessions.map((s) => s.hr_stats!.reading_count)

    const avg = (a: number[]) =>
      a.length > 0 ? a.reduce((x, y) => x + y, 0) / a.length : 0

    return {
      avgSleepingHR: Math.round(avg(sleepingHRs)),
      avgHR: Math.round(avg(avgHRs)),
      avgDip: dips.length > 0 ? Math.round(avg(dips) * 10) / 10 : null,
      avgArousal:
        arousals.length > 0 ? Math.round(avg(arousals) * 10) / 10 : null,
      totalReadings: readings.reduce((a, b) => a + b, 0),
      sessionCount: hrSessions.length,
    }
  }, [hrSessions])

  const isConnected =
    hrStatus?.status === "connected" || hrStatus?.status === "streaming"
  const isConnecting = hrStatus?.status === "connecting"
  const hasActiveSession = activeSession?.status === "recording"

  if (isError) {
    return <ErrorState title="Failed to load heart rate data" retry={refetch} />
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
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Heart Rate"
        description="Cardiac monitoring and nocturnal HR analytics"
      />

      {/* Live status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">HR Monitor Status</CardTitle>
          <CardDescription>
            HR monitoring starts and stops automatically with sleep sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {isConnected ? (
              <>
                <Wifi className="size-5 text-severity-normal" />
                <div className="flex flex-col gap-0.5">
                  <Badge
                    variant="secondary"
                    className="bg-severity-normal/15 text-severity-normal"
                  >
                    Connected
                  </Badge>
                  {hrStatus?.hr && (
                    <span className="text-lg font-semibold text-chart-3 tabular-nums">
                      {hrStatus.hr} bpm
                    </span>
                  )}
                </div>
              </>
            ) : isConnecting || (hasActiveSession && !isConnected) ? (
              <>
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <Badge variant="outline">Connecting</Badge>
                <span className="text-xs text-muted-foreground">
                  Session active — waiting for HR device
                </span>
              </>
            ) : (
              <>
                <WifiOff className="size-5 text-muted-foreground" />
                <Badge variant="outline">Not Active</Badge>
                <span className="text-xs text-muted-foreground">
                  Will connect when a sleep session starts
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {!stats ? (
        <Empty className="min-h-[300px]">
          <EmptyMedia variant="icon">
            <Heart />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No heart rate data</EmptyTitle>
            <EmptyDescription>
              Enable a BLE heart rate monitor in Settings and run a sleep
              session to collect cardiac arousal data.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Sleeping HR"
              value={`${stats.avgSleepingHR} bpm`}
              description="Lowest 5-min median"
            />
            <StatCard
              label="Avg HR"
              value={`${stats.avgHR} bpm`}
              description="Nightly average"
            />
            {stats.avgDip != null && (
              <StatCard
                label="Nocturnal Dip"
                value={`${stats.avgDip}%`}
                description={
                  stats.avgDip >= 10 ? "Dipper (healthy)" : "Non-dipper"
                }
              />
            )}
            {stats.avgArousal != null && (
              <StatCard
                label="Arousal Rate"
                value={`${stats.avgArousal}%`}
                description="PLMs causing arousals"
              />
            )}
            <StatCard
              label="HR Sessions"
              value={stats.sessionCount.toString()}
              description={`${(stats.totalReadings / 1000).toFixed(0)}k readings`}
            />
          </div>

          {/* Trend charts */}
          <HRTrendChart sessions={summary!.sessions} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <NocturnalDipChart sessions={summary!.sessions} />
            <HRRangeChart sessions={summary!.sessions} />
          </div>

          {/* Sessions table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Nightly HR Details</CardTitle>
              <CardDescription>Click to view session details</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sleep HR</TableHead>
                    <TableHead className="text-right">Avg HR</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                    <TableHead className="text-right">Dip</TableHead>
                    <TableHead className="text-right">Arousal</TableHead>
                    <TableHead className="text-right">Readings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hrSessions.map((s) => (
                    <TableRow
                      key={s.session_id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sessions/${s.session_id}`)}
                    >
                      <TableCell className="font-medium">
                        {formatDate(s.night_date)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-chart-2 tabular-nums">
                        {s.hr_stats!.sleeping_hr} bpm
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.hr_stats!.avg_hr}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.hr_stats!.min_hr}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.hr_stats!.max_hr}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.hr_stats!.dip_pct != null
                          ? `${s.hr_stats!.dip_pct.toFixed(1)}%`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.arousal_pct != null
                          ? `${s.arousal_pct.toFixed(0)}%`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {(s.hr_stats!.reading_count / 1000).toFixed(1)}k
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
