// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PLMSMotion",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "plms-motion", targets: ["PLMSMotionCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0"),
    ],
    targets: [
        .executableTarget(
            name: "PLMSMotionCLI",
            dependencies: [
                "PLMSMotion",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ]
        ),
        .target(
            name: "PLMSMotion"
        ),
        .testTarget(
            name: "PLMSMotionTests",
            dependencies: ["PLMSMotion"]
        ),
    ]
)
