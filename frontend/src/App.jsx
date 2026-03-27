import { useState, useEffect, useRef, useCallback } from 'react'
import Dashboard from './Dashboard'
import NightDetail from './NightDetail'
import VideoPlayer from './VideoPlayer'
import Timeline from './Timeline'
import VideoSummary from './VideoSummary'
import EventList from './EventList'

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 20px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginRight: 12,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  headerSpacer: { flex: 1 },
  processBtn: {
    padding: '6px 14px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
  },
  bottomPanel: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '40%',
    minHeight: 180,
    flexShrink: 0,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-dim)',
    fontSize: 14,
  },
  progressBar: {
    width: 80,
    height: 3,
    background: 'var(--border)',
    borderRadius: 2,
    overflow: 'hidden',
    marginLeft: 8,
  },
  progressFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'var(--accent)',
    transition: 'width 0.3s',
  }),
}

export default function App() {
  // View state: 'dashboard' or 'night'
  const [view, setView] = useState('dashboard')
  const [nights, setNights] = useState([])
  const [selectedNightDate, setSelectedNightDate] = useState(null)
  const [nightDetail, setNightDetail] = useState(null)

  // Per-video state (when drilling into a video from night detail)
  const [selectedVideoId, setSelectedVideoId] = useState(null)
  const [videoResults, setVideoResults] = useState(null)
  const [seekTo, setSeekTo] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)

  // Processing
  const [processing, setProcessing] = useState({ running: false, progress: {} })
  const pollRef = useRef(null)

  // Fetch nights list
  const fetchNights = useCallback(async () => {
    try {
      const res = await fetch('/api/nights')
      if (res.ok) setNights(await res.json())
    } catch { /* server not ready */ }
  }, [])

  // Polling for processing status
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/process/status')
        const data = await res.json()
        setProcessing(data)
        if (!data.running) {
          clearInterval(pollRef.current)
          pollRef.current = null
          fetchNights()
        }
      } catch { /* server not ready */ }
    }, 2000)
  }, [fetchNights])

  // Init
  useEffect(() => {
    fetchNights()
    fetch('/api/process/status')
      .then(r => r.json())
      .then(data => {
        setProcessing(data)
        if (data.running) startPolling()
      })
      .catch(() => {})
  }, [])

  // Load night detail when selected
  useEffect(() => {
    if (!selectedNightDate) { setNightDetail(null); return }
    fetch(`/api/nights/${selectedNightDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(setNightDetail)
      .catch(() => setNightDetail(null))
  }, [selectedNightDate])

  // Load video results when selected
  useEffect(() => {
    if (!selectedVideoId) { setVideoResults(null); return }
    fetch(`/api/results/${selectedVideoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setVideoResults)
      .catch(() => setVideoResults(null))
  }, [selectedVideoId])

  const handleSelectNight = (nightDate) => {
    setSelectedNightDate(nightDate)
    setSelectedVideoId(null)
    setVideoResults(null)
    setView('night')
  }

  const handleBack = () => {
    setView('dashboard')
    setSelectedNightDate(null)
    setSelectedVideoId(null)
    setVideoResults(null)
  }

  const handleSelectVideo = (videoId) => {
    setSelectedVideoId(videoId)
    setSeekTo(null)
    setCurrentTime(0)
  }

  const startProcessing = async () => {
    await fetch('/api/process', { method: 'POST' })
    setProcessing({ running: true, progress: {} })
    startPolling()
  }

  const handleSeek = useCallback((t) => {
    setSeekTo(t)
    setCurrentTime(t)
  }, [])

  const overallProgress = (() => {
    const vals = Object.values(processing.progress)
    if (vals.length === 0) return 0
    return (vals.reduce((a, b) => a + b, 0) / vals.length) * 100
  })()

  const selectedVideo = nightDetail?.videos?.find(v => v.id === selectedVideoId)

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle} onClick={handleBack}>PLMS Detector</div>
        <div style={styles.headerSpacer} />
        {processing.running && (
          <div style={styles.progressBar}>
            <div style={styles.progressFill(overallProgress)} />
          </div>
        )}
        <button style={styles.processBtn} onClick={startProcessing} disabled={processing.running}>
          {processing.running ? 'Processing…' : 'Process All Videos'}
        </button>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {view === 'dashboard' ? (
          <Dashboard nights={nights} onSelectNight={handleSelectNight} />
        ) : (
          <div style={styles.main}>
            {/* Night analytics panel */}
            <NightDetail
              nightData={nightDetail}
              onBack={handleBack}
              onSelectVideo={handleSelectVideo}
              selectedVideoId={selectedVideoId}
            />

            {/* Video player + timeline + events (when a segment is selected) */}
            {videoResults && selectedVideo ? (
              <>
                <VideoPlayer
                  filename={selectedVideo.filename}
                  seekTo={seekTo}
                  onTimeUpdate={setCurrentTime}
                />
                <div style={styles.bottomPanel}>
                  <VideoSummary results={videoResults} />
                  <Timeline
                    motionSignal={videoResults.motion_signal}
                    events={videoResults.events}
                    videoDuration={videoResults.video_info?.duration_sec || 3600}
                    onSeek={handleSeek}
                    currentTime={currentTime}
                  />
                  <EventList
                    events={videoResults.events}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                  />
                </div>
              </>
            ) : (
              !nightDetail ? (
                <div style={styles.empty}>Loading night data…</div>
              ) : (
                <div style={styles.empty}>Select a video segment above to review detections</div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
