import { useRef, useEffect, useState } from 'react'

function plmiColor(plmi) {
  if (plmi < 5) return '#22c55e'
  if (plmi < 15) return '#f59e0b'
  if (plmi < 25) return '#f97316'
  return '#ef4444'
}

// --- Hourly Distribution Bar Chart ---
function HourlyChart({ hourly, onBarClick }) {
  const canvasRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  const pad = { top: 16, right: 16, bottom: 28, left: 40 }

  const getBarIndex = (e) => {
    if (!hourly?.length) return -1
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartW = rect.width - pad.left - pad.right
    const barW = chartW / hourly.length
    const idx = Math.floor((x - pad.left) / barW)
    return idx >= 0 && idx < hourly.length ? idx : -1
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hourly?.length) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top - pad.bottom

    ctx.clearRect(0, 0, w, h)

    const maxCount = Math.max(1, ...hourly.map(b => b.plm_count + b.other_count + b.body_count))
    const barW = chartW / hourly.length
    const gap = 2

    // Y-axis labels
    ctx.fillStyle = 'var(--text-dim)'
    ctx.font = '9px ui-monospace, monospace'
    ctx.textAlign = 'right'
    const ySteps = [0, Math.round(maxCount / 2), maxCount]
    for (const val of ySteps) {
      const y = pad.top + chartH * (1 - val / maxCount)
      ctx.fillText(val.toString(), pad.left - 6, y + 3)
      if (val > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(pad.left, y)
        ctx.lineTo(w - pad.right, y)
        ctx.stroke()
      }
    }

    // Bars
    hourly.forEach((bucket, i) => {
      const x = pad.left + i * barW + gap
      const bw = barW - gap * 2
      const isHov = hovered === i

      // PLM bar (red)
      const plmH = (bucket.plm_count / maxCount) * chartH
      ctx.fillStyle = isHov ? 'rgba(239, 68, 68, 1)' : 'rgba(239, 68, 68, 0.8)'
      ctx.fillRect(x, pad.top + chartH - plmH, bw, plmH)

      // Other movement bar (amber, stacked)
      const otherTotal = bucket.other_count + bucket.body_count
      const otherH = (otherTotal / maxCount) * chartH
      ctx.fillStyle = isHov ? 'rgba(245, 158, 11, 0.7)' : 'rgba(245, 158, 11, 0.5)'
      ctx.fillRect(x, pad.top + chartH - plmH - otherH, bw, otherH)

      // X-axis label
      ctx.fillStyle = isHov ? '#fff' : 'var(--text-dim)'
      ctx.font = isHov ? 'bold 9px ui-monospace, monospace' : '9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(bucket.label, x + bw / 2, pad.top + chartH + 14)

      // Count on top of bar if > 0
      if (bucket.plm_count > 0) {
        ctx.fillStyle = '#fff'
        ctx.font = '9px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(bucket.plm_count.toString(), x + bw / 2, pad.top + chartH - plmH - otherH - 4)
      }
    })
  }, [hourly, hovered])

  return (
    <div style={styles.chartBox}>
      <div style={styles.chartTitle}>
        Hourly Distribution
        <span style={styles.legend}>
          <span style={{ ...styles.legendDot, background: 'rgba(239,68,68,0.8)' }} /> PLM
          <span style={{ ...styles.legendDot, background: 'rgba(245,158,11,0.5)', marginLeft: 10 }} /> Other
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 180, display: 'block', cursor: hovered != null ? 'pointer' : 'default' }}
        onClick={(e) => {
          const idx = getBarIndex(e)
          if (idx >= 0 && onBarClick) onBarClick(hourly[idx])
        }}
        onMouseMove={(e) => setHovered(getBarIndex(e) >= 0 ? getBarIndex(e) : null)}
        onMouseLeave={() => setHovered(null)}
      />
    </div>
  )
}

// --- Video Segment List ---
function SegmentList({ videos, selectedId, onSelectVideo, horizontal }) {
  if (horizontal) {
    return (
      <div style={styles.segmentRow}>
        {videos.map(v => (
          <div
            key={v.id}
            style={styles.segmentChip(v.id === selectedId)}
            onClick={() => onSelectVideo(v.id)}
          >
            {v.start_local?.slice(11, 16)}–{v.end_local?.slice(11, 16)}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={styles.segmentBox}>
      <div style={styles.chartTitle}>Video Segments</div>
      <div style={styles.segmentList}>
        {videos.map(v => (
          <div
            key={v.id}
            style={styles.segment(v.id === selectedId)}
            onClick={() => onSelectVideo(v.id)}
          >
            <span style={styles.segmentTime}>
              {v.start_local?.slice(11, 19)} — {v.end_local?.slice(11, 19)}
            </span>
            <span style={styles.segmentDur}>{(v.duration_sec / 60).toFixed(0)} min</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Main NightDetail ---
export default function NightDetail({ nightData, onBack, onSelectVideo, selectedVideoId, processing }) {
  if (!nightData) return null

  const s = nightData.summary
  const isProcessing = processing?.running

  const handleReprocess = () => {
    if (isProcessing) return
    fetch(`/api/reprocess-night/${nightData.night_date}`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.status === 'already_running') alert('Processing already running')
      })
  }

  return (
    <div style={styles.root}>
      {/* Back + Summary bar */}
      <div style={styles.summaryBar}>
        <button style={styles.backBtn} onClick={onBack}>← All Nights</button>
        <span style={styles.nightDate}>
          {new Date(nightData.night_date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
          })}
        </span>
        <div style={styles.stats}>
          <span style={styles.stat}>
            <strong style={{ color: plmiColor(s.plmi), fontSize: 15 }}>{s.plmi}</strong>
            <span style={styles.statLabel}>PLMI</span>
          </span>
          <span style={styles.stat}>
            <strong style={{ color: '#ef4444' }}>{s.plm_count}</strong>
            <span style={styles.statLabel}>PLMs</span>
          </span>
          <span style={styles.stat}>
            <strong>{s.series_count}</strong>
            <span style={styles.statLabel}>Series</span>
          </span>
          <span style={styles.stat}>
            <strong>{s.body_movements || 0}</strong>
            <span style={styles.statLabel}>Body Moves</span>
          </span>
          <span style={styles.stat}>
            <strong>{nightData.total_hours}h</strong>
            <span style={styles.statLabel}>Recorded</span>
          </span>
        </div>
        <button
          style={isProcessing ? styles.reprocessBtnDisabled : styles.reprocessBtn}
          onClick={handleReprocess}
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Reprocess Night'}
        </button>
      </div>

      {/* Charts row — collapse when a video is selected to save space */}
      {!selectedVideoId && (
        <div style={styles.chartsRow}>
          <HourlyChart hourly={nightData.hourly_distribution} onBarClick={(bucket) => {
            // Find the video whose time range contains this hour
            const videos = nightData.videos || []
            const barLabel = bucket.label // e.g. "02:58"
            const barHH = parseInt(barLabel.split(':')[0])
            const barMM = parseInt(barLabel.split(':')[1])
            const match = videos.find(v => {
              const startHH = parseInt((v.start_local || '').slice(11, 13))
              const startMM = parseInt((v.start_local || '').slice(14, 16))
              const endHH = parseInt((v.end_local || '').slice(11, 13))
              const endMM = parseInt((v.end_local || '').slice(14, 16))
              const startMin = startHH * 60 + startMM
              const endMin = endHH * 60 + endMM
              const barMin = barHH * 60 + barMM
              // Handle midnight wrap
              if (endMin > startMin) return barMin >= startMin && barMin < endMin
              return barMin >= startMin || barMin < endMin
            })
            if (match) onSelectVideo(match.id)
          }} />
          <SegmentList
            videos={nightData.videos || []}
            selectedId={selectedVideoId}
            onSelectVideo={onSelectVideo}
          />
        </div>
      )}
      {selectedVideoId && (
        <SegmentList
          videos={nightData.videos || []}
          selectedId={selectedVideoId}
          onSelectVideo={onSelectVideo}
          horizontal
        />
      )}
    </div>
  )
}

const styles = {
  root: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    flexShrink: 0,
  },
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    background: 'var(--surface)',
    borderRadius: 8,
    border: '1px solid var(--border)',
    flexWrap: 'wrap',
  },
  reprocessBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.6)',
    padding: '4px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--mono)',
    whiteSpace: 'nowrap',
  },
  reprocessBtnDisabled: {
    marginLeft: 'auto',
    background: 'none',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.25)',
    padding: '4px 12px',
    borderRadius: 4,
    cursor: 'not-allowed',
    fontSize: 11,
    fontFamily: 'var(--mono)',
    whiteSpace: 'nowrap',
  },
  backBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'var(--sans)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  nightDate: {
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  stats: {
    display: 'flex',
    gap: 16,
    fontFamily: 'var(--mono)',
    fontSize: 12,
    marginLeft: 'auto',
  },
  stat: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  statLabel: {
    fontSize: 9,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
  },
  chartsRow: {
    display: 'flex',
    gap: 12,
  },
  chartBox: {
    flex: 1,
    background: 'var(--surface)',
    borderRadius: 8,
    border: '1px solid var(--border)',
    padding: '10px 14px',
  },
  chartTitle: {
    fontSize: 10,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
  },
  legendDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  segmentBox: {
    width: 220,
    minWidth: 220,
    background: 'var(--surface)',
    borderRadius: 8,
    border: '1px solid var(--border)',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
  },
  segmentList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  segment: (active) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    background: active ? 'rgba(79, 143, 247, 0.12)' : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    fontSize: 11,
    fontFamily: 'var(--mono)',
    transition: 'background 0.15s',
  }),
  segmentTime: {
    color: 'var(--text)',
  },
  segmentDur: {
    color: 'var(--text-dim)',
    fontSize: 10,
  },
  segmentRow: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
    padding: '4px 0',
  },
  segmentChip: (active) => ({
    padding: '3px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--mono)',
    background: active ? 'rgba(79, 143, 247, 0.15)' : 'var(--surface)',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    color: active ? '#fff' : 'var(--text-dim)',
    transition: 'all 0.15s',
  }),
}
