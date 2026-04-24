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
                        TextField("Search root", text: $model.searchRoot)
                            .textFieldStyle(.roundedBorder)
                        TextField("Search query", text: $model.searchQuery)
                            .textFieldStyle(.roundedBorder)
                    }

                    HStack(spacing: 10) {
                        Button("Show systeminfo") {
                            model.lastAction = "systeminfo preview ready"
                            model.statusMessage = "Native UI can surface machine details next"
                        }
                        Button("Preview searchtext") {
                            model.lastAction = "searchtext query: \(model.searchQuery)"
                            model.statusMessage = "Searching \(model.searchRoot) for \(model.searchQuery)"
                        }
                        .buttonStyle(.bordered)
                        Button("Copy MCP URL") {
                            model.lastAction = "Copied MCP endpoint"
                            model.statusMessage = model.localEndpoint
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .font(.callout)
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
        .frame(minWidth: 620, minHeight: 430)
    }
}
