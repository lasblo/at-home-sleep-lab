import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Label, LabelStats } from "@/shared/types/api"

export function useLabels(videoId: string | undefined) {
  return useQuery<Label[]>({
    queryKey: ["labels", videoId],
    queryFn: async () => {
      const res = await fetch(`/api/labels/${videoId}`)
      if (!res.ok) throw new Error("Failed to fetch labels")
      return res.json()
    },
    enabled: !!videoId,
  })
}

export function useLabelStats() {
  return useQuery<LabelStats[]>({
    queryKey: ["label-stats"],
    queryFn: async () => {
      const res = await fetch("/api/labels/stats")
      if (!res.ok) throw new Error("Failed to fetch label stats")
      return res.json()
    },
  })
}

export function useCreateLabel(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (label: {
      timestamp_sec: number
      category: string
      duration_sec?: number
      notes?: string
    }) => {
      const res = await fetch(`/api/labels/${videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(label),
      })
      if (!res.ok) throw new Error("Failed to create label")
      return res.json() as Promise<Label>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", videoId] })
      qc.invalidateQueries({ queryKey: ["label-stats"] })
    },
  })
}

export function useUpdateLabel(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      labelId,
      ...updates
    }: {
      labelId: number
      timestamp_sec?: number
      duration_sec?: number
      category?: string
      notes?: string
    }) => {
      const res = await fetch(`/api/labels/item/${labelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error("Failed to update label")
      return res.json() as Promise<Label>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", videoId] })
    },
  })
}

export function useDeleteLabel(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (labelId: number) => {
      const res = await fetch(`/api/labels/item/${labelId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete label")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", videoId] })
      qc.invalidateQueries({ queryKey: ["label-stats"] })
    },
  })
}
