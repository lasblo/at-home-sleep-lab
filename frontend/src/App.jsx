import { useState, useEffect, useRef, useCallback } from 'react'
import Summary from './Summary'
import VideoPlayer from './VideoPlayer'
import Timeline from './Timeline'
import VideoSummary from './VideoSummary'
import EventList from './EventList'
import Sparkline from './Sparkline'

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
  },
  headerStats: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    fontFamily: 'var(--mono)',
    alignItems: 'center',
  },
  headerStat: (color) => ({
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  }),
  headerVal: (color) => ({
    fontWeight: 700,
    fontSize: 15,
    color: color || 'var(--text)',
  }),
  headerLabel: {
    fontSize: 10,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
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
    overflow: 'hidden',
  },
  sidebar: {
    width: 240,
    minWidth: 240,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarLabel: {
    padding: '8px 14px 4px',
    fontSize: 10,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  videoList: {
    flex: 1,
    overflowY: 'auto',
  },
  videoItem: (active) => ({
    padding: '8px 14px',
    cursor: 'pointer',
    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
    color: active ? '#fff' : 'var(--text)',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    fontSize: 12,
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.15s',
  }),
  videoLabel: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--text-dim)',
    marginTop: 1,
  },
  itemProgress: {
    marginTop: 4,
    height: 3,
    background: 'var(--border)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  itemProgressFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'var(--accent)',
    transition: 'width 0.5s',
  }),
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
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

function plmiColor(plmi) {
  if (plmi < 5) return '#22c55e'
  if (plmi < 15) return '#f59e0b'
  if (plmi < 25) return '#f97316'
  return '#ef4444'
}

export default function App() {
  const [videos, setVideos] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [results, setResults] = useState(null)
  const [combined, setCombined] = useState(null)
  const [processing, setProcessing] = useState({ running: false, progress: {} })
  const [seekTo, setSeekTo] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [sparklines, setSparklines] = useState({})
  const pollRef = useRef(null)

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch('/api/results')
      const data = await res.json()
      setVideos(data)
      if (!selectedId) {
        const first = data.find(v => v.processed)
        if (first) setSelectedId(first.id)
      }
      // Fetch sparkline data for processed videos
      for (const v of data) {
        if (v.processed) {
          fetch(`/api/results/${v.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.motion_signal) {
                setSparklines(prev => ({ ...prev, [v.id]: d.motion_signal }))
              }
            })
            .catch(() => {})
        }
      }
    } catch { /* server not ready */ }
    try {
      const res = await fetch('/api/results/combined')
      if (res.ok) setCombined(await res.json())
    } catch { /* no results yet */ }
  }, [selectedId])

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
          fetchResults()
        }
      } catch { /* server not ready */ }
    }, 2000)
  }, [fetchResults])

  useEffect(() => {
    fetchResults()
    fetch('/api/process/status')
      .then(r => r.json())
      .then(data => {
        setProcessing(data)
        if (data.running) startPolling()
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId) { setResults(null); return }
    fetch(`/api/results/${selectedId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setResults)
      .catch(() => setResults(null))
  }, [selectedId])

  const startProcessing = async () => {
    await fetch('/api/process', { method: 'POST' })
    setProcessing({ running: true, progress: {} })
    startPolling()
  }

  const overallProgress = (() => {
    const vals = Object.values(processing.progress)
    if (vals.length === 0) return 0
    return (vals.reduce((a, b) => a + b, 0) / vals.length) * 100
  })()

  const selectedVideo = videos.find(v => v.id === selectedId)

  const handleSeek = useCallback((t) => {
    setSeekTo(t)
    setCurrentTime(t)
  }, [])

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>PLMS Detector</div>
        {combined && (
          <div style={styles.headerStats}>
            <div style={styles.headerStat()}>
              <span style={styles.headerVal(plmiColor(combined.plmi))}>{combined.plmi}</span>
              <span style={styles.headerLabel}>PLMI</span>
            </div>
            <div style={styles.headerStat()}>
              <span style={styles.headerVal('#ef4444')}>{combined.plm_count}</span>
              <span style={styles.headerLabel}>PLMs</span>
            </div>
            <div style={styles.headerStat()}>
              <span style={styles.headerVal()}>{combined.series_count}</span>
              <span style={styles.headerLabel}>Series</span>
            </div>
            <div style={styles.headerStat()}>
              <span style={styles.headerVal()}>{combined.total_hours}h</span>
              <span style={styles.headerLabel}>Recorded</span>
            </div>
          </div>
        )}
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
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarLabel}>Segments</div>
          <div style={styles.videoList}>
            {videos.map(v => (
              <div
                key={v.id}
                style={styles.videoItem(v.id === selectedId)}
                onClick={() => v.processed && setSelectedId(v.id)}
              >
                <div>{v.start_local?.slice(11, 19)} — {v.end_local?.slice(11, 19)}</div>
                <div style={styles.videoLabel}>
                  {(() => {
                    const pct = processing.progress?.[v.id]
                    if (pct != null && pct > 0 && pct < 1) return `Analyzing… ${Math.round(pct * 100)}%`
                    if (pct === 1 || v.processed) return `${(v.duration_sec / 60).toFixed(0)} min`
                    if (processing.running && pct === 0) return 'Queued'
                    return 'Not processed'
                  })()}
                </div>
                {(() => {
                  const pct = processing.progress?.[v.id]
                  if (pct != null && pct > 0 && pct < 1) return (
                    <div style={styles.itemProgress}>
                      <div style={styles.itemProgressFill(pct * 100)} />
                    </div>
                  )
                  return null
                })()}
                {sparklines[v.id] && (
                  <Sparkline
                    values={sparklines[v.id].values}
                    sampleRate={sparklines[v.id].sample_rate_hz}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={styles.main}>
          {results && selectedVideo ? (
            <>
              <VideoPlayer
                filename={selectedVideo.filename}
                seekTo={seekTo}
                onTimeUpdate={setCurrentTime}
              />
              <div style={styles.bottomPanel}>
                <VideoSummary results={results} />
                <Timeline
                  motionSignal={results.motion_signal}
                  events={results.events}
                  videoDuration={results.video_info?.duration_sec || 3600}
                  onSeek={handleSeek}
                  currentTime={currentTime}
                />
                <EventList
                  events={results.events}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                />
              </div>
            </>
          ) : (
            <div style={styles.empty}>
              {videos.length === 0
                ? 'Click "Process All Videos" to start analysis'
                : 'Select a processed video from the sidebar'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
