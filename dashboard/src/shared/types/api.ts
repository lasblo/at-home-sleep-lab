export interface NightSummary {
  total_movements: number
  plm_count: number
  plmi: number
  series_count: number
  recording_hours: number
  body_movements: number
}

export interface HourlyBucket {
  hour_offset: number
  label: string
  plm_count: number
  body_count: number
  other_count: number
  total_count: number
}

export interface ArousalSummary {
  plmai: number
  arousal_percentage: number
  mean_magnitude_bpm: number
  arousal_count: number
  plm_with_arousal: number
}

export interface Night {
  night_date: string
  start_local: string
  end_local: string
  total_hours: number
  video_ids: string[]
  videos_total: number
  videos_processed: number
  summary: NightSummary | null
  hourly_distribution: HourlyBucket[] | null
  arousal_summary: ArousalSummary | null
}

export interface VideoInfo {
  id: string
  filename: string
  start: string
  end: string
  start_local: string
  end_local: string
  duration_sec: number
  offset_sec?: number
  processed?: boolean
}

export interface EventDebug {
  raw_localized: number
  smoothed: number
  baseline: number
  above_baseline: number
  normalized_height: number
  prominence: number
  sv_passed: boolean
  sv_threshold: number
  body_classification: string
  body_reason: string | null
  plm_eligible: boolean
  plm_reject_reason: string | null
  interval_to_prev_sec: number | null
  interval_valid: boolean | null
  interval_reason: string
  plm_series_reason: string
}

export interface ArousalInfo {
  has_arousal: boolean
  pre_baseline_hr?: number
  peak_hr?: number
  magnitude_bpm?: number
  magnitude_pct?: number
  onset_delay_sec?: number
  duration_sec?: number
  threshold_used?: string
  strict_threshold_met?: boolean
  reason?: string
}

export interface SleepEvent {
  id: number
  timestamp_sec: number
  onset_sec: number
  duration_sec: number
  amplitude: number
  spatial_variance: number
  is_plm: boolean
  series_id: string | null
  movement_type: "limb" | "body"
  debug?: EventDebug
  arousal?: ArousalInfo
  video_id?: string
  night_sec?: number
}

export interface SeriesInfo {
  id: string
  event_count: number
  event_timestamps: number[]
  mean_interval_sec: number
  start_sec: number
  end_sec: number
}

export interface MotionSignal {
  sample_rate_hz: number
  values: number[]
}

export interface VideoResults {
  video: VideoInfo
  video_info: {
    fps: number
    frame_count: number
    width: number
    height: number
    duration_sec: number
  }
  motion_signal: MotionSignal
  events: SleepEvent[]
  series: SeriesInfo[]
  summary: NightSummary
  arousal_summary?: ArousalSummary
}

export interface NightDetail {
  night_date: string
  start_local: string
  end_local: string
  total_hours: number
  videos: VideoInfo[]
  summary: NightSummary
  hourly_distribution: HourlyBucket[]
  events: SleepEvent[]
  series: SeriesInfo[]
  arousal_summary?: ArousalSummary
}

export interface HRReading {
  epoch: number
  hr: number
}

export interface HRResponse {
  readings: HRReading[]
  count: number
}

export interface ProcessingStatus {
  running: boolean
  progress: Record<string, number>
  error: string | null
}

export interface Session {
  id: string
  status: "recording" | "processing" | "analyzed" | "failed"
  started_at: string
  stopped_at: string | null
  night_date: string
  total_hours: number | null
  hr_enabled: boolean
  unifi_camera_id: string | null
  notes: string | null
}

export interface SessionDetail extends Session {
  videos: VideoInfo[]
  events: SleepEvent[]
  summary: NightSummary
  hourly_distribution?: HourlyBucket[]
  arousal_summary?: ArousalSummary
}

export interface UniFiCamera {
  id: string
  name: string
  type: string
  is_connected: boolean
}
