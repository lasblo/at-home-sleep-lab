import { useNavigate } from "react-router-dom"
import { useSessions } from "./hooks/use-sessions"
import { PageHeader } from "@/shared/components/page-header"
import { PlmiBadge } from "@/shared/components/plmi-badge"
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
import { Spinner } from "@/components/ui/spinner"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { CalendarDays } from "lucide-react"
import { ErrorState } from "@/shared/components/error-state"
import { formatDate, formatDuration } from "@/shared/lib/utils"

const statusBadge: Record<string, React.ReactNode> = {
  recording: (
    <Badge variant="secondary" className="text-[10px]">
      <Spinner className="mr-1" />
      Recording
    </Badge>
  ),
  processing: (
    <Badge variant="secondary" className="text-[10px]">
      <Spinner className="mr-1" />
      Processing
    </Badge>
  ),
  analyzed: (
    <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal text-[10px]">
      Analyzed
    </Badge>
  ),
  failed: (
    <Badge variant="destructive" className="text-[10px]">
      Failed
    </Badge>
  ),
}

export default function SessionsPage() {
  const navigate = useNavigate()
  const { data: sessions, isLoading, isError, refetch } = useSessions()

  if (isError) {
    return <ErrorState title="Failed to load sessions" retry={refetch} />
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Sessions" />
        <Empty className="min-h-[400px]">
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No sessions yet</EmptyTitle>
            <EmptyDescription>
              Start a sleep session from the sidebar to begin recording.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Sessions"
        description={`${sessions.length} sleep session${sessions.length !== 1 ? "s" : ""}`}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>HR</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => navigate(`/sessions/${s.id}`)}
              >
                <TableCell className="font-medium">
                  {formatDate(s.night_date)}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {new Date(s.started_at).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </TableCell>
                <TableCell className="tabular-nums">
                  {s.total_hours ? formatDuration(s.total_hours) : "-"}
                </TableCell>
                <TableCell>
                  {s.hr_enabled ? (
                    <Badge variant="secondary" className="text-[10px]">
                      WHOOP
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {statusBadge[s.status] || (
                    <Badge variant="outline" className="text-[10px]">
                      {s.status}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
