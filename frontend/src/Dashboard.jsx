import { useRef, useEffect, useState } from 'react'

function plmiColor(plmi) {
  if (plmi < 5) return '#22c55e'
  if (plmi < 15) return '#f59e0b'
  if (plmi < 25) return '#f97316'
  return '#ef4444'
}

function plmiSeverity(plmi) {
  if (plmi < 5) return 'Normal'
  if (plmi < 15) return 'Mild'
  if (plmi < 25) return 'Moderate'
  return 'Severe'
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// --- PLMI Trend Chart (Canvas2D) ---
function PLMITrendChart({ nights, onSelectNight }) {
  const canvasRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nights.length === 0) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const pad = { top: 20, right: 30, bottom: 35, left: 50 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top - pad.bottom

    ctx.clearRect(0, 0, w, h)

    // Y-axis: PLMI range
    const scored = nights.filter(n => n.summary)
    if (scored.length === 0) return

    const maxPLMI = Math.max(50, ...scored.map(n => n.summary.plmi)) * 1.1

    // Reference lines
    const refs = [5, 15, 25]
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 0.5
    for (const threshold of refs) {
      const y = pad.top + chartH * (1 - threshold / maxPLMI)
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(w - pad.right, y)
      ctx.stroke()

      ctx.fillStyle = 'var(--text-dim)'
      ctx.font = '9px ui-monospace, monospace'
      ctx.textAlign = 'right'
      ctx.fillText(threshold.toString(), pad.left - 6, y + 3)
    }
    ctx.setLineDash([])

    // Y-axis label
    ctx.fillStyle = 'var(--text-dim)'
    ctx.font = '9px ui-monospace, monospace'
    ctx.textAlign = 'right'
    ctx.fillText('0', pad.left - 6, pad.top + chartH + 3)

    // X positions
    const xStep = scored.length > 1 ? chartW / (scored.length - 1) : chartW / 2

    // Connect dots with line
    if (scored.length > 1) {
      ctx.beginPath()
      scored.forEach((n, i) => {
        const x = pad.left + i * xStep
        const y = pad.top + chartH * (1 - n.summary.plmi / maxPLMI)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Dots
    scored.forEach((n, i) => {
      const x = pad.left + (scored.length > 1 ? i * xStep : chartW / 2)
      const y = pad.top + chartH * (1 - n.summary.plmi / maxPLMI)
      const isHovered = hovered === i

      ctx.beginPath()
      ctx.arc(x, y, isHovered ? 7 : 5, 0, Math.PI * 2)
      ctx.fillStyle = plmiColor(n.summary.plmi)
      ctx.fill()
      ctx.strokeStyle = 'var(--bg)'
      ctx.lineWidth = 2
      ctx.stroke()

      // PLMI value above dot
      ctx.fillStyle = '#fff'
      ctx.font = `${isHovered ? 'bold' : 'normal'} 11px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.fillText(n.summary.plmi.toFixed(1), x, y - 10)

      // Date below
      ctx.fillStyle = 'var(--text-dim)'
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(formatDate(n.night_date), x, pad.top + chartH + 16)
    })
  }, [nights, hovered])

  const handleClick = (e) => {
    const scored = nights.filter(n => n.summary)
    if (scored.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pad = { left: 50, right: 30 }
    const chartW = rect.width - pad.left - pad.right
    const xStep = scored.length > 1 ? chartW / (scored.length - 1) : chartW / 2

    let closest = 0
    let minDist = Infinity
    scored.forEach((_, i) => {
      const dx = Math.abs(x - (pad.left + (scored.length > 1 ? i * xStep : chartW / 2)))
      if (dx < minDist) { minDist = dx; closest = i }
    })
    if (minDist < 30) {
      onSelectNight(scored[closest].night_date)
    }
  }

  const handleMove = (e) => {
    const scored = nights.filter(n => n.summary)
    if (scored.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pad = { left: 50, right: 30 }
    const chartW = rect.width - pad.left - pad.right
    const xStep = scored.length > 1 ? chartW / (scored.length - 1) : chartW / 2

    let closest = -1
    let minDist = Infinity
    scored.forEach((_, i) => {
      const dx = Math.abs(x - (pad.left + (scored.length > 1 ? i * xStep : chartW / 2)))
      if (dx < minDist) { minDist = dx; closest = i }
    })
    setHovered(minDist < 30 ? closest : null)
  }

  return (
    <div style={styles.chartContainer}>
      <div style={styles.chartTitle}>PLMI Trend</div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 200, display: 'block', cursor: 'pointer' }}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
      />
    </div>
  )
}

// --- Night Card ---
function NightCard({ night, onClick }) {
  const s = night.summary
  if (!s) return null

  return (
    <div style={styles.card} onClick={() => onClick(night.night_date)}>
      <div style={styles.cardHeader}>
        <span style={styles.cardDate}>{formatDate(night.night_date)}</span>
        <span style={{ ...styles.plmiBadge, background: plmiColor(s.plmi) }}>
          {s.plmi} PLMI — {plmiSeverity(s.plmi)}
        </span>
      </div>
      <div style={styles.cardStats}>
        <span><strong>{s.plm_count}</strong> PLMs</span>
        <span><strong>{s.series_count}</strong> series</span>
        <span><strong>{s.body_movements || 0}</strong> body moves</span>
        <span><strong>{night.total_hours}</strong>h recorded</span>
      </div>
      {night.hourly_distribution && (
        <HourlyMiniBar hourly={night.hourly_distribution} />
      )}
    </div>
  )
}

// --- Mini hourly bar chart for cards ---
function HourlyMiniBar({ hourly }) {
  const canvasRef = useRef(null)

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
    const maxCount = Math.max(1, ...hourly.map(b => b.total_count))
    const barW = w / hourly.length
    const gap = 1

    ctx.clearRect(0, 0, w, h)

    hourly.forEach((bucket, i) => {
      const x = i * barW + gap
      const bw = barW - gap * 2

      // PLM bar (red)
      const plmH = (bucket.plm_count / maxCount) * h
      ctx.fillStyle = 'rgba(239, 68, 68, 0.7)'
      ctx.fillRect(x, h - plmH, bw, plmH)

      // Other movement bar (amber, stacked on top of PLM)
      const otherH = ((bucket.other_count + bucket.body_count) / maxCount) * h
      ctx.fillStyle = 'rgba(245, 158, 11, 0.4)'
      ctx.fillRect(x, h - plmH - otherH, bw, otherH)
    })
  }, [hourly])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: 24, display: 'block', marginTop: 6 }}
    />
  )
}

// --- Main Dashboard ---
export default function Dashboard({ nights, onSelectNight }) {
  const scored = nights.filter(n => n.summary)

  // Compute rolling averages if enough data
  let avgPLMI = null
  if (scored.length > 0) {
    avgPLMI = scored.reduce((sum, n) => sum + n.summary.plmi, 0) / scored.length
  }

  return (
    <div style={styles.root}>
      {/* Summary strip */}
      {avgPLMI != null && (
        <div style={styles.summaryStrip}>
          <span style={styles.summaryItem}>
            <strong style={{ color: plmiColor(avgPLMI), fontSize: 16 }}>{avgPLMI.toFixed(1)}</strong>
            <span style={styles.summaryLabel}>Avg PLMI</span>
          </span>
          <span style={styles.summaryItem}>
            <strong>{scored.length}</strong>
            <span style={styles.summaryLabel}>{scored.length === 1 ? 'Night' : 'Nights'}</span>
          </span>
          <span style={styles.summaryItem}>
            <strong>{scored.reduce((sum, n) => sum + n.summary.plm_count, 0)}</strong>
            <span style={styles.summaryLabel}>Total PLMs</span>
          </span>
          <span style={styles.summaryItem}>
            <strong>{scored.reduce((sum, n) => sum + n.total_hours, 0).toFixed(1)}h</strong>
            <span style={styles.summaryLabel}>Total Recorded</span>
          </span>
        </div>
      )}

      {/* PLMI Trend Chart */}
      <PLMITrendChart nights={nights} onSelectNight={onSelectNight} />

      {/* Night cards */}
      <div style={styles.cardList}>
        {scored.length === 0 ? (
          <div style={styles.empty}>No processed nights yet. Process videos to see analytics.</div>
        ) : (
          scored.map(n => (
            <NightCard key={n.night_date} night={n} onClick={onSelectNight} />
          ))
        )}
      </div>
    </div>
  )
}

const styles = {
  root: {
    flex: 1,
    overflow: 'auto',
    padding: 24,
  },
  summaryStrip: {
    display: 'flex',
    gap: 32,
    marginBottom: 20,
    padding: '12px 16px',
    background: 'var(--surface)',
    borderRadius: 8,
    border: '1px solid var(--border)',
  },
  summaryItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    fontFamily: 'var(--mono)',
    fontSize: 13,
  },
  summaryLabel: {
    fontSize: 10,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
  },
  chartContainer: {
    background: 'var(--surface)',
    borderRadius: 8,
    border: '1px solid var(--border)',
    padding: '12px 16px',
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 11,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '12px 16px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardDate: {
    fontWeight: 600,
    fontSize: 14,
  },
  plmiBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 4,
    fontFamily: 'var(--mono)',
  },
  cardStats: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: 'var(--text-dim)',
    fontFamily: 'var(--mono)',
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: 'var(--text-dim)',
    fontSize: 14,
  },
}
