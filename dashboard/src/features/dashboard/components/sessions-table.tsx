import { useNavigate } from "react-router-dom"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { formatDate, formatDuration } from "@/shared/lib/utils"
import type { DashboardSession } from "@/shared/types/api"

interface SessionsTableProps {
  sessions: DashboardSession[]
  hasArousalData: boolean
}

export function SessionsTable({
  sessions,
  hasArousalData,
}: SessionsTableProps) {
  const navigate = useNavigate()

  const sorted = [...sessions].sort((a, b) =>
    b.night_date.localeCompare(a.night_date)
  )

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>PLMI</TableHead>
            <TableHead className="text-right">PLMs</TableHead>
            <TableHead className="text-right">Series</TableHead>
            <TableHead className="text-right">Body</TableHead>
            {hasArousalData && (
              <TableHead className="text-right">Arousal</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((s) => (
            <TableRow
              key={s.session_id}
              className="cursor-pointer"
              onClick={() => navigate(`/sessions/${s.session_id}`)}
            >
              <TableCell className="font-medium">
                {formatDate(s.night_date)}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatDuration(s.total_hours)}
              </TableCell>
              <TableCell>
                <PlmiBadge value={s.plmi} showLabel />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.plm_count}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.series_count}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.body_movements}
              </TableCell>
              {hasArousalData && (
                <TableCell className="text-right tabular-nums">
                  {s.arousal_pct != null ? `${s.arousal_pct}%` : "-"}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
