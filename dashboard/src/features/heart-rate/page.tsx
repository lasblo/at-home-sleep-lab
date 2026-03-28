import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useSessions } from "@/features/sessions/hooks/use-sessions"
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
import { Heart, Wifi, WifiOff } from "lucide-react"
import { ErrorState } from "@/shared/components/error-state"
import { formatDate } from "@/shared/lib/utils"

export default function HeartRatePage() {
  const navigate = useNavigate()
  const {
    data: sessions,
    isLoading: sessionsLoading,
    isError,
    refetch,
  } = useSessions()
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
      (sessions ?? []).filter((s) => s.hr_enabled && s.status === "analyzed"),
    [sessions]
  )

  const isConnected =
    hrStatus?.status === "connected" || hrStatus?.status === "streaming"

  if (isError) {
    return <ErrorState title="Failed to load heart rate data" retry={refetch} />
  }

  if (sessionsLoading) {
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
        description="WHOOP cardiac arousal monitoring"
      />

      {/* Live status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">WHOOP Status</CardTitle>
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

      {hrSessions.length === 0 ? (
        <Empty className="min-h-[300px]">
          <EmptyMedia variant="icon">
            <Heart />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No heart rate data</EmptyTitle>
            <EmptyDescription>
              Enable WHOOP in Settings and run a sleep session to collect
              cardiac arousal data.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Sessions with HR"
              value={hrSessions.length.toString()}
              description="sleep sessions"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sessions with HR Data</CardTitle>
              <CardDescription>Click to view session details</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hrSessions.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sessions/${s.id}`)}
                    >
                      <TableCell className="font-medium">
                        {formatDate(s.night_date)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {s.total_hours ? `${s.total_hours.toFixed(1)}h` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-severity-normal/15 text-[10px] text-severity-normal"
                        >
                          Analyzed
                        </Badge>
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
