import { Badge } from "@/components/ui/badge"
import { PlmiBadge } from "@/shared/components/plmi-badge"
import { formatDuration } from "@/shared/lib/utils"
import type { NightDetail } from "@/shared/types/api"

interface NightStatsBarProps {
  night: NightDetail
}

export function NightStatsBar({ night }: NightStatsBarProps) {
  const s = night.summary
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PlmiBadge value={s.plmi} showLabel />
      <Badge variant="secondary">
        <span className="font-semibold text-chart-1">{s.plm_count}</span>
        &nbsp;PLMs
      </Badge>
      <Badge variant="secondary">
        <span className="font-semibold">{s.series_count}</span>
        &nbsp;Series
      </Badge>
      <Badge variant="secondary">
        <span className="font-semibold">{s.body_movements || 0}</span>
        &nbsp;Body
      </Badge>
      {night.arousal_summary && (
        <>
          <PlmiBadge value={night.arousal_summary.plmai} />
          <Badge variant="secondary">
            {night.arousal_summary.arousal_percentage}% Arousal
          </Badge>
        </>
      )}
      <Badge variant="outline">{formatDuration(night.total_hours)}</Badge>
    </div>
  )
}
