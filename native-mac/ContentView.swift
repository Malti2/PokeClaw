import SwiftUI

struct ContentView: View {
    @ObservedObject var model: PokeClawConnectionModel

    private var toolTiles: [(title: String, subtitle: String, symbol: String)] {
        [
            ("searchtext", "Preview a file-content search", "text.magnifyingglass"),
            ("systeminfo", "Inspect host details", "desktopcomputer"),
            ("read/write/list", "Core filesystem tools", "folder")
        ]
    }

    private var actionTiles: some View {
        Grid(horizontalSpacing: 12, verticalSpacing: 12) {
            GridRow {
                actionButton(title: "Show systeminfo", subtitle: "Inspect host + runtime details", symbol: "desktopcomputer") {
                    model.lastAction = "systeminfo preview ready"
                    model.statusMessage = "Native UI can surface machine details next"
                }
                actionButton(title: "Preview searchtext", subtitle: "Search \(model.searchRoot)", symbol: "text.magnifyingglass") {
                    model.lastAction = "searchtext query: \(model.searchQuery)"
                    model.statusMessage = "Searching \(model.searchRoot) for \(model.searchQuery)"
                }
            }
            GridRow {
                actionButton(title: "Open MCP endpoint", subtitle: model.localEndpoint, symbol: "link") {
                    model.lastAction = "Copied MCP endpoint"
                    model.statusMessage = model.localEndpoint
                }
                actionButton(title: model.isLoadingLogs ? "Refreshing logs\u2026" : "Refresh logs", subtitle: "Load recent MCP activity", symbol: "list.bullet.rectangle") {
                    Task { await model.refreshLogs() }
                }
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("PokeClaw")
                        .font(.system(size: 28, weight: .semibold))
                    Text("Experimental native Mac companion for the local MCP server")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Circle()
                    .fill(model.isConnected ? .green : .orange)
                    .frame(width: 12, height: 12)
                    .accessibilityLabel(model.isConnected ? "Connected" : "Not connected")
            }

            GroupBox("Connection") {
                VStack(alignment: .leading, spacing: 8) {
                    LabeledContent("Local MCP", value: model.localEndpoint)
                    LabeledContent("Health", value: model.healthEndpoint)
                    LabeledContent("Logs", value: model.logsEndpoint)
                    LabeledContent("Tunnel", value: model.tunnelEndpoint)
                    LabeledContent("Status", value: model.statusMessage)
                    LabeledContent("Last action", value: model.lastAction)
                }
                .font(.callout)
                .textSelection(.enabled)
            }

            GroupBox("Tool launcher") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Search root")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            TextField("~/Projects", text: $model.searchRoot)
                                .textFieldStyle(.roundedBorder)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Search query")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            TextField("PokeClaw", text: $model.searchQuery)
                                .textFieldStyle(.roundedBorder)
                        }
                    }

                    actionTiles
                }
                .font(.callout)
            }

            GroupBox("MCP logs") {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Recent activity")
                            .font(.callout.weight(.medium))
                        Spacer()
                        Button("Reload") {
                            Task { await model.refreshLogs() }
                        }
                        .buttonStyle(.bordered)
                    }

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(model.logLines.enumerated()), id: \.offset) { _, line in
                                Text(line)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.primary)
                                    .textSelection(.enabled)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .frame(minHeight: 140)
                }
            }

            GroupBox("Polish roadmap") {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(model.notes, id: \.self) { note in
                        Label(note, systemImage: "checkmark.seal")
                    }
                }
                .font(.callout)
            }

            GroupBox("Native app direction") {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(toolTiles, id: \.title) { tile in
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tile.title)
                                    .fontWeight(.medium)
                                Text(tile.subtitle)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: tile.symbol)
                        }
                    }
                }
                .font(.callout)
            }

            HStack {
                Button(model.isConnected ? "Disconnect" : "Mark Connected") {
                    model.isConnected.toggle()
                    model.statusMessage = model.isConnected ? "Ready for Poke requests" : "Waiting for a local server"
                    model.lastAction = model.isConnected ? "Connected" : "Disconnected"
                }
                Button("Refresh status") {
                    model.statusMessage = "Checking local server, tunnel, and tool availability"
                    model.lastAction = "Refreshed connection status"
                }
                .buttonStyle(.bordered)
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(minWidth: 700, minHeight: 620)
        .task {
            await model.refreshLogs()
        }
    }

    @ViewBuilder
    private func actionButton(title: String, subtitle: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: symbol)
                        .frame(width: 18)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .fontWeight(.semibold)
                        Text(subtitle)
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
