const styles = {
  container: {
    display: 'flex',
    gap: 16,
    padding: '6px 16px',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    fontSize: 12,
    fontFamily: 'var(--mono)',
    color: 'var(--text-dim)',
    alignItems: 'center',
    flexShrink: 0,
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  val: (color) => ({
    fontWeight: 700,
    color: color || 'var(--text)',
    fontSize: 13,
  }),
  label: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  reanalyzeBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '4px 12px',
    borderRadius: 4,
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
  },
}

function plmiColor(plmi) {
  if (plmi < 5) return '#22c55e'
  if (plmi < 15) return '#f59e0b'
  if (plmi < 25) return '#f97316'
  return '#ef4444'
}

export default function VideoSummary({ results, videoId, onReanalyze, processing }) {
  if (!results?.summary) return null
  const s = results.summary
  const isReanalyzing = processing?.running && videoId && processing?.progress?.[videoId] != null
  const hasDebug = results.events?.some(e => e.debug)

  return (
    <div style={styles.container}>
      <div style={styles.stat}>
        <span style={styles.val(plmiColor(s.plmi))}>{s.plmi}</span>
        <span style={styles.label}>PLMI</span>
      </div>
      <div style={styles.stat}>
        <span style={styles.val('#ef4444')}>{s.plm_count}</span>
        <span style={styles.label}>PLMs</span>
      </div>
      <div style={styles.stat}>
        <span style={styles.val()}>{s.series_count}</span>
        <span style={styles.label}>Series</span>
      </div>
      <div style={styles.stat}>
        <span style={styles.val()}>{s.total_movements}</span>
        <span style={styles.label}>Events</span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {hasDebug && <span style={{ fontSize: 10, color: '#22c55e' }}>debug info available</span>}
        <button
          style={styles.reanalyzeBtn}
          onClick={() => onReanalyze?.(videoId)}
          disabled={isReanalyzing}
        >
          {isReanalyzing ? 'Reanalyzing…' : 'Reanalyze'}
        </button>
      </div>
    </div>
  )
}
