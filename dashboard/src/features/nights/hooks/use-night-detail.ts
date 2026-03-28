import { useQuery } from "@tanstack/react-query"
import type { NightDetail } from "@/shared/types/api"

export function useNightDetail(date: string | undefined) {
  return useQuery<NightDetail>({
    queryKey: ["nights", date],
    queryFn: async () => {
      const res = await fetch(`/api/nights/${date}`)
      if (!res.ok) throw new Error("Failed to fetch night detail")
      return res.json()
    },
    enabled: !!date,
  })
}
