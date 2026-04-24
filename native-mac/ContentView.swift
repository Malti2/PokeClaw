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
            QuickAction(title: "systeminfo", subtitle: model.isLoadingSystemInfo ? "Loading details…" : "Inspect host details", symbol: "desktopcomputer", tint: .blue) {
                Task { await model.runSystemInfo() }
            },
            QuickAction(title: "searchtext", subtitle: model.isRunningSearch ? "Searching…" : "Search \(model.searchRoot)", symbol: "text.magnifyingglass", tint: .purple) {
                Task { await model.runSearchText() }
            },
            QuickAction(title: model.isRefreshingStatus ? "Refreshing status…" : "Refresh status", subtitle: "Poll the MCP server", symbol: "arrow.clockwise", tint: .green) {
                Task { await model.refreshServerStatus() }
            },
            QuickAction(title: model.isLoadingLogs ? "Refreshing logs…" : "Refresh logs", subtitle: "Load recent activity", symbol: "list.bullet.rectangle", tint: .orange) {
                Task { await model.refreshLogs() }
            },
            QuickAction(title: model.isLoadingConsole ? "Refreshing console…" : "Refresh console", subtitle: "Load stdout and stderr", symbol: "terminal", tint: .red) {
                Task { await model.refreshConsole() }
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
            ("console", "Watch stdout / stderr", "terminal"),
            ("system monitoring", "Track CPU and RAM", "speedometer")
        ]
    }

    private var quickActionColumns: [GridItem] {
        [GridItem(.adaptive(minimum: 220), spacing: 12)]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                connectionBox
                quickActionsBox
                searchTextBox
                systemMonitoringBox
                consoleBox
                toolCallsBox
                logsBox
                roadmapBox
                directionBox
                footerActions
            }
            .padding(20)
            .frame(minWidth: 820, alignment: .leading)
        }
        .background(
            LinearGradient(
                colors: [Color(nsColor: .windowBackgroundColor), Color(nsColor: .controlBackgroundColor).opacity(0.5)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
        .task {
            await model.startAutoRefresh()
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text("PokeClaw")
                    .font(.system(size: 28, weight: .semibold))
                Text("Experimental native Mac companion for the local MCP server")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            statusPill
        }
    }

    private var statusPill: some View {
        VStack(alignment: .trailing, spacing: 6) {
            HStack(spacing: 8) {
                Circle()
                    .fill(model.isConnected ? .green : .orange)
                    .frame(width: 10, height: 10)
                Text(model.serverStatus)
                    .font(.callout.weight(.medium))
            }
            Text(model.lastStatusRefresh == "Never" ? "No refresh yet" : "Last refreshed at \(model.lastStatusRefresh)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var connectionBox: some View {
        GroupBox("Connection") {
            VStack(alignment: .leading, spacing: 8) {
                LabeledContent("Local MCP", value: model.localEndpoint)
                LabeledContent("Health", value: model.healthEndpoint)
                LabeledContent("Logs", value: model.logsEndpoint)
                LabeledContent("Console", value: model.consoleEndpoint)
                LabeledContent("Tool Calls", value: model.toolCallsEndpoint)
                LabeledContent("Tunnel", value: model.tunnelEndpoint)
                LabeledContent("Status", value: model.statusMessage)
                LabeledContent("Last action", value: model.lastAction)
            }
            .font(.callout)
            .textSelection(.enabled)
        }
    }

    private var quickActionsBox: some View {
        GroupBox("Quick Actions") {
            LazyVGrid(columns: quickActionColumns, spacing: 12) {
                ForEach(quickActions) { quickAction in
                    Button(action: quickAction.action) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top, spacing: 10) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(quickAction.tint.opacity(0.12))
                                        .frame(width: 34, height: 34)
                                    Image(systemName: quickAction.symbol)
                                        .foregroundStyle(quickAction.tint)
                                }
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
                        .frame(maxWidth: .infinity, minHeight: 74, alignment: .leading)
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(.white.opacity(0.08), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .font(.callout)
        }
    }

    private var searchTextBox: some View {
        GroupBox("searchtext results") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Search root")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("~/Projects", text: $model.searchRoot)
                            .textFieldStyle(.roundedBorder)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Search term")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("PokeClaw", text: $model.searchQuery)
                            .textFieldStyle(.roundedBorder)
                    }
                    Button(model.isRunningSearch ? "Searching…" : "Run searchtext") {
                        Task { await model.runSearchText() }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.top, 18)
                }

                HStack(alignment: .top, spacing: 12) {
                    resultCard(title: "Search output", subtitle: model.statusMessage, body: model.searchTextOutput)
                    resultCard(title: "systeminfo output", subtitle: model.isLoadingSystemInfo ? "Loading…" : "Latest host details", body: model.systemInfoOutput)
                }
            }
            .font(.callout)
        }
    }

    private var systemMonitoringBox: some View {
        GroupBox("System Monitoring") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    metricCard(title: "CPU", value: model.systemCpuUsage, subtitle: "Updated (model.systemMonitoringUpdated)", tint: .blue)
                    metricCard(title: "RAM", value: model.systemMemoryUsage, subtitle: "Updated (model.systemMonitoringUpdated)", tint: .purple)
                }
                Text(model.systemInfoOutput)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .lineLimit(4)
            }
        }
    }

    private func metricCard(title: String, value: String, subtitle: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 28, weight: .semibold, design: .rounded))
            Text(subtitle)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
        .padding(12)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var consoleBox: some View {
        GroupBox("Console") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("stdout / stderr")
                            .font(.callout.weight(.medium))
                        Text("Live output from the Bun server")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(model.isLoadingConsole ? "Refreshing…" : "Reload console") {
                        Task { await model.refreshConsole() }
                    }
                    .buttonStyle(.bordered)
                }

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 6) {
                        ForEach(model.consoleLines) { line in
                            HStack(alignment: .top, spacing: 8) {
                                Text(line.stream.uppercased())
                                    .font(.system(.caption2, design: .monospaced))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(line.stream == "stderr" ? Color.red.opacity(0.15) : Color.blue.opacity(0.12), in: Capsule())
                                Text(line.line)
                                    .font(.system(.caption, design: .monospaced))
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
                }
                .frame(minHeight: 180)
            }
        }
    }

    private var toolCallsBox: some View {
        GroupBox("Recent MCP Tool Calls") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Latest calls")
                        .font(.callout.weight(.medium))
                    Spacer()
                    Button("Refresh") {
                        Task { await model.refreshToolCalls() }
                    }
                    .buttonStyle(.bordered)
                }

                if model.toolCalls.isEmpty {
                    Text("No tool calls yet.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(model.toolCalls) { call in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(call.timestamp)
                                        .font(.system(.caption2, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Text(call.tool)
                                        .font(.caption.weight(.semibold))
                                }
                                Text(call.preview)
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
    }

    private func resultCard(title: String, subtitle: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .fontWeight(.semibold)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(body, forType: .string)
                }
                .buttonStyle(.bordered)
            }

            ScrollView {
                Text(body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
            }
            .frame(minHeight: 160)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var logsBox: some View {
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
    }

    private var roadmapBox: some View {
        GroupBox("Polish roadmap") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(model.notes, id: \.self) { note in
                    Label(note, systemImage: "checkmark.seal")
                }
            }
            .font(.callout)
        }
    }

    private var directionBox: some View {
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
    }

    private var footerActions: some View {
        HStack {
            Button(model.isConnected ? "Disconnect" : "Mark Connected") {
                model.isConnected.toggle()
                model.statusMessage = model.isConnected ? "Ready for Poke requests" : "Waiting for a local server"
                model.lastAction = model.isConnected ? "Connected" : "Disconnected"
            }
            Button(model.isRefreshingStatus ? "Refreshing…" : "Refresh status") {
                Task { await model.refreshServerStatus() }
            }
            .buttonStyle(.bordered)
            Spacer()
        }
    }
}
