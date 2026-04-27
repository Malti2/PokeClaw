import AppKit
import Foundation
import ServiceManagement
import SwiftUI
import UserNotifications

extension ContentView {
    var configurationSection: some View {
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

    var permissionSection: some View {
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

    var updatesSection: some View {
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

    func labeledField(title: String, value: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField(title, text: value)
                .textFieldStyle(.roundedBorder)
        }
    }

    func labeledSecureField(title: String, value: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            SecureField(title, text: value)
                .textFieldStyle(.roundedBorder)
        }
    }

    func copyToPasteboard(_ value: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
    }

    func syncLaunchAtLoginState() {
        if #available(macOS 13.0, *) {
            launchAtLogin = SMAppService.mainApp.status == .enabled
            launchStatus = launchAtLogin ? "Enabled in Login Items" : "Disabled"
        } else {
            launchStatus = "Unavailable on this macOS version"
            launchAtLogin = false
        }
    }

    func updateLaunchAtLogin(enabled: Bool) {
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
            launchStatus = "Launch at login change failed: \(error.localizedDescription)"
            launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }

    func syncNotificationState() {
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

    func requestNotificationPermission() async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            await MainActor.run {
                notificationsEnabled = granted
                notificationStatus = granted ? "Notifications are enabled" : "Notifications were not granted"
            }
        } catch {
            await MainActor.run {
                notificationsEnabled = false
                notificationStatus = "Notification permission request failed: \(error.localizedDescription)"
            }
        }
    }

    func updateNotificationPermission(enabled: Bool) async {
        if enabled {
            await requestNotificationPermission()
        } else {
            await MainActor.run {
                notificationStatus = "Notifications are off"
            }
        }
    }

    func checkForUpdates() async {
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
