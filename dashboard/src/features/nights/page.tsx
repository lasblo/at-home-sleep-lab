import { useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useNightDetail } from "./hooks/use-night-detail"
import { useVideoResults } from "@/features/video-review/hooks/use-video-results"
import { useHeartRate } from "@/features/video-review/hooks/use-heart-rate"
import { useProcessing } from "@/features/processing/hooks/use-processing"
import { PageHeader } from "@/shared/components/page-header"
import { NightStatsBar } from "./components/night-stats-bar"
import { HourlyChart } from "./components/hourly-chart"
import { SegmentList } from "./components/segment-list"
import { SegmentSwitcher } from "./components/segment-switcher"
import { VideoPlayer } from "@/features/video-review/components/video-player"
import { MotionTimeline } from "@/features/video-review/components/motion-timeline"
import { EventTable } from "@/features/video-review/components/event-table"
import { VideoSummary } from "@/features/video-review/components/video-summary"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw } from "lucide-react"
import { formatFullDate } from "@/shared/lib/utils"

export default function NightDetailPage() {
  const { date, videoId: urlVideoId } = useParams<{
    date: string
    videoId?: string
  }>()
  const navigate = useNavigate()
  const { data: night, isLoading } = useNightDetail(date)
  const { isRunning, reprocessNight, reanalyze, status } = useProcessing()

  // Video selection: from URL param or local state
  const [localVideoId, setLocalVideoId] = useState<string | null>(null)
  const selectedVideoId = urlVideoId || localVideoId

  const { data: videoResults } = useVideoResults(selectedVideoId ?? undefined)
  const selectedVideo = night?.videos?.find((v) => v.id === selectedVideoId)
  const { data: hrResponse } = useHeartRate(
    selectedVideo?.start_local,
    selectedVideo?.end_local
  )

  const [seekTo, setSeekTo] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const handleSeek = useCallback((t: number) => {
    setSeekTo(t)
    setCurrentTime(t)
  }, [])

  const handleSelectVideo = useCallback(
    (id: string) => {
      if (urlVideoId) {
        navigate(`/nights/${date}/${id}`)
      } else {
        setLocalVideoId(id)
      }
      setSeekTo(null)
      setCurrentTime(0)
    },
    [date, navigate, urlVideoId]
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="col-span-2 h-[240px]" />
          <Skeleton className="h-[240px]" />
        </div>
      </div>
    )
  }

  if (!night) return null

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={formatFullDate(date!)}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reprocessNight.mutate(date!)}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <Spinner data-icon="inline-start" />
              Processing...
            </>
          ) : (
            <>
              <RefreshCw data-icon="inline-start" />
              Reprocess Night
            </>
          )}
        </Button>
      </PageHeader>

      <NightStatsBar night={night} />

      {/* Charts + segments when no video selected */}
      {!selectedVideoId && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            {night.hourly_distribution && (
              <HourlyChart hourly={night.hourly_distribution} />
            )}
          </div>
          <SegmentList
            videos={night.videos || []}
            selectedId={selectedVideoId ?? undefined}
            onSelect={handleSelectVideo}
          />
        </div>
      )}

      {/* Video review panel */}
      {selectedVideoId && (
        <div className="flex flex-col gap-3">
          <SegmentSwitcher
            videos={night.videos || []}
            selectedId={selectedVideoId}
            onSelect={handleSelectVideo}
          />

          {videoResults && selectedVideo ? (
            <>
              <VideoSummary
                results={videoResults}
                videoId={selectedVideoId}
                onReanalyze={(id) => reanalyze.mutate(id)}
                processing={status ?? undefined}
              />

              <VideoPlayer
                filename={selectedVideo.filename}
                seekTo={seekTo}
                onTimeUpdate={setCurrentTime}
              />

              <Tabs defaultValue="timeline">
                <TabsList>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="events">
                    Events ({videoResults.events.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="timeline">
                  <MotionTimeline
                    motionSignal={videoResults.motion_signal}
                    events={videoResults.events}
                    videoDuration={
                      videoResults.video_info?.duration_sec || 3600
                    }
                    onSeek={handleSeek}
                    currentTime={currentTime}
                    hrData={hrResponse?.readings ?? null}
                    videoStartEpoch={
                      videoResults.video?.start_local
                        ? new Date(videoResults.video.start_local).getTime() /
                          1000
                        : null
                    }
                  />
                </TabsContent>
                <TabsContent value="events">
                  <EventTable
                    events={videoResults.events}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                  />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading video results...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
