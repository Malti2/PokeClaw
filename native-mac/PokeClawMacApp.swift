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

    struct HealthResponse: Decodable {
        let status: String
        let name: String
        let version: String
        let auth: Bool
        let roots: Int
    }

    @Published var localEndpoint: String = "http://127.0.0.1:3741/mcp"
    @Published var healthEndpoint: String = "http://127.0.0.1:3741/health"
    @Published var logsEndpoint: String = "http://127.0.0.1:3741/logs"
    @Published var tunnelEndpoint: String = "https://your-tunnel.trycloudflare.com/mcp"
    @Published var serverStatus: String = "Checking server status\u2026"
    @Published var statusMessage: String = "Ready to connect PokeClaw"
    @Published var lastAction: String = "No action yet"
    @Published var lastStatusRefresh: String = "Never"
    @Published var searchRoot: String = "~/Projects"
    @Published var searchQuery: String = "PokeClaw"
    @Published var logLines: [String] = ["Waiting for server logs\u2026"]
    @Published var isConnected: Bool = false
    @Published var isLoadingLogs: Bool = false
    @Published var isRefreshingStatus: Bool = false
    @Published var notes: [String] = [
        "Keep the local MCP server running",
        "Show the health endpoint alongside the MCP URL",
        "Promote the app to a menu bar utility next"
    ]

    private func timestamp() -> String {
        Date().formatted(date: .omitted, time: .shortened)
    }

    func startAutoRefresh() async {
        await refreshServerStatus()
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            if Task.isCancelled { break }
            await refreshServerStatus()
        }
    }

    func refreshServerStatus() async {
        guard let url = URL(string: healthEndpoint) else {
            serverStatus = "Invalid health endpoint"
            statusMessage = "Health check URL is invalid"
            lastAction = "Status refresh failed"
            return
        }

        isRefreshingStatus = true
        defer { isRefreshingStatus = false }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let health = try? JSONDecoder().decode(HealthResponse.self, from: data) {
                serverStatus = "Online \u00B7 \(health.version) \u00B7 \(health.roots) roots"
                isConnected = health.status.lowercased() == "ok"
                statusMessage = isConnected ? "Server healthy and ready" : "Server responded with status \(health.status)"
                lastAction = "Refreshed server status"
                lastStatusRefresh = timestamp()
            } else {
                serverStatus = "Online \u00B7 Health payload received"
                isConnected = true
                statusMessage = "Server responded, but the payload was not decoded"
                lastAction = "Refreshed server status"
                lastStatusRefresh = timestamp()
            }
        } catch {
            serverStatus = "Offline"
            isConnected = false
            statusMessage = "Could not reach the local server"
            lastAction = "Status refresh failed"
            lastStatusRefresh = timestamp()
        }
    }

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
