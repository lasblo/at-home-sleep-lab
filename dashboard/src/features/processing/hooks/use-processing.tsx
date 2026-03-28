import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { ProcessingStatus } from "@/shared/types/api"
import { toast } from "sonner"

async function fetchStatus(): Promise<ProcessingStatus> {
  const res = await fetch("/api/process/status")
  if (!res.ok) throw new Error("Failed to fetch processing status")
  return res.json()
}

export function useProcessing() {
  const queryClient = useQueryClient()

  const { data: status } = useQuery({
    queryKey: ["processing", "status"],
    queryFn: fetchStatus,
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.running ? 2000 : false
    },
  })

  const processAll = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/process", { method: "POST" })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processing", "status"] })
      toast.info("Processing started")
    },
  })

  const reanalyze = useMutation({
    mutationFn: async (videoId: string) => {
      const res = await fetch(`/api/reanalyze/${videoId}`, { method: "POST" })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processing", "status"] })
    },
  })

  const reprocessNight = useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch(`/api/reprocess-night/${date}`, {
        method: "POST",
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processing", "status"] })
      toast.info("Night reprocessing started")
    },
  })

  // Invalidate data when processing completes
  const wasRunning =
    queryClient.getQueryData<ProcessingStatus>(["processing", "status"])
      ?.running ?? false
  if (wasRunning && status && !status.running) {
    queryClient.invalidateQueries({ queryKey: ["nights"] })
    queryClient.invalidateQueries({ queryKey: ["results"] })
    queryClient.invalidateQueries({ queryKey: ["videos"] })
    toast.success("Processing complete")
  }

  return {
    status,
    isRunning: status?.running ?? false,
    processAll,
    reanalyze,
    reprocessNight,
  }
}
