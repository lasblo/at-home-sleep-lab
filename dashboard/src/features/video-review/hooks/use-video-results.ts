import { useQuery } from "@tanstack/react-query"
import type { VideoResults } from "@/shared/types/api"

export function useVideoResults(videoId: string | undefined) {
  return useQuery<VideoResults>({
    queryKey: ["results", videoId],
    queryFn: async () => {
      const res = await fetch(`/api/results/${videoId}`)
      if (!res.ok)
        throw new Error(
          res.status === 404 ? "not_found" : "Failed to fetch video results"
        )
      return res.json()
    },
    enabled: !!videoId,
    retry: (count, error) => {
      if (error.message === "not_found") return false
      return count < 2
    },
  })
}
