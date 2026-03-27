import ArgumentParser
import Foundation
import PLMSMotion

@main
struct PLMSMotionCLI: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "plms-motion",
        abstract: "PLMS motion detection from sleep video using Metal GPU acceleration",
        subcommands: [Process.self]
    )
}

struct Process: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Process a video file and output motion analysis as JSON"
    )

    @Argument(help: "Path to the MP4 video file")
    var videoPath: String

    @Option(name: .long, help: "Output file path (default: stdout)")
    var output: String?

    @Flag(name: .long, help: "Report progress on stderr")
    var progress = false

    func run() throws {
        let url = URL(fileURLWithPath: videoPath)
        guard FileManager.default.fileExists(atPath: videoPath) else {
            throw ValidationError("File not found: \(videoPath)")
        }

        // Extract motion signal using Metal pipeline
        let extractor = try MotionExtractor()

        let progressCb: ((Float) -> Void)? = progress ? { pct in
            FileHandle.standardError.write("PROGRESS:\(pct)\n".data(using: .utf8)!)
        } : nil

        let motionSignal = try extractor.extract(from: url, progressCallback: progressCb)

        // Detect events
        let events = detectEvents(motionSignal: motionSignal)

        // Apply PLMS criteria
        let recordingHours = motionSignal.videoInfo.durationSec / 3600.0
        let plmsResult = applyPLMSCriteria(events: events, recordingHours: recordingHours)

        // Build output JSON
        let result = buildOutput(motionSignal: motionSignal, plmsResult: plmsResult)

        // Encode
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let jsonData = try encoder.encode(result)

        if let outputPath = output {
            try jsonData.write(to: URL(fileURLWithPath: outputPath))
        } else {
            FileHandle.standardOutput.write(jsonData)
        }

        if progress {
            FileHandle.standardError.write("PROGRESS:1.0\n".data(using: .utf8)!)
        }
    }
}
