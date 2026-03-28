import { useQuery } from "@tanstack/react-query"
import type { Night } from "@/shared/types/api"

export function useNights() {
  return useQuery<Night[]>({
    queryKey: ["nights"],
    queryFn: async () => {
      const res = await fetch("/api/nights")
      if (!res.ok) throw new Error("Failed to fetch nights")
      return res.json()
    },
  })
}
