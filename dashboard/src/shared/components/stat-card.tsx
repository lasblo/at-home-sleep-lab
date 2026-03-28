import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Info } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number
  description?: string
  trend?: { value: number; label?: string }
  tooltip?: string
  className?: string
  valueClassName?: string
}

export function StatCard({
  label,
  value,
  description,
  trend,
  tooltip,
  className,
  valueClassName,
}: StatCardProps) {
  return (
    <Card className={cn("gap-2", className)}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {label}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 cursor-help text-muted-foreground/50 transition-colors hover:text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <p className="text-xs leading-relaxed">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", valueClassName)}>
          {typeof value === "number" ? value.toFixed(1) : value}
        </CardTitle>
      </CardHeader>
      {(description || trend) && (
        <CardContent>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {trend && (
              <>
                {trend.value >= 0 ? (
                  <TrendingUp data-icon className="text-severity-severe" />
                ) : (
                  <TrendingDown data-icon className="text-severity-normal" />
                )}
                <span>
                  {trend.value >= 0 ? "+" : ""}
                  {trend.value.toFixed(1)}
                </span>
              </>
            )}
            {description && <span>{description}</span>}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
