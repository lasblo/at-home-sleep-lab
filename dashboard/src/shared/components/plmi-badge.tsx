import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { plmiSeverity, plmiLabel } from "@/shared/lib/utils"

const severityClasses: Record<string, string> = {
  normal: "bg-severity-normal/15 text-severity-normal border-severity-normal/25",
  mild: "bg-severity-mild/15 text-severity-mild border-severity-mild/25",
  moderate: "bg-severity-moderate/15 text-severity-moderate border-severity-moderate/25",
  severe: "bg-severity-severe/15 text-severity-severe border-severity-severe/25",
}

interface PlmiBadgeProps {
  value: number
  showLabel?: boolean
  className?: string
}

export function PlmiBadge({ value, showLabel = false, className }: PlmiBadgeProps) {
  const severity = plmiSeverity(value)
  return (
    <Badge
      variant="outline"
      className={cn(severityClasses[severity], className)}
    >
      {value.toFixed(1)}
      {showLabel && ` ${plmiLabel(value)}`}
    </Badge>
  )
}
