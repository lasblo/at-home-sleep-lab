import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  useActiveSession,
  useStartSession,
  useStopSession,
} from "../hooks/use-sessions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Play, Square, Clock, Settings } from "lucide-react"

function formatElapsed(startedAt: string): string {
  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const diffMs = now - start
  const hours = Math.floor(diffMs / 3600000)
  const mins = Math.floor((diffMs % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function SessionControl() {
  const navigate = useNavigate()
  const { data: active, isLoading } = useActiveSession()
  const startSession = useStartSession()
  const stopSession = useStopSession()
  const { data: unifiSettings } = useQuery({
    queryKey: ["settings", "unifi"],
    queryFn: async () => {
      const res = await fetch("/api/settings/unifi")
      if (!res.ok) return null
      return res.json()
    },
  })
  const cameraConfigured = !!unifiSettings?.camera_id

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3">
        <Spinner className="size-4" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    )
  }

  if (active) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-chart-1/30 bg-chart-1/5 p-3">
        <div className="flex items-center gap-2">
          <div className="size-2 animate-pulse rounded-full bg-chart-1" />
          <span className="text-xs font-medium">Recording</span>
          <Badge variant="outline" className="ml-auto text-[10px] tabular-nums">
            <Clock className="mr-0.5" />
            {formatElapsed(active.started_at)}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={() => stopSession.mutate()}
            disabled={stopSession.isPending}
          >
            {stopSession.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Square data-icon="inline-start" />
            )}
            Stop Session
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/sessions/${active.id}`)}
          >
            View
          </Button>
        </div>
      </div>
    )
  }

  if (!cameraConfigured) {
    return (
      <Button
        variant="outline"
        className="w-full"
        onClick={() => navigate("/settings")}
      >
        <Settings data-icon="inline-start" />
        Set Up Camera
      </Button>
    )
  }

  return (
    <Button
      className="w-full"
      onClick={() => startSession.mutate()}
      disabled={startSession.isPending}
    >
      {startSession.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Play data-icon="inline-start" />
      )}
      Start Sleep Session
    </Button>
  )
}
