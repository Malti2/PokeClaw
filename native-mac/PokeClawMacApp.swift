import Foundation
import SwiftUI

@main
struct PokeClawMacApp: App {
    @StateObject private var model = PokeClawConnectionModel()
    @AppStorage("pokeclaw.accentColor") private var accentColorName = "blue"

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
        }
        .tint(Self.accentColor(named: accentColorName))
        .windowResizability(.contentSize)
        .windowToolbarStyle(.unifiedCompact)

        Settings {
            PokeClawSettingsView(model: model)
        }
        .tint(Self.accentColor(named: accentColorName))
    }

    static func accentColor(named name: String) -> Color {
        switch name {
        case "purple": return .purple
        case "pink": return .pink
        case "red": return .red
        case "orange": return .orange
        case "yellow": return .yellow
        case "green": return .green
        case "mint": return .mint
        case "teal": return .teal
        case "indigo": return .indigo
        default: return .blue
        }
    }
}

struct PokeClawSettingsView: View {
    @ObservedObject var model: PokeClawConnectionModel
    @AppStorage("pokeclaw.accentColor") private var accentColorName = "blue"
    @State private var selectedPane: SettingsPane = .connection

    private enum SettingsPane: String, CaseIterable, Identifiable {
        case appearance = "Appearance"
        case connection = "Connection"
        case about = "About"

        var id: String { rawValue }
    }

    private let accentOptions: [(name: String, label: String, color: Color)] = [
        ("blue", "Blue", .blue),
        ("purple", "Purple", .purple),
        ("pink", "Pink", .pink),
        ("red", "Red", .red),
        ("orange", "Orange", .orange),
        ("yellow", "Yellow", .yellow),
        ("green", "Green", .green),
        ("mint", "Mint", .mint),
        ("teal", "Teal", .teal),
        ("indigo", "Indigo", .indigo)
    ]

    private var appVersion: String {
        let bundle = Bundle.main
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "\(version) (\(build))"
    }

    private var githubURL: URL {
        URL(string: "https://github.com/Malti2/PokeClaw")!
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Settings", selection: $selectedPane) {
                ForEach(SettingsPane.allCases) { pane in
                    Text(pane.rawValue).tag(pane)
                }
            }
            .pickerStyle(.segmented)

            GroupBox {
                switch selectedPane {
                case .appearance:
                    appearancePane
                case .connection:
                    connectionPane
                case .about:
                    aboutPane
                }
            }
        }
        .padding(20)
        .frame(width: 460)
    }

    private var appearancePane: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Accent color")
                .font(.headline)
            Text("Changes apply immediately to the app tint and controls.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Picker("Accent color", selection: $accentColorName) {
                ForEach(accentOptions, id: \.name) { option in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(option.color)
                            .frame(width: 12, height: 12)
                        Text(option.label)
                    }
                    .tag(option.name)
                }
            }
            .pickerStyle(.menu)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var connectionPane: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Server connection")
                .font(.headline)
            Text("Edit host and port to point PokeClaw at a different MCP server.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 12) {
                TextField("Host", text: $model.serverHost)
                Stepper(value: $model.serverPort, in: 1...65535, step: 1) {
                    HStack {
                        Text("Port")
                        Spacer()
                        Text("\(model.serverPort)")
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Current endpoint")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(model.localEndpoint)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var aboutPane: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("About PokeClaw")
                .font(.headline)
            Text("A native macOS companion for Poke and the local MCP server.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 10) {
                LabeledContent("Version", value: appVersion)
                LabeledContent("GitHub", value: githubURL.absoluteString)
                    .textSelection(.enabled)
                LabeledContent("Credits", value: "SwiftUI, AppKit, Poke, and the local MCP tooling")
            }
            .font(.callout)
            .textSelection(.enabled)

            Link(destination: githubURL) {
                Label("Open GitHub repository", systemImage: "arrow.up.right.square")
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@MainActor
final class PokeClawConnectionModel: ObservableObject {
    struct LogResponse: Decodable {
        let lines: [String]
    }

    struct ConsoleResponse: Decodable {
        let lines: [ConsoleLine]
    }

    struct ConsoleLine: Decodable, Identifiable {
        let stream: String
        let line: String
        var id: String { "\(stream)-\(line)" }
    }

    struct ToolCallsResponse: Decodable {
        let calls: [ToolCallEntry]
    }

    struct ToolCallEntry: Decodable, Identifiable {
        let timestamp: String
        let tool: String
        let preview: String
        var id: String { "\(timestamp)-\(tool)-\(preview)" }
    }

    struct HealthResponse: Decodable {
        let status: String
        let name: String
        let version: String
        let auth: Bool
        let roots: Int
    }

    struct MCPResponse: Decodable {
        let result: MCPResult?
        let error: MCPError?
    }

    struct MCPError: Decodable {
        let code: Int
        let message: String
    }

    struct MCPResult: Decodable {
        let content: [MCPContentItem]?
    }

    struct MCPContentItem: Decodable {
        let type: String
        let text: String?
    }

    @Published var serverHost: String = UserDefaults.standard.string(forKey: "pokeclaw.serverHost") ?? "127.0.0.1" {
        didSet {
            UserDefaults.standard.set(serverHost, forKey: "pokeclaw.serverHost")
        }
    }
    @Published var serverPort: Int = {
        let defaults = UserDefaults.standard
        if defaults.object(forKey: "pokeclaw.serverPort") == nil { return 3741 }
        return defaults.integer(forKey: "pokeclaw.serverPort")
    }() {
        didSet {
            UserDefaults.standard.set(serverPort, forKey: "pokeclaw.serverPort")
        }
    }
    var serverBaseURL: String { "http://\(serverHost):\(serverPort)" }
    var localEndpoint: String { "\(serverBaseURL)/mcp" }
    var healthEndpoint: String { "\(serverBaseURL)/health" }
    var logsEndpoint: String { "\(serverBaseURL)/logs" }
    var consoleEndpoint: String { "\(serverBaseURL)/console" }
    var toolCallsEndpoint: String { "\(serverBaseURL)/tool-calls" }
    @Published var tunnelEndpoint: String = "https://your-tunnel.trycloudflare.com/mcp"
    @Published var customCommand: String = ""
    @Published var customCommandOutput: String = "Enter a command to run on this Mac."
    @Published var isRunningCustomCommand: Bool = false
    @Published var serverStatus: String = "Checking server status…"
    @Published var statusMessage: String = "Ready to connect PokeClaw"
    @Published var lastAction: String = "No action yet"
    @Published var lastStatusRefresh: String = "Never"
    @Published var searchRoot: String = "~/Projects"
    @Published var searchQuery: String = "PokeClaw"
    @Published var searchTextOutput: String = "Tap searchtext to see results."
    @Published var systemInfoOutput: String = "Tap systeminfo to inspect the host."
    @Published var systemCpuUsage: String = "—"
    @Published var systemMemoryUsage: String = "—"
    @Published var systemMonitoringUpdated: String = "Never"
    @Published var consoleLines: [ConsoleLine] = [.init(stream: "stdout", line: "Waiting for server console…")]
    @Published var toolCalls: [ToolCallEntry] = []
    @Published var logLines: [String] = ["Waiting for server logs…"]
    @Published var isConnected: Bool = false
    @Published var isLoadingLogs: Bool = false
    @Published var isRefreshingStatus: Bool = false
    @Published var isRunningSearch: Bool = false
    @Published var isLoadingSystemInfo: Bool = false
    @Published var isLoadingConsole: Bool = false
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
        await refreshConsole()
        await refreshToolCalls()
        await refreshSystemMonitoring()
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            if Task.isCancelled { break }
            await refreshServerStatus()
            await refreshConsole()
            await refreshToolCalls()
            await refreshSystemMonitoring()
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
                serverStatus = "Online · \(health.version) · \(health.roots) roots"
                isConnected = health.status.lowercased() == "ok"
                statusMessage = isConnected ? "Server healthy and ready" : "Server responded with status \(health.status)"
                lastAction = "Refreshed server status"
                lastStatusRefresh = timestamp()
            } else {
                serverStatus = "Online · Health payload received"
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

    func refreshConsole() async {
        guard let url = URL(string: consoleEndpoint) else {
            statusMessage = "Invalid console endpoint"
            return
        }

        isLoadingConsole = true
        defer { isLoadingConsole = false }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(ConsoleResponse.self, from: data)
            consoleLines = response.lines.isEmpty ? [.init(stream: "stdout", line: "No console lines yet.")] : response.lines
            lastAction = "Refreshed console"
            statusMessage = "Loaded \(consoleLines.count) console lines"
        } catch {
            consoleLines = [.init(stream: "stderr", line: "Failed to load console: \(error.localizedDescription)")]
            statusMessage = "Could not fetch server console"
            lastAction = "Console refresh failed"
        }
    }

    func runSystemInfo() async {
        await refreshSystemMonitoring()
    }

    func refreshSystemMonitoring() async {
        isLoadingSystemInfo = true
        defer { isLoadingSystemInfo = false }

        do {
            let output = try await callTool(name: "system_info", arguments: [:])
            systemInfoOutput = output
            systemCpuUsage = metricValue(for: "cpu_percent", in: output).map { "\($0)%" } ?? "—"
            systemMemoryUsage = metricValue(for: "memory_percent", in: output).map { "\($0)%" } ?? "—"
            systemMonitoringUpdated = timestamp()
            lastAction = "Refreshed system monitoring"
            statusMessage = "Loaded CPU and RAM metrics"
        } catch {
            systemInfoOutput = "systeminfo failed: \(error.localizedDescription)"
            systemCpuUsage = "—"
            systemMemoryUsage = "—"
            systemMonitoringUpdated = timestamp()
            lastAction = "systeminfo failed"
            statusMessage = "Could not load systeminfo"
        }
    }

    func refreshToolCalls() async {
        guard let url = URL(string: toolCallsEndpoint) else {
            statusMessage = "Invalid tool calls endpoint"
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(ToolCallsResponse.self, from: data)
            toolCalls = Array(response.calls.suffix(6).reversed())
        } catch {
            toolCalls = []
        }
    }

    func runCustomCommand() async {
        let command = customCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty else {
            customCommandOutput = "Enter a command first."
            statusMessage = "Custom command is empty"
            return
        }

        isRunningCustomCommand = true
        defer { isRunningCustomCommand = false }

        do {
            let output = try await executeShellCommand(command)
            customCommandOutput = output.isEmpty ? "(no output)" : output
            lastAction = "Ran custom command"
            statusMessage = "Custom command finished"
        } catch {
            customCommandOutput = "Command failed: \(error.localizedDescription)"
            lastAction = "Custom command failed"
            statusMessage = "Could not run custom command"
        }
    }

    func runSearchText() async {
        isRunningSearch = true
        defer { isRunningSearch = false }

        do {
            let output = try await callTool(
                name: "search_text",
                arguments: [
                    "root": searchRoot,
                    "query": searchQuery,
                    "max_results": "12"
                ]
            )
            searchTextOutput = output
            lastAction = "Ran searchtext for \(searchQuery)"
            statusMessage = output == "No matches found." ? "No search matches in \(searchRoot)" : "Search results loaded"
        } catch {
            searchTextOutput = "searchtext failed: \(error.localizedDescription)"
            lastAction = "searchtext failed"
            statusMessage = "Could not run searchtext"
        }
    }

    private func metricValue(for key: String, in output: String) -> String? {
        output
            .split(separator: "\n")
            .first(where: { $0.hasPrefix("\(key)=") })
            .flatMap { line in
                let pieces = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                return pieces.count == 2 ? String(pieces[1]).trimmingCharacters(in: .whitespacesAndNewlines) : nil
            }
    }

    private func metricValue(for key: String, in output: String) -> String? {
        output
            .split(separator: "\n")
            .first(where: { $0.hasPrefix("\(key)=") })
            .flatMap { line in
                let pieces = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                return pieces.count == 2 ? String(pieces[1]).trimmingCharacters(in: .whitespacesAndNewlines) : nil
            }
    }

    private func executeShellCommand(_ command: String) async throws -> String {
        try await Task.detached(priority: .userInitiated) {
            let process = Process()
            let pipe = Pipe()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.arguments = ["-lc", command]
            process.standardOutput = pipe
            process.standardError = pipe
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            if process.terminationStatus == 0 {
                return output.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            let suffix = output.trimmingCharacters(in: .whitespacesAndNewlines)
            let statusLine = "Exit code: \(process.terminationStatus)"
            return suffix.isEmpty ? statusLine : suffix + "\n" + statusLine
        }.value
    }

    func callTool(name: String, arguments: [String: String]) async throws -> String {
        guard let url = URL(string: localEndpoint) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "jsonrpc": "2.0",
            "id": UUID().uuidString,
            "method": "tools/call",
            "params": [
                "name": name,
                "arguments": arguments
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(MCPResponse.self, from: data)

        if let error = response.error {
            throw NSError(domain: "PokeClawMCP", code: error.code, userInfo: [NSLocalizedDescriptionKey: error.message])
        }

        let text = response.result?.content?
            .compactMap { $0.text }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return (text?.isEmpty == false ? text! : "(no output)")
    }
}
