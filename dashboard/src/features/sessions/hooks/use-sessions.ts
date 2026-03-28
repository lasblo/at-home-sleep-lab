import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Session, SessionDetail } from "@/shared/types/api"

export function useSessions() {
  return useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions")
      if (!res.ok) throw new Error("Failed to fetch sessions")
      return res.json()
    },
  })
}

export function useActiveSession() {
  return useQuery<Session | null>({
    queryKey: ["sessions", "active"],
    queryFn: async () => {
      const res = await fetch("/api/sessions/active")
      if (!res.ok) throw new Error("Failed to fetch active session")
      const data = await res.json()
      return data.session || null
    },
    refetchInterval: (query) => {
      return query.state.data?.status === "recording" ? 5000 : false
    },
  })
}

export function useSessionDetail(sessionId: string | undefined) {
  return useQuery<SessionDetail>({
    queryKey: ["sessions", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "Failed to fetch session detail")
      return res.json()
    },
    enabled: !!sessionId,
    retry: (count, error) => {
      if (error.message === "not_found") return false
      return count < 2
    },
    refetchInterval: (query) => {
      return query.state.data?.status === "recording" ? 10000 : false
    },
  })
}

export function useStartSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sessions/start", { method: "POST" })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success("Sleep session started")
        queryClient.invalidateQueries({ queryKey: ["sessions"] })
      }
    },
    onError: () => toast.error("Failed to start session"),
  })
}

export function useStopSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sessions/stop", { method: "POST" })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success("Session stopped. Analyzing results...")
        queryClient.invalidateQueries({ queryKey: ["sessions"] })
      }
    },
    onError: () => toast.error("Failed to stop session"),
  })
}
