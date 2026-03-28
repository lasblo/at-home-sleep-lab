import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNights } from "@/features/dashboard/hooks/use-nights"
import { PageHeader } from "@/shared/components/page-header"
import { StatCard } from "@/shared/components/stat-card"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { MetricChart } from "@/features/dashboard/components/metric-chart"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
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
import { Heart, Wifi, WifiOff, Play, Square } from "lucide-react"
import { formatDate } from "@/shared/lib/utils"

export default function HeartRatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: nights, isLoading: nightsLoading } = useNights()
  const { data: hrStatus } = useQuery({
    queryKey: ["hr", "status"],
    queryFn: async () => {
      const res = await fetch("/api/hr/status")
      if (!res.ok) throw new Error("Failed to fetch HR status")
      return res.json()
    },
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.status === "connected" ? 5000 : 10000
    },
  })

  const startHR = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hr/start", { method: "POST" })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.status === "already_running") {
        toast.info("HR monitor is already running")
      } else if (data.status === "failed") {
        toast.error(data.error || "Failed to start HR monitor")
      } else {
        toast.success("HR monitor started — scanning for WHOOP device...")
      }
      queryClient.invalidateQueries({ queryKey: ["hr", "status"] })
    },
    onError: () => toast.error("Failed to start HR monitor"),
  })

  const stopHR = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hr/stop", { method: "POST" })
      return res.json()
    },
    onSuccess: () => {
      toast.success("HR monitor stopped")
      queryClient.invalidateQueries({ queryKey: ["hr", "status"] })
    },
    onError: () => toast.error("Failed to stop HR monitor"),
  })

  const isConnected = hrStatus?.status === "connected"
  const isManaged = hrStatus?.managed === true
  const isStarting = hrStatus?.status === "starting"

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

      {/* Connection status + controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">WHOOP Heart Rate Monitor</CardTitle>
          <CardDescription>
            Bluetooth LE connection to your WHOOP band for cardiac arousal
            detection during sleep recordings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {isConnected ? (
              <>
                <Wifi className="size-5 text-severity-normal" />
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
                    <span className="text-lg font-semibold tabular-nums text-chart-3">
                      {hrStatus.hr} bpm
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => stopHR.mutate()}
                  disabled={stopHR.isPending}
                >
                  {stopHR.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Square data-icon="inline-start" />
                  )}
                  Stop Monitoring
                </Button>
              </>
            ) : isStarting || isManaged ? (
              <>
                <Spinner className="size-5" />
                <div className="flex flex-col gap-0.5">
                  <Badge variant="secondary">Scanning...</Badge>
                  <span className="text-xs text-muted-foreground">
                    Looking for WHOOP device via Bluetooth
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => stopHR.mutate()}
                  disabled={stopHR.isPending}
                >
                  <Square data-icon="inline-start" />
                  Stop
                </Button>
              </>
            ) : (
              <>
                <WifiOff className="size-5 text-muted-foreground" />
                <div className="flex flex-col gap-0.5">
                  <Badge variant="outline">Not Connected</Badge>
                  <span className="text-xs text-muted-foreground">
                    Start monitoring to collect heart rate data during sleep.
                    Requires Bluetooth access.
                  </span>
                </div>
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => startHR.mutate()}
                  disabled={startHR.isPending}
                >
                  {startHR.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  Start Monitoring
                </Button>
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
