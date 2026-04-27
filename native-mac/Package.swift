// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PokeClaw",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "PokeClaw", targets: ["PokeClaw"])
    ],
    targets: [
        .executableTarget(
            name: "PokeClaw",
            path: "."
        )
    ]
)
