import Foundation

// MARK: - JSON output models (must match Python output format exactly)

public struct ProcessingOutput: Codable {
    public let videoInfo: VideoInfoJSON
    public let motionSignal: MotionSignalJSON
    public let events: [EventJSON]
    public let series: [SeriesJSON]
    public let summary: SummaryJSON

    enum CodingKeys: String, CodingKey {
        case videoInfo = "video_info"
        case motionSignal = "motion_signal"
        case events, series, summary
    }

    public init(videoInfo: VideoInfoJSON, motionSignal: MotionSignalJSON, events: [EventJSON], series: [SeriesJSON], summary: SummaryJSON) {
        self.videoInfo = videoInfo
        self.motionSignal = motionSignal
        self.events = events
        self.series = series
        self.summary = summary
    }
}

public struct VideoInfoJSON: Codable {
    public let fps: Float
    public let frameCount: Int
    public let width: Int
    public let height: Int
    public let durationSec: Float

    enum CodingKeys: String, CodingKey {
        case fps
        case frameCount = "frame_count"
        case width, height
        case durationSec = "duration_sec"
    }

    public init(from info: VideoInfo) {
        self.fps = info.fps
        self.frameCount = info.frameCount
        self.width = info.width
        self.height = info.height
        self.durationSec = info.durationSec
    }
}

public struct MotionSignalJSON: Codable {
    public let sampleRateHz: Float
    public let values: [Float]

    enum CodingKeys: String, CodingKey {
        case sampleRateHz = "sample_rate_hz"
        case values
    }

    public init(sampleRateHz: Float, values: [Float]) {
        self.sampleRateHz = sampleRateHz
        self.values = values
    }
}

public struct EventJSON: Codable {
    public let id: Int
    public let timestampSec: Float
    public let onsetSec: Float
    public let durationSec: Float
    public let amplitude: Float
    public let spatialVariance: Float
    public let peakIndex: Int
    public let movementType: String
    public let isPLM: Bool
    public let seriesId: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case timestampSec = "timestamp_sec"
        case onsetSec = "onset_sec"
        case durationSec = "duration_sec"
        case amplitude
        case spatialVariance = "spatial_variance"
        case peakIndex = "peak_index"
        case movementType = "movement_type"
        case isPLM = "is_plm"
        case seriesId = "series_id"
    }

    public init(from event: ClassifiedEvent) {
        self.id = event.id
        self.timestampSec = event.timestampSec
        self.onsetSec = event.onsetSec
        self.durationSec = event.durationSec
        self.amplitude = event.amplitude
        self.spatialVariance = event.spatialVariance
        self.peakIndex = event.peakIndex
        self.movementType = event.movementType
        self.isPLM = event.isPLM
        self.seriesId = event.seriesId
    }
}

public struct SeriesJSON: Codable {
    public let id: Int
    public let eventCount: Int
    public let eventTimestamps: [Float]
    public let meanIntervalSec: Float
    public let startSec: Float
    public let endSec: Float

    enum CodingKeys: String, CodingKey {
        case id
        case eventCount = "event_count"
        case eventTimestamps = "event_timestamps"
        case meanIntervalSec = "mean_interval_sec"
        case startSec = "start_sec"
        case endSec = "end_sec"
    }

    public init(from series: PLMSeries) {
        self.id = series.id
        self.eventCount = series.eventCount
        self.eventTimestamps = series.eventTimestamps
        self.meanIntervalSec = series.meanIntervalSec
        self.startSec = series.startSec
        self.endSec = series.endSec
    }
}

public struct SummaryJSON: Codable {
    public let totalMovements: Int
    public let plmCount: Int
    public let plmi: Float
    public let seriesCount: Int
    public let recordingHours: Float
    public let bodyMovements: Int

    enum CodingKeys: String, CodingKey {
        case totalMovements = "total_movements"
        case plmCount = "plm_count"
        case plmi
        case seriesCount = "series_count"
        case recordingHours = "recording_hours"
        case bodyMovements = "body_movements"
    }

    public init(from summary: PLMSSummary) {
        self.totalMovements = summary.totalMovements
        self.plmCount = summary.plmCount
        self.plmi = summary.plmi
        self.seriesCount = summary.seriesCount
        self.recordingHours = summary.recordingHours
        self.bodyMovements = summary.bodyMovements
    }
}

// MARK: - Convenience builder

public func buildOutput(motionSignal: MotionSignalData, plmsResult: PLMSResult) -> ProcessingOutput {
    let normalizedValues = normalizeSignal(motionSignal.localizedMotion)

    return ProcessingOutput(
        videoInfo: VideoInfoJSON(from: motionSignal.videoInfo),
        motionSignal: MotionSignalJSON(sampleRateHz: motionSignal.sampleRateHz, values: normalizedValues),
        events: plmsResult.events.map { EventJSON(from: $0) },
        series: plmsResult.series.map { SeriesJSON(from: $0) },
        summary: SummaryJSON(from: plmsResult.summary)
    )
}
