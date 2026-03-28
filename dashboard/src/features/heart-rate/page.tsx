import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useNights } from "@/features/dashboard/hooks/use-nights"
import { PageHeader } from "@/shared/components/page-header"
import { StatCard } from "@/shared/components/stat-card"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { MetricChart } from "@/features/dashboard/components/metric-chart"
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
import { Heart, Wifi, WifiOff } from "lucide-react"
import { formatDate } from "@/shared/lib/utils"

export default function HeartRatePage() {
  const navigate = useNavigate()
  const { data: nights, isLoading: nightsLoading } = useNights()
  const { data: hrStatus } = useQuery({
    queryKey: ["hr", "status"],
    queryFn: async () => {
      const res = await fetch("/api/hr/status")
      if (!res.ok) throw new Error("Failed to fetch HR status")
      return res.json()
    },
  })

  const arousalNights = useMemo(
    () =>
      (nights ?? [])
        .filter((n) => n.arousal_summary)
        .sort((a, b) => b.night_date.localeCompare(a.night_date)),
    [nights]
  )

  const stats = useMemo(() => {
    if (arousalNights.length === 0) return null
    const plmais = arousalNights.map((n) => n.arousal_summary!.plmai)
    const arousalPcts = arousalNights.map(
      (n) => n.arousal_summary!.arousal_percentage
    )
    const mags = arousalNights
      .map((n) => n.arousal_summary!.mean_magnitude_bpm)
      .filter((v) => v > 0)
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

    const chartData = arousalNights
      .sort((a, b) => a.night_date.localeCompare(b.night_date))
      .map((n) => ({
        date: n.night_date,
        plmai: n.arousal_summary!.plmai,
        arousalPct: n.arousal_summary!.arousal_percentage,
        plmi: n.summary?.plmi ?? 0,
        plmCount: n.summary?.plm_count ?? 0,
        series: n.summary?.series_count ?? 0,
        body: n.summary?.body_movements ?? 0,
        hours: n.total_hours,
      }))

    return {
      avgPLMAI: avg(plmais),
      avgArousalPct: avg(arousalPcts),
      avgMagnitude: mags.length > 0 ? avg(mags) : 0,
      nightsWithData: arousalNights.length,
      chartData,
    }
  }, [arousalNights])

  if (nightsLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Heart Rate"
        description="Cardiac arousal monitoring via WHOOP"
      />

      {/* Connection status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">WHOOP Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {hrStatus?.status === "connected" ? (
              <>
                <Wifi className="text-severity-normal" />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="bg-severity-normal/15 text-severity-normal"
                    >
                      Connected
                    </Badge>
                    <span className="text-sm">{hrStatus.device}</span>
                  </div>
                  {hrStatus.hr && (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      Current: {hrStatus.hr} bpm
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <WifiOff className="text-muted-foreground" />
                <div className="flex flex-col gap-0.5">
                  <Badge variant="outline">Not Connected</Badge>
                  <span className="text-xs text-muted-foreground">
                    Run: python backend/whoop_hr.py from Terminal
                  </span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Arousal data */}
      {!stats ? (
        <Empty className="min-h-[300px]">
          <EmptyMedia variant="icon">
            <Heart />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No arousal data</EmptyTitle>
            <EmptyDescription>
              Process videos while the WHOOP HR listener is running to generate
              cardiac arousal annotations.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Avg PLMAI"
              value={stats.avgPLMAI}
              description="PLM Arousal Index"
              valueClassName="text-chart-3"
            />
            <StatCard
              label="Avg Arousal Rate"
              value={`${stats.avgArousalPct.toFixed(0)}%`}
              description="PLMs causing arousal"
            />
            <StatCard
              label="Avg HR Spike"
              value={`${stats.avgMagnitude.toFixed(1)} bpm`}
              description="Mean arousal magnitude"
            />
            <StatCard
              label="Nights with HR"
              value={stats.nightsWithData.toString()}
              description="nights with arousal data"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricChart
              title="PLMAI Trend"
              description="PLM Arousal Index over time"
              data={stats.chartData}
              dataKey="plmai"
              color="var(--color-chart-3)"
            />
            <MetricChart
              title="Arousal Rate"
              description="% of PLMs causing cardiac arousal"
              data={stats.chartData.map((d) => ({
                ...d,
                arousalPct: d.arousalPct ?? 0,
              }))}
              dataKey="arousalPct"
              color="var(--color-chart-1)"
              formatValue={(v) => `${v.toFixed(0)}%`}
            />
          </div>

          {/* Nights with arousal data */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Nights with Arousal Data
              </CardTitle>
              <CardDescription>
                Click a night to see detailed analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>PLMI</TableHead>
                    <TableHead>PLMAI</TableHead>
                    <TableHead>Arousal Rate</TableHead>
                    <TableHead>Avg HR Spike</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arousalNights.map((n) => (
                    <TableRow
                      key={n.night_date}
                      className="cursor-pointer"
                      onClick={() => navigate(`/nights/${n.night_date}`)}
                    >
                      <TableCell className="font-medium">
                        {formatDate(n.night_date)}
                      </TableCell>
                      <TableCell>
                        {n.summary && <PlmiBadge value={n.summary.plmi} />}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {n.arousal_summary!.plmai}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {n.arousal_summary!.arousal_percentage}%
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {n.arousal_summary!.mean_magnitude_bpm > 0
                          ? `${n.arousal_summary!.mean_magnitude_bpm.toFixed(1)} bpm`
                          : "-"}
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
