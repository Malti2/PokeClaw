import AppKit
import Foundation
import ServiceManagement
import SwiftUI
import UserNotifications

@MainActor
struct ContentView: View {
    @AppStorage("pokeclaw.hasSeenOnboarding") private var hasSeenOnboarding = false
    @AppStorage("pokeclaw.launchAtLogin") private var launchAtLogin = false
    @AppStorage("pokeclaw.notificationsEnabled") private var notificationsEnabled = false
    @AppStorage("pokeclaw.serverHost") private var serverHost = "127.0.0.1"
    @AppStorage("pokeclaw.serverPort") private var serverPort = 3741
    @AppStorage("pokeclaw.serverBunPath") private var serverBunPath = "/opt/homebrew/bin/bun"
    @AppStorage("pokeclaw.serverScriptPath") private var serverScriptPath = "~/pokeclaw/server.ts"
    @AppStorage("pokeclaw.serverToken") private var serverToken = ""
    @AppStorage("pokeclaw.serverLogLevel") private var serverLogLevel = "info"

    @State private var isServerRunning = false
    @State private var serverStatus = "Server stopped"
    @State private var serverDetail = "The local MCP server is not running yet."
    @State private var updateStatus = "No update check yet"
    @State private var lastChecked = "Never"
    @State private var notificationStatus = "Notifications are off"
    @State private var showOnboarding = false
    @State private var isCheckingForUpdates = false
    @State private var latestReleaseURL: URL? = nil
    @State private var launchStatus: String = "Launch at login is off"

    @Environment(\.openURL) private var openURL

    private let repositoryURL = URL(string: "https://github.com/Malti2/PokeClaw")!

    struct OnboardingStep: Identifiable {
        let id = UUID()
        let symbol: String
        let title: String
        let body: String
    }

    private var onboardingSteps: [OnboardingStep] {
        [
            OnboardingStep(
                symbol: "network",
                title: "What MCP does",
                body: "PokeClaw exposes a local MCP server so Poke can talk to your Mac securely and only through the tunnel you choose."
            ),
            OnboardingStep(
                symbol: "lock.shield",
                title: "Why permissions matter",
                body: "macOS permissions are only needed for extras like notifications and launch-at-login. Your MCP token and server paths stay local."
            ),
            OnboardingStep(
                symbol: "slider.horizontal.3",
                title: "How to get started",
                body: "Set the Bun path, server script, and token; then copy the MCP URL into Poke's integration settings."
            )
        ]
    }

    private var mcpEndpoint: String {
        "http://\(serverHost):\(serverPort)/mcp"
    }

    private var shareableMcpURL: String {
        guard !serverToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return mcpEndpoint }
        var components = URLComponents(string: mcpEndpoint)
        components?.queryItems = [URLQueryItem(name: "token", value: serverToken)]
        return components?.string ?? mcpEndpoint
    }

    private var healthEndpoint: String {
        "http://\(serverHost):\(serverPort)/health"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                onboardingBanner
                overviewGrid
                serverControlSection
                configurationSection
                permissionSection
                updatesSection
                helpSection
            }
            .padding(20)
            .frame(maxWidth: 920, alignment: .leading)
        }
        .frame(minWidth: 760, minHeight: 560)
        .background(
            LinearGradient(
                colors: [Color(nsColor: .windowBackgroundColor), Color(nsColor: .controlBackgroundColor).opacity(0.45)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
        .sheet(isPresented: $showOnboarding, onDismiss: {
            hasSeenOnboarding = true
        }) {
            OnboardingView(isPresented: $showOnboarding, steps: onboardingSteps)
        }
        .task {
            if !hasSeenOnboarding {
                showOnboarding = true
            }
            syncLaunchAtLoginState()
            syncNotificationState()
            await checkForUpdates()
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("PokeClaw")
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                Text("A native macOS control panel for your local MCP server")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            statusBadge
        }
    }

    private var statusBadge: some View {
        VStack(alignment: .trailing, spacing: 6) {
            HStack(spacing: 8) {
                Circle()
                    .fill(isServerRunning ? .green : .orange)
                    .frame(width: 10, height: 10)
                Text(serverStatus)
                    .font(.callout.weight(.medium))
            }
            Text(serverDetail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 240, alignment: .trailing)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
    }

    private var onboardingBanner: some View {
        GroupBox {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: hasSeenOnboarding ? "checkmark.seal.fill" : "sparkles")
                    .font(.title2)
                    .foregroundStyle(hasSeenOnboarding ? .green : .blue)
                VStack(alignment: .leading, spacing: 4) {
                    Text(hasSeenOnboarding ? "Onboarding completed" : "First launch setup")
                        .font(.headline)
                    Text(hasSeenOnboarding ? "You can reopen the guide any time from the menu bar or settings." : "Learn what MCP is, which permissions matter, and how to connect PokeClaw to Poke.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(hasSeenOnboarding ? "Review guide" : "Start guide") {
                    showOnboarding = true
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var overviewGrid: some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 12) {
            GridRow {
                infoCard(title: "MCP endpoint", value: shareableMcpURL, symbol: "network")
                infoCard(title: "Health check", value: healthEndpoint, symbol: "heart.text.square")
            }
            GridRow {
                infoCard(title: "Update status", value: updateStatus, symbol: "arrow.triangle.2.circlepath")
                infoCard(title: "Last checked", value: lastChecked, symbol: "clock")
            }
        }
    }

    private func infoCard(title: String, value: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(title, systemImage: symbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }
            Text(value)
                .font(.system(.callout, design: .monospaced))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .textSelection(.enabled)
            HStack(spacing: 10) {
                Button("Copy") {
                    copyToPasteboard(value)
                }
                .buttonStyle(.bordered)
                if let url = URL(string: value) {
                    Button("Open") {
                        openURL(url)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
    }

    private var serverControlSection: some View {
        GroupBox("Server control") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Start or stop the local Bun server without leaving the Mac app.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    Button(isServerRunning ? "Stop server" : "Start server") {
                        toggleServer()
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Copy MCP URL") {
                        copyToPasteboard(shareableMcpURL)
                    }
                    .buttonStyle(.bordered)

                    Button("Check updates") {
                        Task { await checkForUpdates() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isCheckingForUpdates)

                    Spacer()
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Server detail")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(serverDetail)
                        .font(.callout)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var configurationSection: some View {
        GroupBox("Settings") {
            VStack(alignment: .leading, spacing: 14) {
                Text("These values are stored locally and tell PokeClaw where your Bun runtime and MCP server live.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                labeledField(title: "Bun path", value: $serverBunPath)
                labeledField(title: "Server script path", value: $serverScriptPath)
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

                labeledSecureField(title: "Auth token", value: $serverToken)
            }
            .padding(.vertical, 2)
        }
    }

    private var permissionSection: some View {
        GroupBox("Permissions") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Only the permissions you explicitly enable are requested. Notifications and launch-at-login can be turned on from here.")
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
                    Task { await updateNotificationPermission(enabled: enabled) }
                }

                HStack(spacing: 10) {
                    Button("Request notifications") {
                        Task { await requestNotificationPermission() }
                    }
                    .buttonStyle(.bordered)

                    Button("Reset onboarding") {
                        hasSeenOnboarding = false
                        showOnboarding = true
                    }
                    .buttonStyle(.bordered)

                    Spacer()
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var updatesSection: some View {
        GroupBox("Updates") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("GitHub release check")
                            .font(.callout.weight(.medium))
                        Text(updateStatus)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(isCheckingForUpdates ? "Checking…" : "Check now") {
                        Task { await checkForUpdates() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isCheckingForUpdates)
                }

                HStack(spacing: 10) {
                    Button("Open repository") {
                        openURL(repositoryURL)
                    }
                    .buttonStyle(.bordered)

                    if let latestReleaseURL {
                        Button("Open latest release") {
                            openURL(latestReleaseURL)
                        }
                        .buttonStyle(.bordered)
                    }

                    Spacer()
                    Text("Last checked: \(lastChecked)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var helpSection: some View {
        GroupBox("Quick help") {
            VStack(alignment: .leading, spacing: 10) {
                Label("Copy the MCP URL into Poke's integration settings.", systemImage: "doc.on.doc")
                Label("Use the onboarding guide to review permissions and setup.", systemImage: "sparkles")
                Label("Launch-at-login and notifications are optional and can be disabled anytime.", systemImage: "bell.badge")
            }
            .font(.callout)
        }
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

    private func copyToPasteboard(_ value: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
    }

    private func toggleServer() {
        isServerRunning.toggle()
        serverStatus = isServerRunning ? "Server running" : "Server stopped"
        serverDetail = isServerRunning ? "The local MCP server is available at \(mcpEndpoint)." : "The local MCP server is not running yet."
    }

    private func syncLaunchAtLoginState() {
        if #available(macOS 13.0, *) {
            launchAtLogin = SMAppService.mainApp.status == .enabled
            launchStatus = launchAtLogin ? "Launch at login is enabled" : "Launch at login is off"
        } else {
            launchStatus = "Launch at login is unavailable on this macOS version"
        }
    }

    private func updateLaunchAtLogin(enabled: Bool) {
        guard #available(macOS 13.0, *) else {
            launchStatus = "Launch at login is unavailable on this macOS version"
            launchAtLogin = false
            return
        }

        do {
            if enabled {
                try SMAppService.mainApp.register()
                launchStatus = "Launch at login is enabled"
            } else {
                try SMAppService.mainApp.unregister()
                launchStatus = "Launch at login is off"
            }
        } catch {
            launchStatus = "Launch-at-login change failed: \(error.localizedDescription)"
            launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }

    private func syncNotificationState() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    self.notificationsEnabled = true
                    self.notificationStatus = "macOS notifications are enabled"
                case .denied:
                    self.notificationsEnabled = false
                    self.notificationStatus = "Notifications are blocked in System Settings"
                case .notDetermined:
                    self.notificationsEnabled = false
                    self.notificationStatus = "Notifications have not been requested yet"
                @unknown default:
                    self.notificationsEnabled = false
                    self.notificationStatus = "Notification status is unavailable"
                }
            }
        }
    }

    private func requestNotificationPermission() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            await MainActor.run {
                notificationsEnabled = granted
                notificationStatus = granted ? "Notifications are enabled" : "Notifications were not granted"
            }
        } catch {
            await MainActor.run {
                notificationStatus = "Notification permission request failed: \(error.localizedDescription)"
                notificationsEnabled = false
            }
        }
    }

    private func updateNotificationPermission(enabled: Bool) async {
        if enabled {
            await requestNotificationPermission()
        } else {
            await MainActor.run {
                notificationStatus = "Notifications are off"
            }
        }
    }

    private func checkForUpdates() async {
        guard !isCheckingForUpdates else { return }
        isCheckingForUpdates = true
        defer { isCheckingForUpdates = false }
        lastChecked = Date().formatted(date: .abbreviated, time: .shortened)

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

            let currentVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
            if release.tagName.compare(currentVersion, options: .numeric) == .orderedDescending {
                updateStatus = "Update available: \(release.displayName)"
            } else {
                updateStatus = "You are up to date"
            }
        } catch {
            updateStatus = "Update check failed: \(error.localizedDescription)"
            latestReleaseURL = nil
        }
    }
}

@MainActor
private struct OnboardingView: View {
    @Binding var isPresented: Bool
    let steps: [ContentView.OnboardingStep]
    @State private var selectedStep = 0

    var body: some View {
        VStack(spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Welcome to PokeClaw")
                        .font(.title2.weight(.semibold))
                    Text("A quick guide to MCP, permissions, and the first setup steps.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") {
                    isPresented = false
                }
                .buttonStyle(.borderedProminent)
            }

            TabView(selection: $selectedStep) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    VStack(alignment: .leading, spacing: 16) {
                        Image(systemName: step.symbol)
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(.blue)
                        Text(step.title)
                            .font(.headline)
                        Text(step.body)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Spacer()
                    }
                    .padding(20)
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .frame(width: 520, height: 260)

            HStack {
                Button("Back") {
                    selectedStep = max(0, selectedStep - 1)
                }
                .buttonStyle(.bordered)
                .disabled(selectedStep == 0)

                Spacer()

                Button(selectedStep == steps.count - 1 ? "Get started" : "Next") {
                    if selectedStep == steps.count - 1 {
                        isPresented = false
                    } else {
                        selectedStep = min(steps.count - 1, selectedStep + 1)
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(width: 620, height: 430)
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
