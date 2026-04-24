import AppKit
import SwiftUI

struct ContentView: View {
    @ObservedObject var model: PokeClawConnectionModel

    private struct QuickAction: Identifiable {
        let id = UUID()
        let title: String
        let subtitle: String
        let symbol: String
        let tint: Color
        let action: () -> Void
    }

    private var quickActions: [QuickAction] {
        [
            QuickAction(title: "systeminfo", subtitle: "Inspect host details", symbol: "desktopcomputer", tint: .blue) {
                model.lastAction = "systeminfo quick action"
                model.statusMessage = "Ready to inspect host details"
            },
            QuickAction(title: "searchtext", subtitle: "Search \(model.searchRoot)", symbol: "text.magnifyingglass", tint: .purple) {
                model.lastAction = "searchtext quick action: \(model.searchQuery)"
                model.statusMessage = "Ready to search \(model.searchRoot) for \(model.searchQuery)"
            },
            QuickAction(title: model.isRefreshingStatus ? "Refreshing status\u2026" : "Refresh status", subtitle: "Poll the MCP server", symbol: "arrow.clockwise", tint: .green) {
                Task { await model.refreshServerStatus() }
            },
            QuickAction(title: model.isLoadingLogs ? "Refreshing logs\u2026" : "Refresh logs", subtitle: "Load recent activity", symbol: "list.bullet.rectangle", tint: .orange) {
                Task { await model.refreshLogs() }
            },
            QuickAction(title: "Copy MCP URL", subtitle: model.localEndpoint, symbol: "doc.on.doc", tint: .teal) {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(model.localEndpoint, forType: .string)
                model.lastAction = "Copied MCP endpoint"
                model.statusMessage = model.localEndpoint
            },
            QuickAction(title: "Open health", subtitle: model.healthEndpoint, symbol: "link", tint: .pink) {
                if let url = URL(string: model.healthEndpoint) {
                    NSWorkspace.shared.open(url)
                    model.lastAction = "Opened health endpoint"
                }
            }
        ]
    }

    private var toolTiles: [(title: String, subtitle: String, symbol: String)] {
        [
            ("searchtext", "Preview a file-content search", "text.magnifyingglass"),
            ("systeminfo", "Inspect host details", "desktopcomputer"),
            ("read/write/list", "Core filesystem tools", "folder")
        ]
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
                    LabeledContent("Server status", value: model.serverStatus)
                    LabeledContent("Last refreshed", value: model.lastStatusRefresh)
                    LabeledContent("Status", value: model.statusMessage)
                    LabeledContent("Last action", value: model.lastAction)
                }
                .font(.callout)
                .textSelection(.enabled)
            }

            GroupBox("Quick Actions") {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(quickActions) { quickAction in
                        Button(action: quickAction.action) {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: quickAction.symbol)
                                        .foregroundStyle(quickAction.tint)
                                        .frame(width: 18)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(quickAction.title)
                                            .fontWeight(.semibold)
                                        Text(quickAction.subtitle)
                                            .foregroundStyle(.secondary)
                                            .font(.caption)
                                    }
                                    Spacer(minLength: 0)
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
                            .padding(12)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .font(.callout)
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

                    HStack(spacing: 10) {
                        Button("Preview systeminfo") {
                            model.lastAction = "systeminfo preview ready"
                            model.statusMessage = "Native UI can surface machine details next"
                        }
                        Button("Preview searchtext") {
                            model.lastAction = "searchtext query: \(model.searchQuery)"
                            model.statusMessage = "Searching \(model.searchRoot) for \(model.searchQuery)"
                        }
                        .buttonStyle(.bordered)
                        Button("Copy MCP URL") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(model.localEndpoint, forType: .string)
                            model.lastAction = "Copied MCP endpoint"
                            model.statusMessage = model.localEndpoint
                        }
                        .buttonStyle(.bordered)
                    }
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
                Button(model.isRefreshingStatus ? "Refreshing\u2026" : "Refresh status") {
                    Task { await model.refreshServerStatus() }
                }
                .buttonStyle(.bordered)
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(minWidth: 760, minHeight: 700)
        .task {
            await model.startAutoRefresh()
        }
    }
}
