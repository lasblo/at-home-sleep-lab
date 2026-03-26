import { useRef, useEffect } from 'react'

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
  empty: {
    padding: 20,
    textAlign: 'center',
    color: 'var(--text-dim)',
  },
}

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function EventList({ events, currentTime, onSeek }) {
  const containerRef = useRef(null)
  const activeRowRef = useRef(null)

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
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr
              key={i}
              ref={i === activeIdx ? activeRowRef : null}
              style={styles.row(e.is_plm, i === activeIdx)}
              onClick={() => onSeek(e.timestamp_sec)}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(ev) => {
                ev.currentTarget.style.background = i === activeIdx
                  ? 'rgba(79, 143, 247, 0.15)'
                  : e.is_plm ? 'rgba(239, 68, 68, 0.05)' : 'transparent'
              }}
            >
              <td style={styles.td}>{formatTime(e.timestamp_sec)}</td>
              <td style={styles.td}>{e.duration_sec}s</td>
              <td style={styles.td}>
                {e.is_plm
                  ? <span style={styles.plmBadge}>PLM</span>
                  : <span style={styles.movBadge}>MOV</span>}
              </td>
              <td style={styles.td}>{e.series_id || '—'}</td>
              <td style={styles.td}>{(e.amplitude * 100).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
