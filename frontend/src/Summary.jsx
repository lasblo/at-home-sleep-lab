const styles = {
  container: {
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  card: {
    background: 'var(--bg)',
    borderRadius: 6,
    padding: '8px 12px',
  },
  value: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: 'var(--mono)',
  },
  label: {
    fontSize: 11,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
}

function plmiSeverity(plmi) {
  if (plmi < 5) return { label: 'Normal', color: '#22c55e' }
  if (plmi < 15) return { label: 'Mild', color: '#f59e0b' }
  if (plmi < 25) return { label: 'Moderate', color: '#f97316' }
  return { label: 'Severe', color: '#ef4444' }
}

export default function Summary({ data }) {
  const severity = plmiSeverity(data.plmi)
  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={{ ...styles.value, color: severity.color }}>{data.plmi}</div>
          <div style={styles.label}>PLMI ({severity.label})</div>
        </div>
        <div style={styles.card}>
          <div style={styles.value}>{data.plm_count}</div>
          <div style={styles.label}>PLM Events</div>
        </div>
        <div style={styles.card}>
          <div style={styles.value}>{data.series_count}</div>
          <div style={styles.label}>Series</div>
        </div>
        <div style={styles.card}>
          <div style={styles.value}>{data.total_hours}h</div>
          <div style={styles.label}>Recorded</div>
        </div>
      </div>
    </div>
  )
}
