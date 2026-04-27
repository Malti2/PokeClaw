import AppKit
import Foundation
import SwiftUI
import UniformTypeIdentifiers
import UserNotifications

@main
struct PokeClawMacApp: App {
    @StateObject private var model = PokeClawConnectionModel()
    @AppStorage("pokeclaw.accentColor") private var accentColorName = "blue"
    @AppStorage("pokeclaw.appearanceMode") private var appearanceMode = "dark"

    init() {
        NSApplication.shared.setActivationPolicy(.accessory)
    }
    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
                .preferredColorScheme(Self.colorScheme(named: appearanceMode))
        }
        .tint(Self.accentColor(named: accentColorName))
        .windowResizability(.contentSize)
        .windowToolbarStyle(.unifiedCompact)

        Settings {
            PokeClawSettingsView(model: model)
                .preferredColorScheme(Self.colorScheme(named: appearanceMode))
        }
        .tint(Self.accentColor(named: accentColorName))

        MenuBarExtra {
            PokeClawMenuBarPopoverView(model: model)
                .preferredColorScheme(Self.colorScheme(named: appearanceMode))
        } label: {
            PokeClawMenuBarIcon(isConnected: model.isConnected)
        }
        .menuBarExtraStyle(.window)
    }

    static func colorScheme(named name: String) -> ColorScheme? {
        name == "light" ? .light : .dark
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
    @AppStorage("pokeclaw.appearanceMode") private var appearanceMode = "dark"
    @AppStorage("pokeclaw.autoStartOnLogin") private var autoStartOnLogin = false
    @AppStorage("pokeclaw.notificationsEnabled") private var notificationsEnabled = false
    @State private var selectedPane: SettingsPane = .connection

    private enum SettingsPane: String, CaseIterable, Identifiable {
        case appearance = "Appearance"
        case connection = "Connection"
        case notifications = "Notifications"
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
                case .notifications:
                    notificationsPane
                case .about:
                    aboutPane
                }
            }
        }
        .task {
            await model.syncLaunchAgent(enabled: autoStartOnLogin)
            await model.syncNotificationSettings(enabled: notificationsEnabled)
        }
        .onChange(of: autoStartOnLogin) { enabled in
            Task { await model.updateLaunchAgent(enabled: enabled) }
        }
        .onChange(of: notificationsEnabled) { enabled in
            Task { await model.updateNotificationSettings(enabled: enabled) }
        }
        .padding(20)
        .frame(width: 460)
    }

    private var appearancePane: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Theme")
                .font(.headline)
            Text("Toggle between dark and light mode for the Mac app.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Picker("Appearance", selection: $appearanceMode) {
                Text("Dark").tag("dark")
                Text("Light").tag("light")
            }
            .pickerStyle(.segmented)

            Divider()

            Text("Accent color")
                .font(.headline)
            Text("Changes apply immediately to the app tint and controls.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Picker("Accent color", selection: $accentColorName) {
                ForEach(accentOptions, id: \.label) { option in
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

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Toggle(isOn: $autoStartOnLogin) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Auto-Start on Login")
                            Text("Creates a LaunchAgent plist in ~/Library/LaunchAgents so PokeClaw starts when you log into macOS.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .toggleStyle(.switch)

                    Text(model.launchAgentPath)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var notificationsPane: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Notifications")
                .font(.headline)
            Text("Send local macOS notifications when the server goes offline or a command fails.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Toggle(isOn: $notificationsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Enable notifications")
                    Text("Requires notification permission from macOS.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch)

            HStack {
                Button("Request Permission") {
                    Task { await model.requestNotificationPermission() }
                }
                .buttonStyle(.bordered)

                Spacer()

                Text(model.notificationStatusText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
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

struct PokeClawMenuBarIcon: View {
    let isConnected: Bool

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Image(systemName: "pawprint.fill")
                .symbolRenderingMode(.hierarchical)
            Circle()
                .fill(isConnected ? Color.green : Color.red)
                .frame(width: 7, height: 7)
                .overlay(Circle().stroke(Color(nsColor: .windowBackgroundColor), lineWidth: 1.5))
                .offset(x: 2, y: 2)
        }
        .font(.system(size: 14, weight: .semibold))
        .padding(.trailing, 1)
        .accessibilityLabel(isConnected ? "PokeClaw connected" : "PokeClaw disconnected")
    }
}

struct PokeClawMenuBarPopoverView: View {
    @ObservedObject var model: PokeClawConnectionModel
    @State private var isRunningCommand: Bool = false

    private var lastLogLine: String {
        model.logLines.last ?? "No log lines yet."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("PokeClaw")
                        .font(.headline)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(model.isConnected ? .green : .red)
                            .frame(width: 7, height: 7)
                        Text(model.serverStatus)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button("Open") {
                    NSApplication.shared.activate(ignoringOtherApps: true)
                    NSApplication.shared.windows.first?.makeKeyAndOrderFront(nil)
                }
                .buttonStyle(.bordered)

                Button("Refresh") {
                    Task {
                        await model.refreshServerStatus()
                        await model.refreshLogs()
                    }
                }
                .buttonStyle(.bordered)
            }

            GroupBox("Server Status") {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(model.isConnected ? .green : .orange)
                            .frame(width: 8, height: 8)
                        Text(model.serverStatus)
                            .font(.callout.weight(.medium))
                    }
                    Text(model.healthEndpoint)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    Text(model.lastStatusRefresh == "Never" ? "No status refresh yet." : "Last refresh: \(model.lastStatusRefresh)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            GroupBox("Custom Command") {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("Run a shell command", text: $model.customCommand)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { runCommand() }

                    HStack {
                        Button(isRunningCommand ? "Running\u{2026}" : "Run") {
                            runCommand()
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.customCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isRunningCommand)

                        Spacer()

                        Text(model.customCommandOutput)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .truncationMode(.tail)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            GroupBox("Latest Log Line") {
                VStack(alignment: .leading, spacing: 8) {
                    Text(lastLogLine)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.primary)
                        .textSelection(.enabled)
                        .lineLimit(4)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack {
                        Text("Latest from /logs")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Export Logs") {
                            Task { await model.exportConsoleLogs() }
                        }
                        .buttonStyle(.bordered)

                        Button("Refresh logs") {
                            Task { await model.refreshLogs() }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(16)
        .frame(width: 360)
        .task {
            await model.refreshServerStatus()
            await model.refreshLogs()
        }
    }

    private func runCommand() {
        let trimmed = model.customCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        model.customCommand = trimmed
        isRunningCommand = true
        Task {
            await model.runCustomCommand()
            await MainActor.run {
                isRunningCommand = false
            }
        }
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

    struct CustomCommandBanner: Equatable {
        enum Style: String, Equatable {
            case success
            case failure

            var tint: Color {
                switch self {
                case .success: return .green
                case .failure: return .red
                }
            }

            var background: Color { tint.opacity(0.16) }

            var symbol: String {
                switch self {
                case .success: return "checkmark.circle.fill"
                case .failure: return "xmark.octagon.fill"
                }
            }
        }

        let message: String
        let style: Style
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
    @Published var customCommandBanner: CustomCommandBanner? = nil
    @Published var isRunningCustomCommand: Bool = false
    @Published var serverStatus: String = "Checking server status\u{2026}"
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
    @Published var systemCpuHistory: [Double] = []
    @Published var systemMemoryHistory: [Double] = []
    @Published var consoleLines: [ConsoleLine] = [.init(stream: "stdout", line: "Waiting for server console\u{2026}")]
    @Published var toolCalls: [ToolCallEntry] = []
    @Published var logLines: [String] = ["Waiting for server logs\u{2026}"]
    @Published var isConnected: Bool = false
    @Published var isLoadingLogs: Bool = false
    @Published var isRefreshingStatus: Bool = false
    @Published var isRunningSearch: Bool = false
    @Published var isLoadingSystemInfo: Bool = false
    @Published var isLoadingConsole: Bool = false
    @Published var notificationStatusText: String = "Notifications idle"
    var notificationsEnabled: Bool = false
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

    func syncNotificationSettings(enabled: Bool) async {
        notificationsEnabled = enabled
        if enabled {
            await requestNotificationPermission()
        } else {
            notificationStatusText = "Notifications disabled"
        }
    }

    func updateNotificationSettings(enabled: Bool) async {
        notificationsEnabled = enabled
        if enabled {
            await requestNotificationPermission()
        } else {
            notificationStatusText = "Notifications disabled"
        }
    }

    func requestNotificationPermission() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            notificationStatusText = granted ? "Notifications enabled" : "Notifications blocked"
        } catch {
            notificationStatusText = "Notification permission failed"
        }
    }

    private func sendLocalNotification(title: String, body: String) async {
        guard notificationsEnabled else { return }

        let center = UNUserNotificationCenter.current()
        let authorizationStatus = await notificationAuthorizationStatus()
        guard authorizationStatus == .authorized || authorizationStatus == .provisional else {
            notificationStatusText = "Notifications need permission"
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        do {
            try await center.add(request)
            notificationStatusText = "Notification sent"
        } catch {
            notificationStatusText = "Notification failed"
        }
    }

    func refreshServerStatus() async {
        guard let url = URL(string: healthEndpoint) else {
            serverStatus = "Invalid health endpoint"
            statusMessage = "Health check URL is invalid"
            lastAction = "Status refresh failed"
            return
        }

        let wasConnected = isConnected

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
            if wasConnected {
                await sendLocalNotification(title: "PokeClaw server offline", body: "The local server stopped responding.")
            }
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
            let cpu = metricValue(for: "cpu_percent", in: output)
            let memory = metricValue(for: "memory_percent", in: output)
            systemCpuUsage = cpu.map { "\($0)%" } ?? "—"
            systemMemoryUsage = memory.map { "\($0)%" } ?? "—"
            appendSystemMetricHistory(cpu, to: &systemCpuHistory)
            appendSystemMetricHistory(memory, to: &systemMemoryHistory)
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
            customCommandBanner = .init(message: "Custom command finished", style: .success)
            recordCustomCommandHistory(command)
            lastAction = "Ran custom command"
            statusMessage = "Custom command finished"
        } catch {
            customCommandOutput = "Command failed: \(error.localizedDescription)"
            customCommandBanner = .init(message: "Custom command failed", style: .failure)
            recordCustomCommandHistory(command)
            lastAction = "Custom command failed"
            statusMessage = "Could not run custom command"
            await sendLocalNotification(title: "PokeClaw command failed", body: command)
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

    private func notificationAuthorizationStatus() async -> UNAuthorizationStatus {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
    }

    func exportConsoleLogs() async {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = "pokeclaw-console-logs.txt"
        panel.title = "Export Console Logs"
        panel.message = "Choose where to save the console logs."

        let response = panel.runModal()
        guard response == .OK, let url = panel.url else { return }

        let logText = consoleLines.map { line in
            if line.stream.isEmpty { return line.line }
            return "[\(line.stream)] \(line.line)"
        }.joined(separator: "\n")

        do {
            try logText.write(to: url, atomically: true, encoding: .utf8)
            statusMessage = "Exported console logs"
            lastAction = "Exported console logs"
        } catch {
            statusMessage = "Failed to export console logs"
            lastAction = "Console log export failed"
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

    private var launchAgentLabel: String { "com.malti2.pokeclaw" }

    private var launchAgentURL: URL {
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library")
        return library.appendingPathComponent("LaunchAgents").appendingPathComponent("\(launchAgentLabel).plist")
    }

    var launchAgentPath: String { launchAgentURL.path }

    private func launchAgentPlistData() throws -> Data {
        let executablePath = Bundle.main.executableURL?.path ?? Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/PokeClaw").path
        let launchAgent: [String: Any] = [
            "Label": launchAgentLabel,
            "ProgramArguments": [executablePath],
            "RunAtLoad": true,
            "KeepAlive": false,
            "StandardOutPath": FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("PokeClaw/pokeclaw-launchagent.log").path ?? "",
            "StandardErrorPath": FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("PokeClaw/pokeclaw-launchagent.log").path ?? ""
        ]
        return try PropertyListSerialization.data(fromPropertyList: launchAgent, format: .xml, options: 0)
    }

    func syncLaunchAgent(enabled: Bool) async {
        let exists = FileManager.default.fileExists(atPath: launchAgentURL.path)
        guard enabled != exists else { return }
        await updateLaunchAgent(enabled: enabled)
    }

    func updateLaunchAgent(enabled: Bool) async {
        do {
            if enabled {
                try installLaunchAgent()
                statusMessage = "Auto-start enabled"
                lastAction = "Enabled auto-start on login"
            } else {
                try removeLaunchAgent()
                statusMessage = "Auto-start disabled"
                lastAction = "Disabled auto-start on login"
            }
        } catch {
            statusMessage = "Auto-start update failed"
            lastAction = "LaunchAgent update failed"
        }
    }

    private func installLaunchAgent() throws {
        let directory = launchAgentURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
        let data = try launchAgentPlistData()
        try data.write(to: launchAgentURL, options: .atomic)
    }

    private func removeLaunchAgent() throws {
        if FileManager.default.fileExists(atPath: launchAgentURL.path) {
            try FileManager.default.removeItem(at: launchAgentURL)
        }
    }

    private let customCommandHistoryKey = "pokeclaw.customCommandHistory"

    private func recordCustomCommandHistory(_ command: String) {
        let trimmed = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var history = UserDefaults.standard.stringArray(forKey: customCommandHistoryKey) ?? []
        history.removeAll { $0 == trimmed }
        history.insert(trimmed, at: 0)
        if history.count > 25 {
            history = Array(history.prefix(25))
        }
        UserDefaults.standard.set(history, forKey: customCommandHistoryKey)
    }

    private func appendSystemMetricHistory(_ value: String?, to history: inout [Double]) {
        guard let value, let doubleValue = Double(value) else { return }
        history.append(doubleValue)
        if history.count > 24 {
            history = Array(history.suffix(24))
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
