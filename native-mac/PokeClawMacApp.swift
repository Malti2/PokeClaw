import AppKit
import Foundation
import SwiftUI

@main
@MainActor
struct PokeClawMacApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }

        Settings {
            PokeClawSettingsView(model: model)
        }

        MenuBarExtra("PokeClaw", systemImage: "pawprint.fill") {
            PokeClawMenuBarPopoverView(model: model)
        }
    }
}

@MainActor
private struct PokeClawSettingsView: View {
    @AppStorage("pokeclaw.serverHost") private var serverHost = "127.0.0.1"
    @AppStorage("pokeclaw.serverPort") private var serverPort = 3741
    @AppStorage("pokeclaw.serverBunPath") private var serverBunPath = "/opt/homebrew/bin/bun"
    @AppStorage("pokeclaw.serverScriptPath") private var serverScriptPath = "~/pokeclaw/server.ts"
    @AppStorage("pokeclaw.serverToken") private var serverToken = ""
    @AppStorage("pokeclaw.serverLogLevel") private var serverLogLevel = "info"
    @AppStorage("pokeclaw.launchAtLogin") private var launchAtLogin = false
    @AppStorage("pokeclaw.notificationsEnabled") private var notificationsEnabled = false
    @AppStorage("pokeclaw.hasSeenOnboarding") private var hasSeenOnboarding = false

    @State private var selectedSection: SectionID = .general
    @State private var launchStatus = ""
    @State private var notificationStatus = ""
    @State private var updateStatus = ""
    @State private var latestReleaseURL: URL? = nil
    @State private var isCheckingUpdates = false

    @Environment(\.openURL) private var openURL

    private enum SectionID: String, CaseIterable, Identifiable {
        case general = "General"
        case mcp = "MCP"
        case permissions = "Permissions"
        case updates = "Updates"
        case about = "About"

        var id: String { rawValue }
    }

    private var mcpURL: String {
        var components = URLComponents()
        components.scheme = "http"
        components.host = serverHost
        components.port = serverPort
        components.path = "/mcp"
        if !serverToken.isEmpty {
            components.queryItems = [URLQueryItem(name: "token", value: serverToken)]
        }
        return components.string ?? "http://\(serverHost):\(serverPort)/mcp"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Settings section", selection: $selectedSection) {
                ForEach(SectionID.allCases) { section in
                    Text(section.rawValue).tag(section)
                }
            }
            .pickerStyle(.segmented)

            GroupBox {
                switch selectedSection {
                case .general:
                    generalSection
                case .mcp:
                    mcpSection
                case .permissions:
                    permissionsSection
                case .updates:
                    updatesSection
                case .about:
                    aboutSection
                }
            }
        }
        .padding(20)
        .frame(width: 520)
        .task {
            syncLaunchState()
            syncNotificationState()
            await refreshUpdateStatus()
        }
    }

    private var generalSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("General")
                .font(.headline)
            Text("Control the core Mac app behavior and reopen the onboarding guide any time.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Toggle(isOn: $launchAtLogin) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Launch at login")
                    Text(launchStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch)
            .onChange(of: launchAtLogin) { enabled in
                updateLaunchAtLogin(enabled: enabled)
            }

            HStack(spacing: 10) {
                Button("Show onboarding") {
                    hasSeenOnboarding = false
                    NSApplication.shared.activate(ignoringOtherApps: true)
                    NSApplication.shared.windows.first?.makeKeyAndOrderFront(nil)
                }
                .buttonStyle(.bordered)

                Button("Open window") {
                    NSApp.activate(ignoringOtherApps: true)
                    NSApp.windows.first?.makeKeyAndOrderFront(nil)
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var mcpSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("MCP connection")
                .font(.headline)
            Text("These settings tell PokeClaw where the local MCP server is running.")
                .font(.caption)
                .foregroundStyle(.secondary)

            labeledField(title: "Server host", value: $serverHost)
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Port")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("3741", value: $serverPort, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 120)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Log level")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("info", text: $serverLogLevel)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 140)
                }
                Spacer()
            }
            labeledField(title: "Bun path", value: $serverBunPath)
            labeledField(title: "Server script", value: $serverScriptPath)
            labeledSecureField(title: "Auth token", value: $serverToken)

            VStack(alignment: .leading, spacing: 4) {
                Text("Shareable MCP URL")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(mcpURL)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
            }

            HStack(spacing: 10) {
                Button("Copy MCP URL") {
                    copyToPasteboard(mcpURL)
                }
                .buttonStyle(.bordered)

                Button("Open repository") {
                    openURL(URL(string: "https://github.com/Malti2/PokeClaw")!)
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var permissionsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Permissions")
                .font(.headline)
            Text("Notifications and login items are optional. PokeClaw explains them up front so you can keep control.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Toggle(isOn: $notificationsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Enable notifications")
                    Text(notificationStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch)
            .onChange(of: notificationsEnabled) { enabled in
                Task { await updateNotifications(enabled: enabled) }
            }

            HStack(spacing: 10) {
                Button("Request permission") {
                    Task { await requestNotificationPermission() }
                }
                .buttonStyle(.bordered)

                Button("Reset onboarding") {
                    hasSeenOnboarding = false
                }
                .buttonStyle(.bordered)

                Spacer()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var updatesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Updates")
                .font(.headline)
            Text("Check the GitHub releases feed for the latest beta build.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(updateStatus)
                        .font(.callout)
                    Text(latestReleaseURL?.absoluteString ?? "No release URL yet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                Spacer()
                Button(isCheckingUpdates ? "Checking…" : "Check now") {
                    Task { await refreshUpdateStatus() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isCheckingUpdates)
            }

            if let latestReleaseURL {
                Button("Open latest release") {
                    openURL(latestReleaseURL)
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("About")
                .font(.headline)
            Text("PokeClaw is the native companion for the local MCP server, built to keep the connection easy to set up and easy to trust.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev")
                LabeledContent("Build", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0")
                LabeledContent("Bundle ID", value: Bundle.main.bundleIdentifier ?? "com.malti2.pokeclaw")
            }
            .font(.callout)

            Button("Open GitHub") {
                openURL(URL(string: "https://github.com/Malti2/PokeClaw")!)
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func labeledField(title: String, value: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField(title, text: value)
                .textFieldStyle(.roundedBorder)
        }
    }

    private func labeledSecureField(title: String, value: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            SecureField(title, text: value)
                .textFieldStyle(.roundedBorder)
        }
    }

    private func copyToPasteboard(_ string: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(string, forType: .string)
    }

    private func syncLaunchState() {
        if #available(macOS 13.0, *) {
            launchAtLogin = SMAppService.mainApp.status == .enabled
            launchStatus = launchAtLogin ? "Enabled in Login Items" : "Disabled"
        } else {
            launchStatus = "Unavailable on this macOS version"
        }
    }

    private func updateLaunchAtLogin(enabled: Bool) {
        guard #available(macOS 13.0, *) else {
            launchStatus = "Unavailable on this macOS version"
            launchAtLogin = false
            return
        }

        do {
            if enabled {
                try SMAppService.mainApp.register()
                launchStatus = "Enabled in Login Items"
            } else {
                try SMAppService.mainApp.unregister()
                launchStatus = "Disabled"
            }
        } catch {
            launchStatus = error.localizedDescription
            launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }

    private func syncNotificationState() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    notificationsEnabled = true
                    notificationStatus = "Notifications are enabled"
                case .denied:
                    notificationsEnabled = false
                    notificationStatus = "Notifications are blocked in System Settings"
                case .notDetermined:
                    notificationsEnabled = false
                    notificationStatus = "Permission has not been requested yet"
                @unknown default:
                    notificationsEnabled = false
                    notificationStatus = "Notification status unavailable"
                }
            }
        }
    }

    private func requestNotificationPermission() async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            await MainActor.run {
                notificationsEnabled = granted
                notificationStatus = granted ? "Notifications are enabled" : "Notifications were not granted"
            }
        } catch {
            await MainActor.run {
                notificationsEnabled = false
                notificationStatus = error.localizedDescription
            }
        }
    }

    private func updateNotifications(enabled: Bool) async {
        if enabled {
            await requestNotificationPermission()
        } else {
            await MainActor.run {
                notificationStatus = "Notifications are off"
            }
        }
    }

    private func refreshUpdateStatus() async {
        guard !isCheckingUpdates else { return }
        isCheckingUpdates = true
        defer { isCheckingUpdates = false }

        let apiURL = URL(string: "https://api.github.com/repos/Malti2/PokeClaw/releases/latest")!
        var request = URLRequest(url: apiURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("PokeClawMac/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                updateStatus = "Unable to check for updates"
                latestReleaseURL = nil
                return
            }

            let release = try JSONDecoder().decode(GitHubRelease.self, from: data)
            latestReleaseURL = release.htmlURL
            updateStatus = "Latest release: \(release.displayName)"
        } catch {
            updateStatus = "Update check failed: \(error.localizedDescription)"
            latestReleaseURL = nil
        }
    }
}

@MainActor
private struct PokeClawMenuBarPopoverView: View {
    @State private var isServerRunning = false
    @State private var lastRefresh = "Never"
    @State private var statusText = "Server stopped"
    @State private var updateText = "No update check yet"

    @AppStorage("pokeclaw.serverHost") private var serverHost = "127.0.0.1"
    @AppStorage("pokeclaw.serverPort") private var serverPort = 3741
    @AppStorage("pokeclaw.serverToken") private var serverToken = ""

    var mcpURL: String {
        var components = URLComponents()
        components.scheme = "http"
        components.host = serverHost
        components.port = serverPort
        components.path = "/mcp"
        if !serverToken.isEmpty {
            components.queryItems = [URLQueryItem(name: "token", value: serverToken)]
        }
        return components.string ?? "http://\(serverHost):\(serverPort)/mcp"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("PokeClaw")
                        .font(.headline)
                    Text(statusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Circle()
                    .fill(isServerRunning ? .green : .orange)
                    .frame(width: 10, height: 10)
            }

            GroupBox("Quick actions") {
                VStack(alignment: .leading, spacing: 10) {
                    Button(isServerRunning ? "Stop server" : "Start server") {
                        toggleServer()
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Open settings") {
                        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                    }
                    .buttonStyle(.bordered)

                    Button("Copy MCP URL") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(mcpURL, forType: .string)
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            GroupBox("Status") {
                VStack(alignment: .leading, spacing: 8) {
                    Text(mcpURL)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    Text("Last refresh: \(lastRefresh)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(updateText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack {
                Button("Check updates") {
                    Task { await checkForUpdates() }
                }
                .buttonStyle(.bordered)

                Spacer()

                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(16)
        .frame(width: 360)
        .task {
            lastRefresh = Date().formatted(date: .omitted, time: .shortened)
            await checkForUpdates()
        }
    }

    private func toggleServer() {
        isServerRunning.toggle()
        statusText = isServerRunning ? "Server running" : "Server stopped"
        lastRefresh = Date().formatted(date: .omitted, time: .shortened)
    }

    private func checkForUpdates() async {
        updateText = "Checking for updates…"
        let apiURL = URL(string: "https://api.github.com/repos/Malti2/PokeClaw/releases/latest")!
        var request = URLRequest(url: apiURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("PokeClawMac/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                updateText = "Update check unavailable"
                return
            }

            let release = try JSONDecoder().decode(GitHubRelease.self, from: data)
            updateText = "Latest release: \(release.displayName)"
        } catch {
            updateText = "Update check failed"
        }
    }
}

private struct GitHubRelease: Decodable {
    let tagName: String
    let name: String?
    let htmlURL: URL

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case name
        case htmlURL = "html_url"
    }

    var displayName: String {
        if let name, !name.isEmpty { return name }
        return tagName
    }
}
