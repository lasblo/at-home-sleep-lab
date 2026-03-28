import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { VideoPlayer } from "@/features/video-review/components/video-player"
import { VideoSelector } from "./components/video-selector"
import { LabelTimeline } from "./components/label-timeline"
import { LabelTable } from "./components/label-table"
import {
  useLabels,
  useLabelStats,
  useCreateLabel,
  useDeleteLabel,
} from "./hooks/use-labels"
import { useVideos } from "./hooks/use-videos"
import { CATEGORIES } from "./categories"
import type { Label } from "@/shared/types/api"

export default function LabelerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const videoId = searchParams.get("video") ?? undefined
  const [seekTo, setSeekTo] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null)
  const currentTimeRef = useRef(0)

  const { data: videos = [] } = useVideos()
  const { data: labelStats = [] } = useLabelStats()
  const { data: labels = [] } = useLabels(videoId)
  const createLabel = useCreateLabel(videoId ?? "")
  const deleteLabel = useDeleteLabel(videoId ?? "")

  const selectedVideo = videos.find((v) => v.id === videoId)

  // Keep ref in sync for keyboard handler
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  const handleSelectVideo = useCallback(
    (id: string) => {
      setSearchParams({ video: id })
      setSeekTo(null)
      setSelectedLabel(null)
    },
    [setSearchParams]
  )

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleSeek = useCallback((time: number) => {
    setSeekTo(time)
    setSelectedLabel(null)
  }, [])

  const handleSelectLabel = useCallback((label: Label) => {
    setSelectedLabel(label)
    setSeekTo(label.timestamp_sec)
  }, [])

  const handleDelete = useCallback(
    (labelId: number) => {
      deleteLabel.mutate(labelId)
      if (selectedLabel?.id === labelId) setSelectedLabel(null)
    },
    [deleteLabel, selectedLabel]
  )

  // Keyboard-driven labeling
  useEffect(() => {
    if (!videoId) return

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      const cat = CATEGORIES.find((c) => c.shortcut === e.key)
      if (cat) {
        e.preventDefault()
        createLabel.mutate({
          timestamp_sec: Math.round(currentTimeRef.current * 10) / 10,
          category: cat.key,
        })
        return
      }

      // Delete selected label with Backspace/Delete
      if ((e.code === "Backspace" || e.code === "Delete") && selectedLabel) {
        e.preventDefault()
        handleDelete(selectedLabel.id)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [videoId, createLabel, selectedLabel, handleDelete])

  const videoDuration = selectedVideo?.duration_sec ?? 0

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Video Labeler</h1>
          <p className="text-sm text-muted-foreground">
            Label movements for ground truth data
          </p>
        </div>
        {labels.length > 0 && (
          <Badge variant="secondary" className="text-sm">
            {labels.length} labels
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Video</CardTitle>
        </CardHeader>
        <CardContent>
          <VideoSelector
            videos={videos}
            labelStats={labelStats}
            selectedId={videoId}
            onSelect={handleSelectVideo}
          />
        </CardContent>
      </Card>

      {selectedVideo && (
        <>
          <Card>
            <CardContent className="overflow-hidden rounded-lg p-0">
              <VideoPlayer
                filename={selectedVideo.filename}
                seekTo={seekTo}
                onTimeUpdate={handleTimeUpdate}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {/* Keyboard shortcuts hint */}
              <div className="mb-4 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <kbd
                    key={cat.key}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
                  >
                    <span
                      className="inline-block size-2 rounded-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-mono">{cat.shortcut}</span>
                    <span className="text-muted-foreground">{cat.label}</span>
                  </kbd>
                ))}
                <Separator orientation="vertical" className="h-6 self-center" />
                <kbd className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
                  <span className="font-mono">Del</span> Remove selected
                </kbd>
              </div>

              <LabelTimeline
                labels={labels}
                duration={videoDuration}
                currentTime={currentTime}
                onSeek={handleSeek}
                onSelect={handleSelectLabel}
                selectedId={selectedLabel?.id ?? null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Labels</CardTitle>
            </CardHeader>
            <CardContent>
              <LabelTable
                labels={labels}
                selectedId={selectedLabel?.id ?? null}
                onSelect={handleSelectLabel}
                onSeek={(t) => setSeekTo(t)}
                onDelete={handleDelete}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
