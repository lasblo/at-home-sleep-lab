import { useNavigate } from "react-router-dom"
import { useSessions, useActiveSession } from "@/features/sessions/hooks/use-sessions"
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
import { Moon, ArrowRight, Settings, Heart } from "lucide-react"
import { ErrorState } from "@/shared/components/error-state"
import { formatDate, formatDuration } from "@/shared/lib/utils"

function ActiveSessionBanner({ session, showTime }: { session: { id: string; started_at: string }; showTime?: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-3 rounded-lg border border-chart-1/30 bg-chart-1/5 p-4">
      <div className="size-3 animate-pulse rounded-full bg-chart-1" />
      <span className="font-medium">Sleep session in progress</span>
      {showTime && (
        <Badge variant="outline" className="tabular-nums">
          {new Date(session.started_at).toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", hour12: false,
          })}
        </Badge>
      )}
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
  const { data: sessions, isLoading, isError, refetch } = useSessions()
  const { data: active } = useActiveSession()

  if (isError) {
    return <ErrorState title="Failed to load dashboard" retry={refetch} />
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    )
  }

  const analyzed = (sessions ?? []).filter((s) => s.status === "analyzed")
  const hasHR = analyzed.some((s) => s.hr_enabled)
  const hasSessions = sessions && sessions.length > 0

  if (!hasSessions) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Dashboard" description="Sleep health overview" />

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

  const totalHours = analyzed.reduce((sum, s) => sum + (s.total_hours ?? 0), 0)

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Dashboard" description="Sleep health overview" />

      {active && <ActiveSessionBanner session={active} showTime />}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Sessions"
          value={sessions!.length.toString()}
          description={`${analyzed.length} analyzed`}
        />
        <StatCard
          label="Total Hours"
          value={`${totalHours.toFixed(0)}h`}
          description={analyzed.length > 0 ? `avg ${formatDuration(totalHours / analyzed.length)}` : ""}
        />
        {hasHR && (
          <StatCard
            label="HR Sessions"
            value={analyzed.filter((s) => s.hr_enabled).length.toString()}
            description="with cardiac data"
          />
        )}
      </div>

      {/* Recent sessions */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent Sessions</h2>
        {sessions!.slice(0, 5).map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/sessions/${s.id}`)}
            className="flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent/50"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{formatDate(s.night_date)}</span>
              {s.total_hours != null && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatDuration(s.total_hours)}
                </span>
              )}
            </div>
            <Badge
              variant="secondary"
              className={
                s.status === "analyzed"
                  ? "bg-severity-normal/15 text-severity-normal text-[10px]"
                  : s.status === "recording"
                    ? "text-[10px]"
                    : "text-[10px]"
              }
            >
              {s.status === "analyzed" ? "Analyzed" : s.status === "recording" ? "Recording" : s.status}
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => navigate("/sessions")}>
          View all sessions
          <ArrowRight data-icon="inline-end" />
        </Button>
        {hasHR && (
          <Button variant="outline" onClick={() => navigate("/heart-rate")}>
            <Heart data-icon="inline-start" />
            Heart rate analysis
          </Button>
        )}
      </div>
    </div>
  )
}
