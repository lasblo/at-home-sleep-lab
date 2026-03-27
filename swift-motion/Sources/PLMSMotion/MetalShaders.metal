#include <metal_stdlib>
using namespace metal;

// Absolute difference of two textures, cropped to ROI (bottom portion of frame)
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

// Reduce a diff texture into per-cell means for an 8x4 grid.
// Each threadgroup handles one grid cell.
// Dispatch with threadgroups = (8, 4, 1), threads_per_threadgroup = (cellW, cellH, 1) clamped to device max.
// We use a two-pass approach: each thread accumulates a strip, then threadgroup reduction.
kernel void grid_reduce(
    texture2d<float, access::read> diffTex [[texture(0)]],
    device float *cellMeans [[buffer(0)]],
    constant uint2 &cellSize [[buffer(1)]],  // (cellWidth, cellHeight)
    uint2 groupId [[threadgroup_position_in_grid]],
    uint2 localId [[thread_position_in_threadgroup]],
    uint2 groupSize [[threads_per_threadgroup]],
    uint localIndex [[thread_index_in_threadgroup]]
) {
    uint cellX = groupId.x;
    uint cellY = groupId.y;
    uint cw = cellSize.x;
    uint ch = cellSize.y;
    uint startX = cellX * cw;
    uint startY = cellY * ch;
    uint texW = diffTex.get_width();
    uint texH = diffTex.get_height();

    // Each thread sums over a portion of the cell pixels
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

    // Threadgroup reduction using SIMD
    float simdSum = simd_sum(localSum);

    // First thread in each SIMD group writes to shared memory
    threadgroup float partialSums[32]; // max 32 SIMD groups
    uint simdGroupIndex = localIndex / 32;
    if (localIndex % 32 == 0) {
        partialSums[simdGroupIndex] = simdSum;
    }
    threadgroup_barrier(mem_flags::mem_threadgroup);

    // First thread reduces partial sums
    if (localIndex == 0) {
        uint numSimdGroups = (threadsInGroup + 31) / 32;
        float total = 0.0;
        for (uint i = 0; i < numSimdGroups; i++) {
            total += partialSums[i];
        }
        cellMeans[cellY * 8 + cellX] = total / float(cw * ch);
    }
}
