import type { Night, ProcessingStatus } from "@/shared/types/api"
import { NightCard } from "./night-card"

interface NightsGridProps {
  nights: Night[]
  processing?: ProcessingStatus
}

export function NightsGrid({ nights, processing }: NightsGridProps) {
  const sorted = [...nights].sort((a, b) =>
    b.night_date.localeCompare(a.night_date)
  )

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((night) => (
        <NightCard
          key={night.night_date}
          night={night}
          processing={processing}
        />
      ))}
    </div>
  )
}
