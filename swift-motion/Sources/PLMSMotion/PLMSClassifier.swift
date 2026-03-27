import Foundation

// MARK: - AASM PLMS criteria (must match Python plms.py exactly)

public let MIN_MOVEMENT_DURATION: Float = 0.4
public let MAX_MOVEMENT_DURATION: Float = 10.0
public let MIN_INTERVAL: Float = 4.5
public let MAX_INTERVAL: Float = 90.0
public let MIN_SERIES_LENGTH = 4
public let BODY_MOVEMENT_AMP_THRESHOLD: Float = 25.0
public let BODY_MOVEMENT_DUR_THRESHOLD: Float = 3.0

// MARK: - Classified event (output)

public struct ClassifiedEvent {
    public var id: Int
    public var timestampSec: Float
    public var onsetSec: Float
    public var durationSec: Float
    public var amplitude: Float
    public var spatialVariance: Float
    public var peakIndex: Int
    public var movementType: String  // "limb" or "body"
    public var isPLM: Bool
    public var seriesId: Int?
}

public struct PLMSeries {
    public var id: Int
    public var eventCount: Int
    public var eventTimestamps: [Float]
    public var meanIntervalSec: Float
    public var startSec: Float
    public var endSec: Float
}

public struct PLMSSummary {
    public var totalMovements: Int
    public var plmCount: Int
    public var plmi: Float
    public var seriesCount: Int
    public var recordingHours: Float
    public var bodyMovements: Int
}

public struct PLMSResult {
    public var events: [ClassifiedEvent]
    public var series: [PLMSeries]
    public var summary: PLMSSummary
}

// MARK: - Classification

public func classifyMovementType(amplitude: Float, duration: Float) -> String {
    if amplitude > BODY_MOVEMENT_AMP_THRESHOLD && duration > BODY_MOVEMENT_DUR_THRESHOLD {
        return "body"
    }
    return "limb"
}

public func applyPLMSCriteria(events: [DetectedEvent], recordingHours: Float) -> PLMSResult {
    // Classify all events
    var candidates: [ClassifiedEvent] = events.enumerated().map { (i, e) in
        ClassifiedEvent(
            id: i + 1,
            timestampSec: e.timestampSec,
            onsetSec: e.onsetSec,
            durationSec: e.durationSec,
            amplitude: e.amplitude,
            spatialVariance: e.spatialVariance,
            peakIndex: e.peakIndex,
            movementType: classifyMovementType(amplitude: e.amplitude, duration: e.durationSec),
            isPLM: false,
            seriesId: nil
        )
    }

    // Filter: only limb movements with valid duration are PLM candidates
    let plmCandidates = candidates
        .filter { $0.movementType == "limb" }
        .filter { MIN_MOVEMENT_DURATION <= $0.durationSec && $0.durationSec <= MAX_MOVEMENT_DURATION }
        .sorted { $0.timestampSec < $1.timestampSec }

    // Build chains of consecutive events with valid inter-movement intervals
    var chains: [[ClassifiedEvent]] = []
    var currentChain: [ClassifiedEvent] = []

    for event in plmCandidates {
        if currentChain.isEmpty {
            currentChain.append(event)
            continue
        }

        let interval = event.onsetSec - currentChain.last!.onsetSec
        if interval >= MIN_INTERVAL && interval <= MAX_INTERVAL {
            currentChain.append(event)
        } else {
            if currentChain.count >= MIN_SERIES_LENGTH {
                chains.append(currentChain)
            }
            currentChain = [event]
        }
    }
    if currentChain.count >= MIN_SERIES_LENGTH {
        chains.append(currentChain)
    }

    // Tag events with series info
    var seriesList: [PLMSeries] = []
    var plmTimestampMap: [Float: (seriesId: Int, isPLM: Bool)] = [:]
    var plmCount = 0

    for (seriesIdx, chain) in chains.enumerated() {
        let seriesId = seriesIdx + 1
        var intervals: [Float] = []

        for (i, event) in chain.enumerated() {
            plmTimestampMap[event.timestampSec] = (seriesId: seriesId, isPLM: true)
            if i > 0 {
                intervals.append(event.onsetSec - chain[i - 1].onsetSec)
            }
            plmCount += 1
        }

        let meanInterval = intervals.isEmpty ? 0 : intervals.reduce(0, +) / Float(intervals.count)
        seriesList.append(PLMSeries(
            id: seriesId,
            eventCount: chain.count,
            eventTimestamps: chain.map { $0.timestampSec },
            meanIntervalSec: (meanInterval * 10).rounded() / 10,  // round to 1 decimal
            startSec: chain.first!.timestampSec,
            endSec: chain.last!.timestampSec
        ))
    }

    // Apply PLM tags back to candidates
    for i in 0..<candidates.count {
        if let tag = plmTimestampMap[candidates[i].timestampSec] {
            candidates[i].isPLM = tag.isPLM
            candidates[i].seriesId = tag.seriesId
        }
    }

    let plmi = recordingHours > 0 ? (Float(plmCount) / recordingHours * 10).rounded() / 10 : 0
    let bodyCount = candidates.filter { $0.movementType == "body" }.count

    return PLMSResult(
        events: candidates,
        series: seriesList,
        summary: PLMSSummary(
            totalMovements: events.count,
            plmCount: plmCount,
            plmi: plmi,
            seriesCount: seriesList.count,
            recordingHours: (recordingHours * 100).rounded() / 100,
            bodyMovements: bodyCount
        )
    )
}
