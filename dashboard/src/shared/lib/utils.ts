export type PlmiSeverity = "normal" | "mild" | "moderate" | "severe"

export function plmiSeverity(plmi: number): PlmiSeverity {
  if (plmi < 5) return "normal"
  if (plmi < 15) return "mild"
  if (plmi < 25) return "moderate"
  return "severe"
}

export function plmiLabel(plmi: number): string {
  const s = plmiSeverity(plmi)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00")
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateStr
  }
}

export function formatFullDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00")
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return dateStr
  }
}

export function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatClockTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return ""
  }
}
