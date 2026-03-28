import { useProcessing } from "@/features/processing/hooks/use-processing"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

export function ProcessingIndicator() {
  const { status } = useProcessing()

  if (!status?.running) return null

  const progress = status.progress
  const values = Object.values(progress)
  const pct =
    values.length > 0
      ? (values.reduce((a, b) => a + (b > 0 ? b : 0), 0) / values.length) *
        100
      : 0

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3" />
        <span>Processing...</span>
        <span className="ml-auto">{Math.round(pct)}%</span>
      </div>
      <Progress value={pct} className="h-1" />
    </div>
  )
}
