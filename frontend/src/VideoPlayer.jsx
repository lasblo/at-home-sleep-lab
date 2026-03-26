import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'

const SPEEDS = [1, 2, 4, 10]

const styles = {
  container: {
    flex: 1,
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    position: 'relative',
  },
  videoWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    cursor: 'pointer',
  },
  video: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 12px',
    background: 'rgba(0,0,0,0.85)',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    fontSize: 13,
    fontFamily: 'var(--mono)',
    color: '#ccc',
    flexShrink: 0,
  },
  btn: {
    background: 'none',
    border: 'none',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 16,
    padding: '2px 6px',
    borderRadius: 4,
    lineHeight: 1,
  },
  speedBtn: (active) => ({
    background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
    border: 'none',
    color: active ? '#fff' : '#aaa',
    cursor: 'pointer',
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 4,
    fontFamily: 'var(--mono)',
    fontWeight: active ? 700 : 400,
  }),
  time: {
    fontSize: 12,
    minWidth: 90,
  },
  spacer: { flex: 1 },
  shortcutHint: {
    fontSize: 10,
    color: '#666',
    marginLeft: 8,
  },
}

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const VideoPlayer = forwardRef(function VideoPlayer({ filename, seekTo, onTimeUpdate }, ref) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useImperativeHandle(ref, () => ({
    get currentTime() { return videoRef.current?.currentTime || 0 },
    seek(t) { if (videoRef.current) videoRef.current.currentTime = t },
  }))

  useEffect(() => {
    if (seekTo != null && videoRef.current) {
      videoRef.current.currentTime = seekTo
    }
  }, [seekTo])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
      // Mute above 2x to avoid chipmunk audio
      videoRef.current.muted = speed > 2
    }
  }, [speed])

  const handleTimeUpdate = useCallback(() => {
    const t = videoRef.current?.currentTime || 0
    setCurrentTime(t)
    onTimeUpdate?.(t)
  }, [onTimeUpdate])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }, [])

  const cycleSpeed = useCallback((dir) => {
    setSpeed(prev => {
      const idx = SPEEDS.indexOf(prev)
      const next = idx + dir
      if (next >= 0 && next < SPEEDS.length) return SPEEDS[next]
      return prev
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Don't capture if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const v = videoRef.current
      if (!v) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          v.currentTime = Math.max(0, v.currentTime - 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 5)
          break
        case 'ArrowUp':
          e.preventDefault()
          cycleSpeed(1)
          break
        case 'ArrowDown':
          e.preventDefault()
          cycleSpeed(-1)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePlay, cycleSpeed])

  return (
    <div style={styles.container}>
      <div style={styles.videoWrap} onClick={togglePlay}>
        <video
          ref={videoRef}
          src={`/api/videos/${encodeURIComponent(filename)}`}
          style={styles.video}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </div>
      <div style={styles.controls}>
        <button style={styles.btn} onClick={togglePlay} title="Space">
          {playing ? '⏸' : '▶'}
        </button>
        <div style={styles.time}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div style={styles.spacer} />
        {SPEEDS.map(s => (
          <button
            key={s}
            style={styles.speedBtn(speed === s)}
            onClick={() => setSpeed(s)}
            title={`${s}x speed${s > 2 ? ' (muted)' : ''}`}
          >
            {s}x
          </button>
        ))}
        <span style={styles.shortcutHint}>Space ▶⏸ · ←→ ±5s · ↑↓ speed</span>
      </div>
    </div>
  )
})

export default VideoPlayer
