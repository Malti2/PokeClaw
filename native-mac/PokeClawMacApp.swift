import SwiftUI

@main
struct PokeClawMacApp: App {
    @StateObject private var model = PokeClawConnectionModel()

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
        }
        .windowResizability(.contentSize)
        .windowToolbarStyle(.unifiedCompact)
    }
}

final class PokeClawConnectionModel: ObservableObject {
    @Published var localEndpoint: String = "http://127.0.0.1:3741/mcp"
    @Published var tunnelEndpoint: String = "https://your-tunnel.trycloudflare.com/mcp"
    @Published var statusMessage: String = "Ready to connect PokeClaw"
    @Published var isConnected: Bool = false
    @Published var notes: [String] = [
        "Keep the local MCP server running",
        "Point Poke to the tunnel endpoint",
        "Promote the app to a menu bar utility next"
    ]
}
