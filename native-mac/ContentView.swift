import AppKit
import Foundation
import ServiceManagement
import SwiftUI
import UserNotifications

@MainActor
struct ContentView: View {
    @AppStorage("pokeclaw.hasSeenOnboarding") var hasSeenOnboarding = false
    @AppStorage("pokeclaw.launchAtLogin") var launchAtLogin = false
    @AppStorage("pokeclaw.notificationsEnabled") var notificationsEnabled = false
    @AppStorage("pokeclaw.serverHost") var serverHost = "127.0.0.1"
    @AppStorage("pokeclaw.serverPort") var serverPort = 3741
    @AppStorage("pokeclaw.serverBunPath") var serverBunPath = "/opt/homebrew/bin/bun"
    @AppStorage("pokeclaw.serverScriptPath") var serverScriptPath = "~/pokeclaw/server.ts"
    @AppStorage("pokeclaw.serverToken") var serverToken = ""
    @AppStorage("pokeclaw.serverLogLevel") var serverLogLevel = "info"

    @State var isServerRunning = false
    @State var serverStatus = "Server stopped"
    @State var serverDetail = "The local MCP server is not running yet."
    @State var updateStatus = "No update check yet"
    @State var lastChecked = "Never"
    @State var notificationStatus = "Notifications are off"
    @State var showOnboarding = false
    @State var isCheckingForUpdates = false
    @State var latestReleaseURL: URL? = nil
    @State var launchStatus = "Launch at login is off"

    @Environment(\.openURL) var openURL

    let repositoryURL = URL(string: "https://github.com/Malti2/PokeClaw")!

    struct OnboardingStep: Identifiable {
        let id = UUID()
        let symbol: String
        let title: String
        let body: String
    }

    struct GitHubRelease: Decodable {
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

    var onboardingSteps: [OnboardingStep] {
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

    var mcpEndpoint: String {
        "http://\(serverHost):\(serverPort)/mcp"
    }

    var shareableMcpURL: String {
        guard !serverToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return mcpEndpoint }
        var components = URLComponents(string: mcpEndpoint)
        components?.queryItems = [URLQueryItem(name: "token", value: serverToken)]
        return components?.string ?? mcpEndpoint
    }

    var healthEndpoint: String {
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

    func toggleServer() {
        isServerRunning.toggle()
        serverStatus = isServerRunning ? "Server running" : "Server stopped"
        serverDetail = isServerRunning ? "The local MCP server is available at \(mcpEndpoint)." : "The local MCP server is not running yet."
    }
}
