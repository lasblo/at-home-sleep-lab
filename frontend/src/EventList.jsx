import { useRef, useEffect, useState } from 'react'

const styles = {
  container: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    fontSize: 12,
    fontFamily: 'var(--mono)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    position: 'sticky',
    top: 0,
    background: 'var(--surface)',
    padding: '6px 10px',
    textAlign: 'left',
    color: 'var(--text-dim)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 500,
  },
  row: (isPLM, isActive) => ({
    cursor: 'pointer',
    background: isActive
      ? 'rgba(79, 143, 247, 0.15)'
      : isPLM
        ? 'rgba(239, 68, 68, 0.05)'
        : 'transparent',
    transition: 'background 0.1s',
  }),
  td: {
    padding: '4px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    whiteSpace: 'nowrap',
  },
  plmBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
  },
  movBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
  },
  bodyBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(139, 92, 246, 0.15)',
    color: '#8b5cf6',
  },
  empty: {
    padding: 20,
    textAlign: 'center',
    color: 'var(--text-dim)',
  },
  debugRow: {
    background: 'rgba(0,0,0,0.3)',
  },
  debugCell: {
    padding: '6px 10px 8px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: 10,
    color: 'var(--text-dim)',
    lineHeight: 1.6,
  },
  debugLabel: {
    color: 'rgba(255,255,255,0.35)',
    marginRight: 4,
  },
  debugVal: (pass) => ({
    color: pass === true ? '#22c55e' : pass === false ? '#ef4444' : 'var(--text-dim)',
  }),
}

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function DebugInfo({ debug }) {
  if (!debug) return <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>reanalyze to see debug info</span>

  const d = debug
  return (
    <div>
      <div>
        <span style={styles.debugLabel}>signal:</span>
        raw={d.raw_localized?.toFixed(4)}
        {' → '}smoothed={d.smoothed?.toFixed(4)}
        {' → '}baseline={d.baseline?.toFixed(4)}
        {' → '}above_baseline={d.above_baseline?.toFixed(4)}
      </div>
      <div>
        <span style={styles.debugLabel}>peak:</span>
        <span style={styles.debugVal(d.normalized_height >= 0.02)}>
          height={d.normalized_height?.toFixed(3)} (min 0.02)
        </span>
        {' '}
        <span style={styles.debugVal(d.prominence >= 0.03)}>
          prominence={d.prominence?.toFixed(3)} (min 0.03)
        </span>
      </div>
      <div>
        <span style={styles.debugLabel}>spatial variance:</span>
        <span style={styles.debugVal(d.sv_passed)}>
          sv_passed={d.sv_passed ? 'yes' : 'no'} (threshold {d.sv_threshold})
        </span>
      </div>
      <div>
        <span style={styles.debugLabel}>type:</span>
        {d.body_classification}
        {d.body_reason && <span> — {d.body_reason}</span>}
      </div>
      <div>
        <span style={styles.debugLabel}>PLM eligible:</span>
        <span style={styles.debugVal(d.plm_eligible)}>
          {d.plm_eligible ? 'yes' : 'no'}
        </span>
        {d.plm_reject_reason && <span> — {d.plm_reject_reason}</span>}
      </div>
      {d.interval_to_prev_sec != null && (
        <div>
          <span style={styles.debugLabel}>interval to prev:</span>
          <span style={styles.debugVal(d.interval_valid)}>
            {d.interval_to_prev_sec}s
          </span>
          {d.interval_reason && <span> — {d.interval_reason}</span>}
        </div>
      )}
      <div>
        <span style={styles.debugLabel}>PLM series:</span>
        {d.plm_series_reason}
      </div>
    </div>
  )
}

export default function EventList({ events, currentTime, onSeek }) {
  const containerRef = useRef(null)
  const activeRowRef = useRef(null)
  const [expandedIdx, setExpandedIdx] = useState(null)

  // Find the active event (closest before or at currentTime)
  const activeIdx = (() => {
    if (!events || events.length === 0) return -1
    let best = -1
    for (let i = 0; i < events.length; i++) {
      if (events[i].timestamp_sec <= (currentTime || 0) + 0.5) best = i
      else break
    }
    return best
  })()

  // Auto-scroll to active event
  useEffect(() => {
    if (activeRowRef.current && containerRef.current) {
      const row = activeRowRef.current
      const container = containerRef.current
      const rowTop = row.offsetTop - container.offsetTop
      const rowBottom = rowTop + row.offsetHeight
      const scrollTop = container.scrollTop
      const viewHeight = container.clientHeight

      if (rowTop < scrollTop || rowBottom > scrollTop + viewHeight) {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [activeIdx])

  if (!events || events.length === 0) {
    return <div style={styles.container}><div style={styles.empty}>No events detected</div></div>
  }

  return (
    <div style={styles.container} ref={containerRef}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Time</th>
            <th style={styles.th}>Duration</th>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Series</th>
            <th style={styles.th}>Amplitude</th>
            <th style={styles.th}>SV</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const isBody = e.movement_type === 'body'
            const badge = e.is_plm
              ? <span style={styles.plmBadge}>PLM</span>
              : isBody
                ? <span style={styles.bodyBadge}>BODY</span>
                : <span style={styles.movBadge}>MOV</span>

            return [
              <tr
                key={`row-${i}`}
                ref={i === activeIdx ? activeRowRef : null}
                style={styles.row(e.is_plm, i === activeIdx)}
                onClick={() => onSeek(e.timestamp_sec)}
                onDoubleClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={(ev) => {
                  ev.currentTarget.style.background = i === activeIdx
                    ? 'rgba(79, 143, 247, 0.15)'
                    : e.is_plm ? 'rgba(239, 68, 68, 0.05)' : 'transparent'
                }}
              >
                <td style={styles.td}>{formatTime(e.timestamp_sec)}</td>
                <td style={styles.td}>{e.duration_sec}s</td>
                <td style={styles.td}>{badge}</td>
                <td style={styles.td}>{e.series_id || '—'}</td>
                <td style={styles.td}>{(e.amplitude * 100).toFixed(1)}</td>
                <td style={styles.td}>{e.spatial_variance?.toFixed(2)}</td>
              </tr>,
              expandedIdx === i && (
                <tr key={`debug-${i}`} style={styles.debugRow}>
                  <td colSpan={6} style={styles.debugCell}>
                    <DebugInfo debug={e.debug} />
                  </td>
                </tr>
              )
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
