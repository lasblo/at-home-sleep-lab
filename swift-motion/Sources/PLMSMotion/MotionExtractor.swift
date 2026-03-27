import AVFoundation
import CoreVideo
import Metal
import MetalPerformanceShaders
import Foundation

// MARK: - Tunable parameters (must match Python pipeline.py)

public let FRAME_SKIP = 3
public let GAUSSIAN_SIGMA: Float = 1.1  // OpenCV kernel=5 → sigma≈1.1
public let ROI_Y_FRACTION: Float = 0.5
public let GRID_COLS = 8
public let GRID_ROWS = 4
public let MIN_SPATIAL_VARIANCE: Float = 0.35
public let SV_OFFSET: Float = 0.3

// MARK: - Output types

public struct MotionSignalData {
    public var timestamps: [Float]
    public var rawDiffs: [Float]
    public var localizedMotion: [Float]
    public var spatialVariances: [Float]
    public var sampleRateHz: Float
    public var videoInfo: VideoInfo
}

public struct VideoInfo {
    public var fps: Float
    public var frameCount: Int
    public var width: Int
    public var height: Int
    public var durationSec: Float
}

// MARK: - Triple-buffered Metal pipeline

public final class MotionExtractor {
    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let absdiffPipeline: MTLComputePipelineState
    private let gridReducePipeline: MTLComputePipelineState
    private let gaussianBlur: MPSImageGaussianBlur
    private var textureCache: CVMetalTextureCache?

    // Ring buffer depth for triple-buffering
    private let RING_SIZE = 3

    public init() throws {
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw MotionError.noMetalDevice
        }
        self.device = device

        guard let queue = device.makeCommandQueue() else {
            throw MotionError.metalSetupFailed("Failed to create command queue")
        }
        self.commandQueue = queue

        // Compile Metal shaders at runtime
        let shaderSource = """
        #include <metal_stdlib>
        using namespace metal;

        kernel void absdiff_roi(
            texture2d<float, access::read> texA [[texture(0)]],
            texture2d<float, access::read> texB [[texture(1)]],
            texture2d<float, access::write> texOut [[texture(2)]],
            constant uint &roiYStart [[buffer(0)]],
            uint2 gid [[thread_position_in_grid]]
        ) {
            uint2 srcPos = uint2(gid.x, gid.y + roiYStart);
            if (srcPos.x >= texA.get_width() || srcPos.y >= texA.get_height()) return;
            if (gid.x >= texOut.get_width() || gid.y >= texOut.get_height()) return;
            float a = texA.read(srcPos).r;
            float b = texB.read(srcPos).r;
            texOut.write(float4(abs(a - b), 0, 0, 1), gid);
        }

        kernel void grid_reduce(
            texture2d<float, access::read> diffTex [[texture(0)]],
            device float *cellMeans [[buffer(0)]],
            constant uint2 &cellSize [[buffer(1)]],
            uint2 groupId [[threadgroup_position_in_grid]],
            uint localIndex [[thread_index_in_threadgroup]],
            uint2 groupSize [[threads_per_threadgroup]]
        ) {
            uint cw = cellSize.x;
            uint ch = cellSize.y;
            uint startX = groupId.x * cw;
            uint startY = groupId.y * ch;
            uint texW = diffTex.get_width();
            uint texH = diffTex.get_height();
            uint totalPixels = cw * ch;
            uint threadsInGroup = groupSize.x * groupSize.y;
            uint pixelsPerThread = (totalPixels + threadsInGroup - 1) / threadsInGroup;
            uint myStart = localIndex * pixelsPerThread;
            uint myEnd = min(myStart + pixelsPerThread, totalPixels);
            float localSum = 0.0;
            for (uint i = myStart; i < myEnd; i++) {
                uint px = startX + (i % cw);
                uint py = startY + (i / cw);
                if (px < texW && py < texH) {
                    localSum += diffTex.read(uint2(px, py)).r;
                }
            }
            float simdSum = simd_sum(localSum);
            threadgroup float partialSums[32];
            uint simdGroupIndex = localIndex / 32;
            if (localIndex % 32 == 0) {
                partialSums[simdGroupIndex] = simdSum;
            }
            threadgroup_barrier(mem_flags::mem_threadgroup);
            if (localIndex == 0) {
                uint numSimdGroups = (threadsInGroup + 31) / 32;
                float total = 0.0;
                for (uint i = 0; i < numSimdGroups; i++) {
                    total += partialSums[i];
                }
                cellMeans[groupId.y * 8 + groupId.x] = total / float(cw * ch);
            }
        }
        """
        let library = try device.makeLibrary(source: shaderSource, options: nil)

        guard let absdiffFunc = library.makeFunction(name: "absdiff_roi") else {
            throw MotionError.metalSetupFailed("absdiff_roi not found")
        }
        self.absdiffPipeline = try device.makeComputePipelineState(function: absdiffFunc)

        guard let gridFunc = library.makeFunction(name: "grid_reduce") else {
            throw MotionError.metalSetupFailed("grid_reduce not found")
        }
        self.gridReducePipeline = try device.makeComputePipelineState(function: gridFunc)

        self.gaussianBlur = MPSImageGaussianBlur(device: device, sigma: GAUSSIAN_SIGMA)

        var cache: CVMetalTextureCache?
        CVMetalTextureCacheCreate(nil, nil, device, nil, &cache)
        self.textureCache = cache
    }

    // MARK: - Main extraction with triple-buffered pipeline

    public func extract(from videoURL: URL, progressCallback: ((Float) -> Void)? = nil) throws -> MotionSignalData {
        let asset = AVURLAsset(url: videoURL)
        guard let track = asset.tracks(withMediaType: .video).first else {
            throw MotionError.noVideoTrack
        }

        let fps = track.nominalFrameRate
        let totalFrames = Int(track.timeRange.duration.seconds * Double(fps))
        let naturalSize = track.naturalSize
        let width = Int(naturalSize.width)
        let height = Int(naturalSize.height)
        let durationSec = Float(track.timeRange.duration.seconds)

        let roiY = Int(Float(height) * ROI_Y_FRACTION)
        let roiH = height - roiY
        let cellW = width / GRID_COLS
        let cellH = roiH / GRID_ROWS

        // Setup asset reader
        guard let reader = try? AVAssetReader(asset: asset) else {
            throw MotionError.readerSetupFailed
        }

        let outputSettings: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        ]
        let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        readerOutput.alwaysCopiesSampleData = false
        reader.add(readerOutput)
        reader.startReading()

        // --- Allocate ring-buffered GPU resources ---

        // Blur textures: RING_SIZE textures, we rotate through them
        // We need current + previous, so RING_SIZE >= 2
        var blurTextures: [MTLTexture] = []
        let blurDesc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .r8Unorm, width: width, height: height, mipmapped: false
        )
        blurDesc.usage = [.shaderRead, .shaderWrite]
        blurDesc.storageMode = .private
        for _ in 0..<RING_SIZE {
            guard let tex = device.makeTexture(descriptor: blurDesc) else {
                throw MotionError.metalSetupFailed("Failed to create blur texture")
            }
            blurTextures.append(tex)
        }

        // Diff texture (reused)
        let diffDesc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .r32Float, width: width, height: roiH, mipmapped: false
        )
        diffDesc.usage = [.shaderRead, .shaderWrite]
        diffDesc.storageMode = .private
        guard let diffTexture = device.makeTexture(descriptor: diffDesc) else {
            throw MotionError.metalSetupFailed("Failed to create diff texture")
        }

        // Ring of cell means buffers — one per in-flight command buffer
        var cellMeansBuffers: [MTLBuffer] = []
        for _ in 0..<RING_SIZE {
            guard let buf = device.makeBuffer(length: 32 * MemoryLayout<Float>.size, options: .storageModeShared) else {
                throw MotionError.metalSetupFailed("Failed to create cell means buffer")
            }
            cellMeansBuffers.append(buf)
        }

        // Constant buffers
        var cellSize = SIMD2<UInt32>(UInt32(cellW), UInt32(cellH))
        guard let cellSizeBuffer = device.makeBuffer(bytes: &cellSize, length: MemoryLayout<SIMD2<UInt32>>.size, options: .storageModeShared) else {
            throw MotionError.metalSetupFailed("Failed to create cell size buffer")
        }
        var roiYStart = UInt32(roiY)
        guard let roiYBuffer = device.makeBuffer(bytes: &roiYStart, length: MemoryLayout<UInt32>.size, options: .storageModeShared) else {
            throw MotionError.metalSetupFailed("Failed to create ROI buffer")
        }

        // --- Triple-buffer synchronization ---
        // Semaphore limits in-flight GPU work to RING_SIZE
        let inflightSemaphore = DispatchSemaphore(value: RING_SIZE)

        // Results collected from completion handlers (thread-safe via serial queue)
        let resultsQueue = DispatchQueue(label: "plms.results")
        var results: [(index: Int, timestamp: Float, cells: [Float])] = []

        // Output arrays
        var timestamps: [Float] = []
        var rawDiffs: [Float] = []
        var localizedMotion: [Float] = []
        var spatialVariances: [Float] = []

        var frameIdx = 0
        var sampleIdx = 0  // index among sampled frames
        var ringIdx = 0

        // Grid reduce dispatch sizes (precomputed)
        let maxThreads = gridReducePipeline.maxTotalThreadsPerThreadgroup
        let threadsPerGroup = min(cellW * cellH, maxThreads)
        let tgSize = MTLSize(width: threadsPerGroup, height: 1, depth: 1)
        let tgCount = MTLSize(width: GRID_COLS, height: GRID_ROWS, depth: 1)
        let diffGridSize = MTLSize(width: width, height: roiH, depth: 1)
        let diffTgSize = MTLSize(width: 16, height: 16, depth: 1)

        while reader.status == .reading {
            guard let sampleBuffer = readerOutput.copyNextSampleBuffer() else { continue }

            if frameIdx % FRAME_SKIP != 0 {
                frameIdx += 1
                continue
            }

            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
                frameIdx += 1
                continue
            }

            guard let inputTexture = makeTextureFromYPlane(pixelBuffer: pixelBuffer) else {
                frameIdx += 1
                continue
            }

            // Wait for a ring slot to become available
            inflightSemaphore.wait()

            let currentRing = ringIdx % RING_SIZE
            let currentBlurTex = blurTextures[currentRing]
            let currentCellBuf = cellMeansBuffers[currentRing]

            guard let cmdBuf = commandQueue.makeCommandBuffer() else {
                inflightSemaphore.signal()
                frameIdx += 1
                continue
            }

            // GPU: blur input Y-plane → current blur texture
            gaussianBlur.encode(commandBuffer: cmdBuf, sourceTexture: inputTexture, destinationTexture: currentBlurTex)

            if sampleIdx > 0 {
                // Previous blur texture
                let prevRing = (ringIdx - 1 + RING_SIZE * 100) % RING_SIZE
                let prevBlurTex = blurTextures[prevRing]

                // GPU: absdiff ROI
                if let enc = cmdBuf.makeComputeCommandEncoder() {
                    enc.setComputePipelineState(absdiffPipeline)
                    enc.setTexture(currentBlurTex, index: 0)
                    enc.setTexture(prevBlurTex, index: 1)
                    enc.setTexture(diffTexture, index: 2)
                    enc.setBuffer(roiYBuffer, offset: 0, index: 0)
                    enc.dispatchThreads(diffGridSize, threadsPerThreadgroup: diffTgSize)
                    enc.endEncoding()
                }

                // GPU: grid reduce → per-ring cell means buffer
                if let enc = cmdBuf.makeComputeCommandEncoder() {
                    enc.setComputePipelineState(gridReducePipeline)
                    enc.setTexture(diffTexture, index: 0)
                    enc.setBuffer(currentCellBuf, offset: 0, index: 0)
                    enc.setBuffer(cellSizeBuffer, offset: 0, index: 1)
                    enc.dispatchThreadgroups(tgCount, threadsPerThreadgroup: tgSize)
                    enc.endEncoding()
                }

                let capturedTimestamp = Float(frameIdx) / fps
                let capturedIndex = sampleIdx - 1  // result index
                let capturedBuf = currentCellBuf

                // Completion handler: runs on GPU completion thread, reads back results
                cmdBuf.addCompletedHandler { [weak self] _ in
                    let ptr = capturedBuf.contents().bindMemory(to: Float.self, capacity: 32)
                    let cells = Array(UnsafeBufferPointer(start: ptr, count: 32))

                    resultsQueue.sync {
                        results.append((index: capturedIndex, timestamp: capturedTimestamp, cells: cells))
                    }
                    inflightSemaphore.signal()
                }
            } else {
                // First frame: just blur, no diff
                cmdBuf.addCompletedHandler { _ in
                    inflightSemaphore.signal()
                }
            }

            cmdBuf.commit()

            ringIdx += 1
            sampleIdx += 1
            frameIdx += 1

            // Progress
            if let cb = progressCallback, frameIdx % (FRAME_SKIP * 500) == 0 {
                cb(Float(frameIdx) / Float(totalFrames))
            }
        }

        // Drain: wait for all in-flight command buffers to complete
        for _ in 0..<RING_SIZE {
            inflightSemaphore.wait()
        }
        // Release semaphore slots
        for _ in 0..<RING_SIZE {
            inflightSemaphore.signal()
        }

        // Sort results by index (completion handlers may fire out of order)
        var sortedResults: [(index: Int, timestamp: Float, cells: [Float])] = []
        resultsQueue.sync {
            sortedResults = results.sorted { $0.index < $1.index }
        }

        // Compute grid metrics on CPU
        for r in sortedResults {
            let (rawDiff, localizedScore, sv) = computeGridMetrics(cells: r.cells)
            timestamps.append(r.timestamp)
            rawDiffs.append(rawDiff)
            localizedMotion.append(localizedScore)
            spatialVariances.append(sv)
        }

        let sampleRate = fps / Float(FRAME_SKIP)

        return MotionSignalData(
            timestamps: timestamps,
            rawDiffs: rawDiffs,
            localizedMotion: localizedMotion,
            spatialVariances: spatialVariances,
            sampleRateHz: sampleRate,
            videoInfo: VideoInfo(
                fps: fps,
                frameCount: totalFrames,
                width: width,
                height: height,
                durationSec: durationSec
            )
        )
    }

    // MARK: - Y-plane texture from CVPixelBuffer (zero-copy)

    private func makeTextureFromYPlane(pixelBuffer: CVPixelBuffer) -> MTLTexture? {
        guard let cache = textureCache else { return nil }
        let planeWidth = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let planeHeight = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)

        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            nil, cache, pixelBuffer, nil,
            .r8Unorm, planeWidth, planeHeight, 0, &cvTexture
        )
        guard status == kCVReturnSuccess, let cvTex = cvTexture else { return nil }
        return CVMetalTextureGetTexture(cvTex)
    }

    // MARK: - Grid metrics (CPU, 32 values)

    private func computeGridMetrics(cells: [Float]) -> (rawDiff: Float, localizedScore: Float, spatialVariance: Float) {
        let n = Float(cells.count)
        let mean = cells.reduce(0, +) / n

        let variance = cells.reduce(Float(0)) { $0 + ($1 - mean) * ($1 - mean) } / n
        let stddev = sqrt(variance)
        let sv = mean > 1e-8 ? stddev / mean : 0

        let svWeight = max(0, sv - SV_OFFSET)
        var positiveDevSum: Float = 0
        for cell in cells {
            let dev = cell - mean
            if dev > 0 { positiveDevSum += dev }
        }
        let localizedScore = positiveDevSum * svWeight

        return (mean, localizedScore, sv)
    }
}

// MARK: - Errors

public enum MotionError: Error, CustomStringConvertible {
    case noMetalDevice
    case metalSetupFailed(String)
    case noVideoTrack
    case readerSetupFailed

    public var description: String {
        switch self {
        case .noMetalDevice: return "No Metal device available"
        case .metalSetupFailed(let msg): return "Metal setup failed: \(msg)"
        case .noVideoTrack: return "No video track found in file"
        case .readerSetupFailed: return "Failed to create AVAssetReader"
        }
    }
}
