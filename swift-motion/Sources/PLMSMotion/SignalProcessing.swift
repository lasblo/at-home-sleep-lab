import Accelerate
import Foundation

// MARK: - Signal processing (matches Python pipeline.py detect_events)

public let SMOOTH_WINDOW = 3
public let BASELINE_WINDOW_SEC: Float = 60.0
public let PEAK_PROMINENCE: Float = 0.03
public let MIN_PEAK_DISTANCE_SEC: Float = 3.0
public let MIN_PEAK_HEIGHT: Float = 0.02

public struct DetectedEvent {
    public var timestampSec: Float
    public var onsetSec: Float
    public var durationSec: Float
    public var amplitude: Float
    public var spatialVariance: Float
    public var peakIndex: Int
}

// MARK: - Smoothing via vDSP convolution

public func smooth(_ signal: [Float], windowSize: Int = SMOOTH_WINDOW) -> [Float] {
    guard signal.count > windowSize else { return signal }
    let kernel = [Float](repeating: 1.0 / Float(windowSize), count: windowSize)
    var result = [Float](repeating: 0, count: signal.count)
    vDSP_conv(signal, 1, kernel, 1, &result, 1, vDSP_Length(signal.count - windowSize + 1), vDSP_Length(windowSize))

    // Pad to match original length (center the convolution output)
    let pad = windowSize / 2
    var padded = [Float](repeating: 0, count: signal.count)
    for i in 0..<(signal.count - windowSize + 1) {
        padded[i + pad] = result[i]
    }
    // Fill edges with nearest valid value
    for i in 0..<pad { padded[i] = padded[pad] }
    for i in (signal.count - pad)..<signal.count { padded[i] = padded[signal.count - pad - 1] }
    return padded
}

// MARK: - Rolling median (baseline estimation)

public func rollingMedian(_ signal: [Float], windowSamples: Int) -> [Float] {
    let n = signal.count
    var result = [Float](repeating: 0, count: n)
    let halfW = windowSamples / 2

    for i in 0..<n {
        let lo = max(0, i - halfW)
        let hi = min(n, i + halfW + 1)
        var window = Array(signal[lo..<hi])
        window.sort()
        let mid = window.count / 2
        if window.count % 2 == 0 {
            result[i] = (window[mid - 1] + window[mid]) / 2.0
        } else {
            result[i] = window[mid]
        }
    }
    return result
}

// MARK: - Peak detection (port of scipy.signal.find_peaks)

public func findPeaks(
    _ signal: [Float],
    prominence: Float = PEAK_PROMINENCE,
    distance: Int,
    height: Float = MIN_PEAK_HEIGHT
) -> [Int] {
    let n = signal.count
    guard n > 2 else { return [] }

    // Step 1: Find local maxima
    var peaks: [Int] = []
    for i in 1..<(n - 1) {
        if signal[i] > signal[i - 1] && signal[i] > signal[i + 1] && signal[i] >= height {
            peaks.append(i)
        }
    }

    // Step 2: Filter by prominence
    peaks = peaks.filter { peak in
        computeProminence(signal, peakIdx: peak) >= prominence
    }

    // Step 3: Filter by distance (greedy, keep tallest)
    peaks = filterByDistance(peaks, signal: signal, minDistance: distance)

    return peaks
}

// Prominence: how much peak stands out from surrounding terrain
// For each peak, extend left/right until hitting a higher peak or boundary,
// find highest valley on each side, prominence = peak - max(left_min, right_min)
private func computeProminence(_ signal: [Float], peakIdx: Int) -> Float {
    let peakVal = signal[peakIdx]
    let n = signal.count

    // Scan left for the minimum before reaching a higher peak or boundary
    var leftMin = peakVal
    for i in stride(from: peakIdx - 1, through: 0, by: -1) {
        leftMin = min(leftMin, signal[i])
        if signal[i] > peakVal { break }
    }

    // Scan right for the minimum before reaching a higher peak or boundary
    var rightMin = peakVal
    for i in (peakIdx + 1)..<n {
        rightMin = min(rightMin, signal[i])
        if signal[i] > peakVal { break }
    }

    return peakVal - max(leftMin, rightMin)
}

// Distance filter: greedily keep tallest peaks, removing those too close
private func filterByDistance(_ peaks: [Int], signal: [Float], minDistance: Int) -> [Int] {
    guard !peaks.isEmpty else { return [] }

    // Sort peaks by height (descending) to keep tallest first
    let sorted = peaks.sorted { signal[$0] > signal[$1] }
    var keep = [Bool](repeating: true, count: peaks.count)
    let peakSet = Dictionary(uniqueKeysWithValues: peaks.enumerated().map { ($1, $0) })

    for idx in sorted {
        guard let originalIdx = peakSet[idx], keep[originalIdx] else { continue }
        // Remove all peaks within minDistance of this one
        for (otherOrigIdx, otherPeak) in peaks.enumerated() {
            if otherOrigIdx != originalIdx && keep[otherOrigIdx] && abs(otherPeak - idx) < minDistance {
                keep[otherOrigIdx] = false
            }
        }
    }

    return peaks.enumerated().compactMap { keep[$0.offset] ? $0.element : nil }
}

// MARK: - Event detection (matches Python detect_events)

public func detectEvents(motionSignal: MotionSignalData) -> [DetectedEvent] {
    let localized = motionSignal.localizedMotion
    let svs = motionSignal.spatialVariances
    let timestamps = motionSignal.timestamps
    let sampleRate = motionSignal.sampleRateHz

    guard localized.count > 10 else { return [] }

    // Smooth
    let smoothed = smooth(localized)

    // Rolling median baseline
    let windowSamples = max(1, Int(BASELINE_WINDOW_SEC * sampleRate))
    let baseline = rollingMedian(smoothed, windowSamples: windowSamples)

    // Above-baseline signal
    var aboveBaseline = [Float](repeating: 0, count: smoothed.count)
    for i in 0..<smoothed.count {
        aboveBaseline[i] = max(0, smoothed[i] - baseline[i])
    }

    // Normalize to 0-1
    let maxVal = aboveBaseline.max() ?? 1
    guard maxVal > 0 else { return [] }
    var normalized = aboveBaseline.map { $0 / maxVal }

    // Peak detection
    let minDistance = max(1, Int(MIN_PEAK_DISTANCE_SEC * sampleRate))
    let peakIndices = findPeaks(normalized, prominence: PEAK_PROMINENCE, distance: minDistance, height: MIN_PEAK_HEIGHT)

    // Build events
    var events: [DetectedEvent] = []
    for peakIdx in peakIndices {
        let sv = peakIdx < svs.count ? svs[peakIdx] : 0
        guard sv >= MIN_SPATIAL_VARIANCE else { continue }

        let amplitude = smoothed[peakIdx]
        let peakTime = timestamps[peakIdx]
        let localBase = baseline[peakIdx]

        // Onset/offset detection (15% threshold crossing)
        let crossThreshold = localBase + (amplitude - localBase) * 0.15

        var onsetIdx = peakIdx
        while onsetIdx > 0 && smoothed[onsetIdx - 1] > crossThreshold {
            onsetIdx -= 1
        }
        var offsetIdx = peakIdx
        while offsetIdx < smoothed.count - 1 && smoothed[offsetIdx + 1] > crossThreshold {
            offsetIdx += 1
        }

        let onsetTime = timestamps[onsetIdx]
        let offsetTime = offsetIdx < timestamps.count ? timestamps[offsetIdx] : peakTime
        let duration = offsetTime - onsetTime

        events.append(DetectedEvent(
            timestampSec: peakTime,
            onsetSec: onsetTime,
            durationSec: max(duration, 1.0 / sampleRate),
            amplitude: amplitude,
            spatialVariance: sv,
            peakIndex: peakIdx
        ))
    }

    return events
}

// MARK: - Normalize motion signal for output

public func normalizeSignal(_ signal: [Float]) -> [Float] {
    let maxVal = signal.max() ?? 1
    guard maxVal > 0 else { return signal.map { _ in Float(0) } }
    return signal.map { $0 / maxVal }
}
