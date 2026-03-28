import { useQuery } from "@tanstack/react-query"
import type { HRResponse } from "@/shared/types/api"

export function useHeartRate(start: string | undefined, end: string | undefined) {
  return useQuery<HRResponse>({
    queryKey: ["hr", "range", start, end],
    queryFn: async () => {
      const res = await fetch(
        `/api/hr/range?start=${encodeURIComponent(start!)}&end=${encodeURIComponent(end!)}`
      )
      if (!res.ok) throw new Error("Failed to fetch heart rate data")
      return res.json()
    },
    enabled: !!start && !!end,
  })
}
