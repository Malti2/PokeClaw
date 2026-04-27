import SwiftUI

struct ContentView: View {
    @State private var isServerRunning = false
    @State private var serverStatus = "Server stopped"
    @State private var updateStatus = "No update check yet"
    @State private var lastChecked = "Never"

    @State private var serverBunPath = "/opt/homebrew/bin/bun"
    @State private var serverScriptPath = "~/pokeclaw/server.ts"
    @State private var serverToken = ""
    @State private var serverLogLevel = "info"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                serverControlSection
                configurationSection
                updatesSection
            }
            .padding(20)
            .frame(maxWidth: 900, alignment: .leading)
        }
        .frame(minWidth: 720, minHeight: 520)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PokeClaw")
                .font(.largeTitle.weight(.semibold))
            Text("Local MCP server controller for macOS")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private var serverControlSection: some View {
        GroupBox("Server Control") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Circle()
                        .fill(isServerRunning ? .green : .orange)
                        .frame(width: 12, height: 12)
                    Text(serverStatus)
                        .font(.callout)
                    Spacer()
                    Button(isServerRunning ? "Stop MCP Server" : "Start MCP Server") {
                        toggleServer()
                    }
                    .buttonStyle(.borderedProminent)
                }

                Text(isServerRunning ? "The server is marked as running in the UI." : "The server is currently stopped in the UI.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
        }
    }

    private var configurationSection: some View {
        GroupBox("Settings") {
            VStack(alignment: .leading, spacing: 12) {
                labeledField(title: "Bun path", value: $serverBunPath)
                labeledField(title: "Script path", value: $serverScriptPath)
                labeledSecureField(title: "Token", value: $serverToken)
                labeledField(title: "Log level", value: $serverLogLevel)

                Text("These values are editable so the app can point at the correct Bun executable, server script, and token.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
        }
    }

    private var updatesSection: some View {
        GroupBox("Updates") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Update status")
                            .font(.callout.weight(.medium))
                        Text(updateStatus)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Check for Updates") {
                        checkForUpdates()
                    }
                    .buttonStyle(.bordered)
                }

                Text("Last checked: \(lastChecked)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
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

    private func toggleServer() {
        isServerRunning.toggle()
        serverStatus = isServerRunning ? "Server running" : "Server stopped"
    }

    private func checkForUpdates() {
        lastChecked = Date().formatted(date: .abbreviated, time: .shortened)
        updateStatus = "Checked for updates"
    }
}
