// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "NSE",
    platforms: [
        .iOS(.v15),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "NSE",
            targets: ["NSE"]
        )
    ],
    dependencies: [
        // secp256k1 Schnorr signing
        .package(url: "https://github.com/21-DOT-DEV/swift-secp256k1", from: "0.17.0")
    ],
    targets: [
        .target(
            name: "NSE",
            dependencies: [
                .product(name: "secp256k1", package: "swift-secp256k1")
            ],
            path: "Sources/NSE"
        ),
        .testTarget(
            name: "NSETests",
            dependencies: ["NSE"],
            path: "Tests/NSETests"
        )
    ]
)
