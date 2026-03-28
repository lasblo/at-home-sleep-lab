import { useRef, useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { formatTime } from "@/shared/lib/utils"
import type { SleepEvent } from "@/shared/types/api"

interface EventTableProps {
  events: SleepEvent[]
  currentTime: number
  onSeek: (time: number) => void
}

function typeBadge(e: SleepEvent) {
  if (e.is_plm) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">PLM</Badge>
  if (e.movement_type === "body") return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">BODY</Badge>
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">MOV</Badge>
}

function arousalCell(e: SleepEvent) {
  if (!e.arousal) return <span className="text-muted-foreground">-</span>
  if (e.arousal.has_arousal) {
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
        +{e.arousal.magnitude_bpm?.toFixed(0)}bpm
      </Badge>
    )
  }
  if (e.is_plm) return <span className="text-muted-foreground text-[10px]">none</span>
  return <span className="text-muted-foreground">-</span>
}

function DebugInfo({ event }: { event: SleepEvent }) {
  const d = event.debug
  if (!d) return null

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 p-3 text-[10px] tabular-nums text-muted-foreground">
      <div>Signal: {d.raw_localized.toFixed(3)} &rarr; {d.smoothed.toFixed(3)}</div>
      <div>Baseline: {d.baseline.toFixed(3)} | Above: {d.above_baseline.toFixed(3)}</div>
      <div>
        Peak: {d.normalized_height.toFixed(4)}
        <span className={d.normalized_height >= 0.02 ? "text-severity-normal" : "text-severity-severe"}>
          {d.normalized_height >= 0.02 ? " pass" : " fail"}
        </span>
      </div>
      <div>
        SV: {event.spatial_variance?.toFixed(2)}
        <span className={d.sv_passed ? "text-severity-normal" : "text-severity-severe"}>
          {d.sv_passed ? " pass" : " fail"}
        </span>
      </div>
      <div>Body: {d.body_classification}{d.body_reason ? ` (${d.body_reason})` : ""}</div>
      <div>PLM: {d.plm_eligible ? "eligible" : "ineligible"}{d.plm_reject_reason ? ` (${d.plm_reject_reason})` : ""}</div>
      {d.interval_to_prev_sec != null && (
        <div>
          Interval: {d.interval_to_prev_sec.toFixed(1)}s
          <span className={d.interval_valid ? "text-severity-normal" : "text-severity-severe"}>
            {d.interval_valid ? " valid" : ` (${d.interval_reason})`}
          </span>
        </div>
      )}
      <div>Series: {d.plm_series_reason}</div>
      {event.arousal?.has_arousal && (
        <>
          <div>HR baseline: {event.arousal.pre_baseline_hr?.toFixed(0)} bpm</div>
          <div>HR peak: {event.arousal.peak_hr} bpm (+{event.arousal.magnitude_bpm?.toFixed(1)} / {((event.arousal.magnitude_pct ?? 0) * 100).toFixed(0)}%)</div>
          <div>Onset delay: {event.arousal.onset_delay_sec?.toFixed(1)}s | Duration: {event.arousal.duration_sec?.toFixed(1)}s</div>
          <div>Threshold: {event.arousal.threshold_used} | Strict: {event.arousal.strict_threshold_met ? "yes" : "no"}</div>
        </>
      )}
    </div>
  )
}

export function EventTable({ events, currentTime, onSeek }: EventTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const activeRef = useRef<HTMLTableRowElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Active event: last event where timestamp <= currentTime + 0.5
  const activeIdx = events.reduce(
    (acc, e, i) => (e.timestamp_sec <= currentTime + 0.5 ? i : acc),
    -1
  )

  // Auto-scroll to active row
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const row = activeRef.current
      const container = scrollRef.current
      const rowRect = row.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      if (
        rowRect.top < containerRect.top ||
        rowRect.bottom > containerRect.bottom
      ) {
        row.scrollIntoView({ block: "center", behavior: "smooth" })
      }
    }
  }, [activeIdx])

  return (
    <ScrollArea className="h-[300px]" ref={scrollRef}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[70px]">Time</TableHead>
            <TableHead className="w-[55px]">Dur</TableHead>
            <TableHead className="w-[50px]">Type</TableHead>
            <TableHead className="w-[50px]">Series</TableHead>
            <TableHead className="w-[55px]">Amp</TableHead>
            <TableHead className="w-[45px]">SV</TableHead>
            <TableHead className="w-[70px]">Arousal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e, i) => (
            <Collapsible
              key={e.id}
              open={expandedId === e.id}
              onOpenChange={(open) => setExpandedId(open ? e.id : null)}
              asChild
            >
              <>
                <CollapsibleTrigger asChild>
                  <TableRow
                    ref={i === activeIdx ? activeRef : undefined}
                    className={cn(
                      "cursor-pointer text-xs tabular-nums",
                      i === activeIdx && "bg-primary/10",
                      e.is_plm && i !== activeIdx && "bg-chart-1/5"
                    )}
                    onClick={() => onSeek(e.timestamp_sec)}
                  >
                    <TableCell>{formatTime(e.timestamp_sec)}</TableCell>
                    <TableCell>{e.duration_sec.toFixed(1)}s</TableCell>
                    <TableCell>{typeBadge(e)}</TableCell>
                    <TableCell>{e.series_id ?? "-"}</TableCell>
                    <TableCell>{(e.amplitude * 100).toFixed(1)}</TableCell>
                    <TableCell>{e.spatial_variance?.toFixed(2) ?? "-"}</TableCell>
                    <TableCell>{arousalCell(e)}</TableCell>
                  </TableRow>
                </CollapsibleTrigger>
                <CollapsibleContent asChild>
                  <TableRow>
                    <TableCell colSpan={7} className="p-0 bg-muted/30">
                      <DebugInfo event={e} />
                    </TableCell>
                  </TableRow>
                </CollapsibleContent>
              </>
            </Collapsible>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
