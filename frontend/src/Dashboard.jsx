import { useRef, useEffect, useState, useMemo } from 'react'

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

function formatTime(isoStr) {
  if (!isoStr) return '--:--'
  return isoStr.slice(11, 16)
}

// --- Reusable canvas line chart ---
function LineChart({ data, yKey, label, color, height = 140, thresholds, formatY, onClickPoint }) {
  const canvasRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width, h = rect.height
    const pad = { top: 16, right: 16, bottom: 28, left: 40 }
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom

    ctx.clearRect(0, 0, w, h)

    const vals = data.map(d => d[yKey])
    const maxY = Math.max(...vals, ...(thresholds || []).map(t => t.value)) * 1.15 || 1
    const xStep = data.length > 1 ? cw / (data.length - 1) : cw / 2

    // Threshold lines
    if (thresholds) {
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 0.5
      for (const t of thresholds) {
        const y = pad.top + ch * (1 - t.value / maxY)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.font = '8px ui-monospace, monospace'
        ctx.textAlign = 'right'
        ctx.fillText(t.label || t.value.toString(), pad.left - 4, y + 3)
      }
      ctx.setLineDash([])
    }

    // Line
    if (data.length > 1) {
      ctx.beginPath()
      data.forEach((d, i) => {
        const x = pad.left + (data.length > 1 ? i * xStep : cw / 2)
        const y = pad.top + ch * (1 - d[yKey] / maxY)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      // Gradient fill
      const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch)
      gradient.addColorStop(0, color + '30')
      gradient.addColorStop(1, color + '05')
      ctx.lineTo(pad.left + (data.length - 1) * xStep, pad.top + ch)
      ctx.lineTo(pad.left, pad.top + ch)
      ctx.closePath()
      ctx.fillStyle = gradient
      ctx.fill()

      ctx.beginPath()
      data.forEach((d, i) => {
        const x = pad.left + i * xStep
        const y = pad.top + ch * (1 - d[yKey] / maxY)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Dots + labels
    data.forEach((d, i) => {
      const x = pad.left + (data.length > 1 ? i * xStep : cw / 2)
      const y = pad.top + ch * (1 - d[yKey] / maxY)
      const isHov = hovered === i

      ctx.beginPath()
      ctx.arc(x, y, isHov ? 5 : 3, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      if (isHov) {
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(formatY ? formatY(d[yKey]) : d[yKey].toFixed(1), x, y - 8)
      }

      // X label
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '8px system-ui, sans-serif'
      ctx.textAlign = 'center'
      const dateLabel = d.date ? formatDate(d.date).replace(/,.*/,'') : ''
      ctx.fillText(dateLabel, x, pad.top + ch + 14)
    })
  }, [data, yKey, color, hovered, thresholds, formatY])

  const getIdx = (e) => {
    if (!data.length) return -1
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pad = { left: 40, right: 16 }
    const cw = rect.width - pad.left - pad.right
    const xStep = data.length > 1 ? cw / (data.length - 1) : cw / 2
    let closest = -1, minDist = Infinity
    data.forEach((_, i) => {
      const dx = Math.abs(x - (pad.left + (data.length > 1 ? i * xStep : cw / 2)))
      if (dx < minDist) { minDist = dx; closest = i }
    })
    return minDist < 30 ? closest : -1
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', cursor: hovered != null ? 'pointer' : 'default' }}
      onClick={(e) => { const i = getIdx(e); if (i >= 0 && onClickPoint) onClickPoint(data[i]) }}
      onMouseMove={(e) => setHovered(getIdx(e))}
      onMouseLeave={() => setHovered(null)}
    />
  )
}

// --- Stat card (single metric with trend arrow) ---
function StatCard({ label, value, unit, subtext, trend, color }) {
  const trendIcon = trend > 0 ? '↑' : trend < 0 ? '↓' : '→'
  const trendColor = trend > 0 ? '#ef4444' : trend < 0 ? '#22c55e' : 'rgba(255,255,255,0.3)'
  // For sleep duration: up is green, not red
  const isSleepMetric = label.includes('Sleep') || label.includes('Bed') || label.includes('Wake')
  const adjustedTrendColor = isSleepMetric ? (trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : 'rgba(255,255,255,0.3)') : trendColor

  return (
    <div style={S.statCard}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ ...S.statValue, color: color || '#fff' }}>{value}</span>
        {unit && <span style={S.statUnit}>{unit}</span>}
        {trend !== undefined && trend !== null && (
          <span style={{ fontSize: 11, color: adjustedTrendColor, marginLeft: 4 }}>
            {trendIcon} {Math.abs(trend).toFixed(1)}
          </span>
        )}
      </div>
      {subtext && <div style={S.statSubtext}>{subtext}</div>}
    </div>
  )
}

// --- Heatmap: PLM activity by hour of night (averaged across all nights) ---
function HourlyHeatmap({ scored }) {
  const canvasRef = useRef(null)

  // Aggregate hourly data across all nights, aligned by hour offset
  const hourlyAgg = useMemo(() => {
    const maxHours = Math.max(...scored.map(n => (n.hourly_distribution || []).length), 0)
    const agg = []
    for (let h = 0; h < maxHours; h++) {
      let totalPLM = 0, totalOther = 0, count = 0
      for (const n of scored) {
        const hd = n.hourly_distribution || []
        if (h < hd.length) {
          totalPLM += hd[h].plm_count
          totalOther += hd[h].other_count + hd[h].body_count
          count++
        }
      }
      agg.push({
        hour: h,
        avgPLM: count > 0 ? totalPLM / count : 0,
        avgOther: count > 0 ? totalOther / count : 0,
        nights: count,
      })
    }
    return agg
  }, [scored])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hourlyAgg.length) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width, h = rect.height
    const pad = { top: 4, right: 8, bottom: 20, left: 8 }
    const cw = w - pad.left - pad.right
    const ch = h - pad.top - pad.bottom
    const barW = cw / hourlyAgg.length
    const maxPLM = Math.max(1, ...hourlyAgg.map(a => a.avgPLM))

    ctx.clearRect(0, 0, w, h)

    hourlyAgg.forEach((a, i) => {
      const x = pad.left + i * barW
      const bw = barW - 2
      const barH = (a.avgPLM / maxPLM) * ch

      // Color intensity based on PLM count
      const intensity = Math.min(1, a.avgPLM / maxPLM)
      ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + intensity * 0.7})`
      ctx.fillRect(x + 1, pad.top + ch - barH, bw, barH)

      // Hour label
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '8px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${i + 1}h`, x + barW / 2, h - 4)
    })
  }, [hourlyAgg])

  return <canvas ref={canvasRef} style={{ width: '100%', height: 60, display: 'block' }} />
}

// --- Night Card (3 states: ready, processing, pending) ---
function NightCard({ night, onClick, processing }) {
  const s = night.summary
  const total = night.videos_total || night.video_ids?.length || 0
  const processed = night.videos_processed ?? 0
  const progress = processing?.progress || {}
  const videoIds = night.video_ids || []
  const processingCount = videoIds.filter(id => id in progress && progress[id] < 1).length
  const isProcessing = processing?.running && processingCount > 0
  const isReady = !!s
  const dimmed = !isReady

  return (
    <div style={{ ...S.card, ...(dimmed ? S.cardDimmed : {}) }} onClick={() => onClick(night.night_date)}>
      <div style={S.cardHeader}>
        <span style={S.cardDate}>{formatDate(night.night_date)}</span>
        {isReady ? (
          <span style={{ ...S.badge, background: plmiColor(s.plmi) }}>
            {s.plmi} PLMI — {plmiSeverity(s.plmi)}
          </span>
        ) : isProcessing ? (
          <span style={{ ...S.badge, background: '#3b82f6' }}>Processing</span>
        ) : (
          <span style={{ ...S.badge, background: 'rgba(255,255,255,0.1)' }}>Not processed</span>
        )}
      </div>
      {isReady ? (
        <div style={S.cardStats}>
          <span><strong>{s.plm_count}</strong> PLMs</span>
          <span><strong>{s.series_count}</strong> series</span>
          <span><strong>{s.body_movements || 0}</strong> body</span>
          <span>{formatTime(night.start_local)}–{formatTime(night.end_local)}</span>
          <span>{night.total_hours}h</span>
        </div>
      ) : (
        <div style={S.cardStats}>
          <span><strong>{total}</strong> {total === 1 ? 'video' : 'videos'}</span>
          <span>{night.total_hours}h</span>
          {isProcessing && <span style={{ color: '#3b82f6' }}>{processed}/{total} done</span>}
        </div>
      )}
    </div>
  )
}

// --- Main Dashboard ---
export default function Dashboard({ nights, onSelectNight, processing }) {
  const scored = useMemo(() =>
    nights.filter(n => n.summary).sort((a, b) => a.night_date.localeCompare(b.night_date)),
    [nights]
  )
  const sorted = useMemo(() =>
    [...nights].sort((a, b) => b.night_date.localeCompare(a.night_date)),
    [nights]
  )

  // --- Compute all analytics client-side ---
  const analytics = useMemo(() => {
    if (scored.length === 0) return null

    const plmis = scored.map(n => n.summary.plmi)
    const hours = scored.map(n => n.total_hours)
    const plmCounts = scored.map(n => n.summary.plm_count)
    const seriesCounts = scored.map(n => n.summary.series_count)
    const bodyCounts = scored.map(n => n.summary.body_movements || 0)

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length
    const median = arr => { const s = [...arr].sort((a,b) => a-b); const m = Math.floor(s.length/2); return s.length % 2 ? s[m] : (s[m-1]+s[m])/2 }
    const trend = arr => arr.length < 3 ? null : avg(arr.slice(-3)) - avg(arr.slice(0, 3))

    // Bedtime / wake time in decimal hours
    const bedtimes = scored.map(n => {
      const h = parseInt(n.start_local.slice(11, 13))
      const m = parseInt(n.start_local.slice(14, 16))
      return h < 12 ? h + m/60 + 24 : h + m/60 // normalize: 23:00 = 23, 01:00 = 25
    })
    const waketimes = scored.map(n => {
      const h = parseInt(n.end_local.slice(11, 13))
      const m = parseInt(n.end_local.slice(14, 16))
      return h + m/60
    })

    const formatDecimalTime = (dec) => {
      const h = Math.floor(dec % 24)
      const m = Math.round((dec % 1) * 60)
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    }

    // PLM-free hours (hours with 0 PLMs)
    const plmFreeHours = scored.reduce((sum, n) => {
      const hd = n.hourly_distribution || []
      return sum + hd.filter(h => h.plm_count === 0).length
    }, 0)
    const totalHoursRecorded = scored.reduce((sum, n) => {
      const hd = n.hourly_distribution || []
      return sum + hd.length
    }, 0)

    // Worst / best night
    const worstIdx = plmis.indexOf(Math.max(...plmis))
    const bestIdx = plmis.indexOf(Math.min(...plmis))

    // Night-over-night PLMI change
    const recentPLMI = scored.length >= 2 ? plmis[plmis.length - 1] - plmis[plmis.length - 2] : null

    // Data points for charts
    const chartData = scored.map(n => ({
      date: n.night_date,
      plmi: n.summary.plmi,
      plmCount: n.summary.plm_count,
      series: n.summary.series_count,
      body: n.summary.body_movements || 0,
      hours: n.total_hours,
      bedtime: parseInt(n.start_local.slice(11, 13)) + parseInt(n.start_local.slice(14, 16)) / 60,
      waketime: parseInt(n.end_local.slice(11, 13)) + parseInt(n.end_local.slice(14, 16)) / 60,
    }))

    // Average PLMs per series
    const avgPLMsPerSeries = seriesCounts.reduce((a, b) => a + b, 0) > 0
      ? plmCounts.reduce((a, b) => a + b, 0) / seriesCounts.reduce((a, b) => a + b, 0)
      : 0

    // Movement intensity: total events / hour
    const movementIntensity = scored.map(n => n.summary.total_movements / n.total_hours)

    return {
      avgPLMI: avg(plmis),
      medianPLMI: median(plmis),
      plmiTrend: trend(plmis),
      maxPLMI: Math.max(...plmis),
      minPLMI: Math.min(...plmis),
      worstNight: scored[worstIdx]?.night_date,
      bestNight: scored[bestIdx]?.night_date,
      avgHours: avg(hours),
      hoursTrend: trend(hours),
      totalPLMs: plmCounts.reduce((a, b) => a + b, 0),
      totalSeries: seriesCounts.reduce((a, b) => a + b, 0),
      totalBody: bodyCounts.reduce((a, b) => a + b, 0),
      avgBedtime: formatDecimalTime(avg(bedtimes)),
      avgWaketime: formatDecimalTime(avg(waketimes)),
      bedtimeTrend: trend(bedtimes),
      plmFreePercent: totalHoursRecorded > 0 ? (plmFreeHours / totalHoursRecorded * 100) : 0,
      recentPLMIChange: recentPLMI,
      avgPLMsPerSeries: avgPLMsPerSeries,
      avgMovementIntensity: avg(movementIntensity),
      chartData,
    }
  }, [scored])

  if (sorted.length === 0) {
    return <div style={S.root}><div style={S.empty}>No videos found. Add MP4 files to the videos/ directory.</div></div>
  }

  if (!analytics) {
    return (
      <div style={S.root}>
        <div style={S.cardList}>
          {sorted.map(n => <NightCard key={n.night_date} night={n} onClick={onSelectNight} processing={processing} />)}
        </div>
      </div>
    )
  }

  const a = analytics

  return (
    <div style={S.root}>
      {/* Hero stats row */}
      <div style={S.heroRow}>
        <StatCard
          label="Avg PLMI" value={a.avgPLMI.toFixed(1)} color={plmiColor(a.avgPLMI)}
          subtext={plmiSeverity(a.avgPLMI)} trend={a.plmiTrend}
        />
        <StatCard
          label="Median PLMI" value={a.medianPLMI.toFixed(1)} color={plmiColor(a.medianPLMI)}
          subtext={`Range: ${a.minPLMI.toFixed(0)}–${a.maxPLMI.toFixed(0)}`}
        />
        <StatCard
          label="Avg Sleep" value={a.avgHours.toFixed(1)} unit="h"
          subtext={`${a.avgBedtime} → ${a.avgWaketime}`} trend={a.hoursTrend}
        />
        <StatCard
          label="PLM-Free Hours" value={a.plmFreePercent.toFixed(0)} unit="%"
          subtext="of recorded hours"
        />
        <StatCard
          label="Nights Analyzed" value={scored.length}
          subtext={nights.length > scored.length ? `${nights.length - scored.length} pending` : 'all processed'}
        />
      </div>

      {/* Charts grid */}
      <div style={S.chartsGrid}>
        {/* PLMI Trend — full width */}
        <div style={{ ...S.chartBox, gridColumn: '1 / -1' }}>
          <div style={S.chartTitle}>PLMI Trend</div>
          <LineChart
            data={a.chartData} yKey="plmi" color="#ef4444" height={180}
            thresholds={[{value: 5, label: 'Normal'}, {value: 15, label: 'Mild'}, {value: 25, label: 'Moderate'}]}
            onClickPoint={(d) => onSelectNight(d.date)}
          />
        </div>

        {/* PLM Count per night */}
        <div style={S.chartBox}>
          <div style={S.chartTitle}>PLM Count per Night</div>
          <LineChart
            data={a.chartData} yKey="plmCount" color="#f97316" height={120}
            onClickPoint={(d) => onSelectNight(d.date)}
          />
        </div>

        {/* Series count */}
        <div style={S.chartBox}>
          <div style={S.chartTitle}>PLM Series per Night</div>
          <LineChart
            data={a.chartData} yKey="series" color="#a78bfa" height={120}
            formatY={v => v.toFixed(0)}
            onClickPoint={(d) => onSelectNight(d.date)}
          />
        </div>

        {/* Sleep Duration */}
        <div style={S.chartBox}>
          <div style={S.chartTitle}>Sleep Duration</div>
          <LineChart
            data={a.chartData} yKey="hours" color="#3b82f6" height={120}
            formatY={v => v.toFixed(1) + 'h'}
            onClickPoint={(d) => onSelectNight(d.date)}
          />
        </div>

        {/* Body movements */}
        <div style={S.chartBox}>
          <div style={S.chartTitle}>Body Movements per Night</div>
          <LineChart
            data={a.chartData} yKey="body" color="#f59e0b" height={120}
            formatY={v => v.toFixed(0)}
            onClickPoint={(d) => onSelectNight(d.date)}
          />
        </div>

        {/* Average PLM distribution across the night */}
        <div style={{ ...S.chartBox, gridColumn: '1 / -1' }}>
          <div style={S.chartTitle}>Average PLM Activity by Hour of Night</div>
          <HourlyHeatmap scored={scored} />
        </div>
      </div>

      {/* Secondary stats */}
      <div style={S.secondaryStats}>
        <StatCard label="Total PLMs" value={a.totalPLMs.toLocaleString()} subtext={`across ${scored.length} nights`} />
        <StatCard label="Total Series" value={a.totalSeries} subtext={`avg ${a.avgPLMsPerSeries.toFixed(1)} PLMs/series`} />
        <StatCard label="Body Movements" value={a.totalBody} subtext={`avg ${(a.totalBody / scored.length).toFixed(0)}/night`} />
        <StatCard label="Movement Rate" value={a.avgMovementIntensity.toFixed(1)} unit="/h" subtext="all events per hour" />
        <StatCard label="Best Night" value={a.minPLMI.toFixed(1)} unit="PLMI" subtext={a.bestNight ? formatDate(a.bestNight) : ''} color="#22c55e" />
        <StatCard label="Worst Night" value={a.maxPLMI.toFixed(1)} unit="PLMI" subtext={a.worstNight ? formatDate(a.worstNight) : ''} color="#ef4444" />
      </div>

      {/* Night cards */}
      <div style={S.sectionTitle}>All Nights</div>
      <div style={S.cardList}>
        {sorted.map(n => (
          <NightCard key={n.night_date} night={n} onClick={onSelectNight} processing={processing} />
        ))}
      </div>
    </div>
  )
}

const S = {
  root: { flex: 1, overflow: 'auto', padding: 24 },
  heroRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: 'var(--mono)',
    lineHeight: 1.2,
  },
  statUnit: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'var(--mono)',
  },
  statSubtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'var(--mono)',
    marginTop: 1,
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 10,
    marginBottom: 20,
  },
  chartBox: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
  },
  chartTitle: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 6,
  },
  secondaryStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
    marginTop: 4,
  },
  cardList: { display: 'flex', flexDirection: 'column', gap: 6 },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardDate: { fontWeight: 600, fontSize: 13 },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 4,
    fontFamily: 'var(--mono)',
  },
  cardDimmed: { opacity: 0.5, borderStyle: 'dashed' },
  cardStats: {
    display: 'flex',
    gap: 14,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'var(--mono)',
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
  },
}
