import Foundation
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

@MainActor
final class PokeClawConnectionModel: ObservableObject {
    struct LogResponse: Decodable {
        let lines: [String]
    }

    @Published var localEndpoint: String = "http://127.0.0.1:3741/mcp"
    @Published var healthEndpoint: String = "http://127.0.0.1:3741/health"
    @Published var logsEndpoint: String = "http://127.0.0.1:3741/logs"
    @Published var tunnelEndpoint: String = "https://your-tunnel.trycloudflare.com/mcp"
    @Published var statusMessage: String = "Ready to connect PokeClaw"
    @Published var lastAction: String = "No action yet"
    @Published var searchRoot: String = "~/Projects"
    @Published var searchQuery: String = "PokeClaw"
    @Published var logLines: [String] = ["Waiting for server logs\u2026"]
    @Published var isConnected: Bool = false
    @Published var isLoadingLogs: Bool = false
    @Published var notes: [String] = [
        "Keep the local MCP server running",
        "Show the health endpoint alongside the MCP URL",
        "Promote the app to a menu bar utility next"
    ]

    func refreshLogs() async {
        guard let url = URL(string: logsEndpoint) else {
            statusMessage = "Invalid logs endpoint"
            return
        }

        isLoadingLogs = true
        defer { isLoadingLogs = false }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(LogResponse.self, from: data)
            logLines = response.lines.isEmpty ? ["No log lines yet."] : response.lines
            lastAction = "Refreshed MCP logs"
            statusMessage = "Loaded \(logLines.count) recent log lines"
        } catch {
            logLines = ["Failed to load logs: \(error.localizedDescription)"]
            statusMessage = "Could not fetch MCP logs"
            lastAction = "Log refresh failed"
        }
    }
}
