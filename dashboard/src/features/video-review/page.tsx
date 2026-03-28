import { useState, useCallback } from "react"
import { useParams } from "react-router-dom"
import { useVideoResults } from "./hooks/use-video-results"
import { useHeartRate } from "./hooks/use-heart-rate"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { NotFound, ErrorState } from "@/shared/components/error-state"
import { VideoPlayer } from "./components/video-player"
import { MotionTimeline } from "./components/motion-timeline"
import { EventTable } from "./components/event-table"
import { VideoSummary } from "./components/video-summary"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Video } from "lucide-react"
import { formatClockTime } from "@/shared/lib/utils"

export default function VideoReviewPage() {
  const { videoId } = useParams<{ videoId: string }>()
  const { data: results, isLoading, isError, error, refetch } = useVideoResults(videoId)
  const { reanalyze, status } = useProcessing()

  const { data: hrResponse } = useHeartRate(
    results?.video?.start_local,
    results?.video?.end_local
  )

  const [seekTo, setSeekTo] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const handleSeek = useCallback((t: number) => {
    setSeekTo(t)
    setCurrentTime(t)
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[40vh]" />
        <Skeleton className="h-[160px]" />
      </div>
    )
  }

  if (isError) {
    return error?.message === "not_found" ? (
      <NotFound
        title="Video not found"
        description="This video has not been processed yet or does not exist."
        backTo="/sessions"
        backLabel="Back to sessions"
      />
    ) : (
      <ErrorState title="Failed to load video" retry={refetch} />
    )
  }

  if (!results) return null

  const title = results.video
    ? `${formatClockTime(results.video.start_local)} - ${formatClockTime(results.video.end_local)}`
    : "Video Review"

  const subtitle = results.video?.start_local?.slice(0, 10)

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={title} description={subtitle} />

      <VideoSummary
        results={results}
        videoId={videoId!}
        onReanalyze={(id) => reanalyze.mutate(id)}
        processing={status ?? undefined}
      />

      <VideoPlayer
        filename={results.video.filename}
        seekTo={seekTo}
        onTimeUpdate={setCurrentTime}
      />

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="events">
            Events ({results.events.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <MotionTimeline
            motionSignal={results.motion_signal}
            events={results.events}
            videoDuration={results.video_info?.duration_sec || 3600}
            onSeek={handleSeek}
            currentTime={currentTime}
            hrData={hrResponse?.readings ?? null}
            videoStartEpoch={
              results.video?.start_local
                ? new Date(results.video.start_local).getTime() / 1000
                : null
            }
          />
        </TabsContent>
        <TabsContent value="events">
          <EventTable
            events={results.events}
            currentTime={currentTime}
            onSeek={handleSeek}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
