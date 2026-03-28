import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useNights } from "@/features/dashboard/hooks/use-nights"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { ProcessButton } from "@/features/processing/components/process-button"
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
import { MoonStar, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDate, formatDuration, formatClockTime } from "@/shared/lib/utils"
import type { Night } from "@/shared/types/api"

type SortKey = "date" | "plmi" | "plms" | "series" | "duration"
type SortDir = "asc" | "desc"

function sortNights(nights: Night[], key: SortKey, dir: SortDir): Night[] {
  const sorted = [...nights]
  sorted.sort((a, b) => {
    let cmp = 0
    switch (key) {
      case "date":
        cmp = a.night_date.localeCompare(b.night_date)
        break
      case "plmi":
        cmp = (a.summary?.plmi ?? -1) - (b.summary?.plmi ?? -1)
        break
      case "plms":
        cmp = (a.summary?.plm_count ?? -1) - (b.summary?.plm_count ?? -1)
        break
      case "series":
        cmp = (a.summary?.series_count ?? -1) - (b.summary?.series_count ?? -1)
        break
      case "duration":
        cmp = a.total_hours - b.total_hours
        break
    }
    return dir === "asc" ? cmp : -cmp
  })
  return sorted
}

export default function NightsPage() {
  const navigate = useNavigate()
  const { data: nights, isLoading } = useNights()
  const { status } = useProcessing()
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const sorted = useMemo(
    () => sortNights(nights ?? [], sortKey, sortDir),
    [nights, sortKey, sortDir]
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "date" ? "desc" : "desc")
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  if (!nights || nights.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Nights">
          <ProcessButton />
        </PageHeader>
        <Empty className="min-h-[400px]">
          <EmptyMedia variant="icon">
            <MoonStar />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No nights recorded</EmptyTitle>
            <EmptyDescription>
              Process videos to see your night-by-night analysis.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const SortableHead = ({
    label,
    sortKeyName,
  }: {
    label: string
    sortKeyName: SortKey
  }) => (
    <TableHead>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => toggleSort(sortKeyName)}
      >
        {label}
        <ArrowUpDown data-icon="inline-end" />
      </Button>
    </TableHead>
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Nights"
        description={`${nights.length} night${nights.length !== 1 ? "s" : ""} recorded`}
      >
        <ProcessButton />
      </PageHeader>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Date" sortKeyName="date" />
              <SortableHead label="PLMI" sortKeyName="plmi" />
              <SortableHead label="PLMs" sortKeyName="plms" />
              <SortableHead label="Series" sortKeyName="series" />
              <TableHead>Body</TableHead>
              <SortableHead label="Duration" sortKeyName="duration" />
              <TableHead>Time</TableHead>
              <TableHead>Arousal</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((night) => {
              const s = night.summary
              const progress = status?.progress || {}
              const isProcessing =
                status?.running &&
                night.video_ids.some(
                  (id) => id in progress && progress[id] < 1
                )

              return (
                <TableRow
                  key={night.night_date}
                  className="cursor-pointer"
                  onClick={() => navigate(`/nights/${night.night_date}`)}
                >
                  <TableCell className="font-medium">
                    {formatDate(night.night_date)}
                  </TableCell>
                  <TableCell>
                    {s ? <PlmiBadge value={s.plmi} showLabel /> : "-"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s?.plm_count ?? "-"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s?.series_count ?? "-"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s?.body_movements ?? "-"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDuration(night.total_hours)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatClockTime(night.start_local)}-
                    {formatClockTime(night.end_local)}
                  </TableCell>
                  <TableCell>
                    {night.arousal_summary ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {night.arousal_summary.arousal_percentage}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s ? (
                      <Badge
                        variant="secondary"
                        className="bg-severity-normal/15 text-severity-normal text-[10px]"
                      >
                        Analyzed
                      </Badge>
                    ) : isProcessing ? (
                      <Badge variant="secondary" className="text-[10px]">
                        <Spinner className="mr-1" />
                        Processing
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
