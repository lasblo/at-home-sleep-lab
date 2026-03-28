import { useQuery } from "@tanstack/react-query"
import type { VideoInfo } from "@/shared/types/api"

type VideoWithStatus = VideoInfo & { processed: boolean }

export function useVideos() {
  return useQuery<VideoWithStatus[]>({
    queryKey: ["videos"],
    queryFn: async () => {
      const res = await fetch("/api/results")
      if (!res.ok) throw new Error("Failed to fetch videos")
      return res.json()
    },
  })
}
