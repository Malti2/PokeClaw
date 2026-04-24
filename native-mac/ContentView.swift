import AppKit
import SwiftUI

struct ContentView: View {
    @ObservedObject var model: PokeClawConnectionModel
    @State private var activitySearchText: String = ""
    @AppStorage("pokeclaw.favoriteCommands()") private var favoriteCommandsData = "[]"

    private struct QuickAction: Identifiable {
        let id = UUID()
        let title: String
        let subtitle: String
        let symbol: String
        let tint: Color
        let action: () -> Void
    }

    private struct FavoriteCommand: Identifiable, Codable, Hashable {
        let id: UUID
        var title: String
        var command: String
    }

    private enum ConsoleSeverity: String {
        case info
        case warning
        case error

        var label: String {
            switch self {
            case .info: return "INFO"
            case .warning: return "WARN"
            case .error: return "ERROR"
            }
        }

        var tint: Color {
            switch self {
            case .info: return .blue
            case .warning: return .orange
            case .error: return .red
            }
        }

        var background: Color { tint.opacity(0.14) }
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

    private func favoriteCommands() -> [FavoriteCommand] {
        Self.decodeFavorites(favoriteCommandsData)
    }

    private func saveFavoriteCommands(_ favorites: [FavoriteCommand]) {
        favoriteCommandsData = Self.encodeFavorites(favorites)
    }

    private var filteredLogLines: [String] {
        guard !activitySearchText.isEmpty else { return model.logLines }
        return model.logLines.filter { $0.localizedCaseInsensitiveContains(activitySearchText) }
    }

    private var filteredToolCalls: [PokeClawConnectionModel.ToolCallEntry] {
        guard !activitySearchText.isEmpty else { return model.toolCalls }
        return model.toolCalls.filter { call in
            call.timestamp.localizedCaseInsensitiveContains(activitySearchText) ||
            call.tool.localizedCaseInsensitiveContains(activitySearchText) ||
            call.preview.localizedCaseInsensitiveContains(activitySearchText)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                connectionBox
                quickActionsBox
                searchTextBox
                customCommandBox
                favoritesBox
                systemMonitoringBox
                activitySearchBar
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
        .onChange(of: model.customCommandBanner) { banner in
            guard let banner else { return }
            commandToast = banner
            Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if commandToast == banner {
                    commandToast = nil
                }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if let commandToast {
                toastView(commandToast)
                    .padding(.trailing, 20)
                    .padding(.bottom, 20)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("PokeClaw")
                    .font(.system(size: 30, weight: .semibold, design: .rounded))
                Text("Experimental native Mac companion for the local MCP server")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            statusPill
        }
        .padding(.bottom, 2)
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
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
    }

    private var connectionBox: some View {
        GroupBox("Connection") {
            VStack(alignment: .leading, spacing: 10) {
                connectionRow("Local MCP", model.localEndpoint)
                connectionRow("Health", model.healthEndpoint)
                connectionRow("Logs", model.logsEndpoint)
                connectionRow("Console", model.consoleEndpoint)
                connectionRow("Tool Calls", model.toolCallsEndpoint)
                connectionRow("Tunnel", model.tunnelEndpoint)
                connectionRow("Status", model.statusMessage)
                connectionRow("Last action", model.lastAction)
            }
            .font(.callout)
            .textSelection(.enabled)
        }
    }

    private func connectionRow(_ label: String, _ value: String) -> some View {
        LabeledContent {
            Text(value)
                .foregroundStyle(.secondary)
        } label: {
            Text(label)
        }
    }

    private var quickActionsBox: some View {
        GroupBox("Quick Actions") {
            VStack(alignment: .leading, spacing: 12) {
                Text("One-click actions for the MCP server and local tools")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
            VStack(alignment: .leading, spacing: 14) {
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


    private var customCommandBox: some View {
        GroupBox("Run Custom Command") {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Command")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(alignment: .top, spacing: 12) {
                        TextField("e.g. ls -la /Applications", text: $model.customCommand)
                            .textFieldStyle(.roundedBorder)
                            .focused($customCommandFocused)
                            .onSubmit {
                                Task { await model.runCustomCommand() }
                            }
                        VStack(alignment: .leading, spacing: 8) {
                            Button(model.isRunningCustomCommand ? "Running…" : "Run") {
                                Task { await model.runCustomCommand() }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .keyboardShortcut(.defaultAction)
                            .disabled(model.customCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                            Button("Pin to Favorites") {
                                pinCurrentCommand()
                            }
                            .buttonStyle(.bordered)
                            .disabled(model.customCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Output")
                            .font(.callout.weight(.medium))
                        Spacer()
                        Button("Copy") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(model.customCommandOutput, forType: .string)
                        }
                        .buttonStyle(.bordered)
                    }

                    ScrollView {
                        Text(model.customCommandOutput)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.primary)
                            .textSelection(.enabled)
                    }
                    .frame(minHeight: 110)
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
                }
                Text("Runs locally on this Mac through /bin/zsh -lc.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .font(.callout)
        }
    }

    private var favoritesBox: some View {
        GroupBox("Favorites") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Pinned commands")
                            .font(.callout.weight(.medium))
                        Text("Save commands you run often and launch them again quickly.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(favoriteCommands().count) saved")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if favoriteCommands().isEmpty {
                    Text("Pin the current command from the custom command box to build your shortcuts list.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(favoriteCommands()) { favorite in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(favorite.title)
                                            .fontWeight(.semibold)
                                        Text(favorite.command)
                                            .font(.system(.caption, design: .monospaced))
                                            .foregroundStyle(.secondary)
                                            .textSelection(.enabled)
                                            .lineLimit(2)
                                    }
                                    Spacer()
                                    Button("Run") {
                                        runFavorite(favorite)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    Button("Remove") {
                                        removeFavorite(favorite)
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                            .padding(12)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
                        }
                    }
                }
            }
            .font(.callout)
        }
    }

    private var systemMonitoringBox: some View {
        GroupBox("System Monitoring") {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Mac resource snapshot")
                            .font(.headline)
                        Text("Live CPU and RAM usage from the local system_info tool")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Label("Updated \(model.systemMonitoringUpdated)", systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.thinMaterial, in: Capsule())
                }

                HStack(spacing: 12) {
                    metricCard(title: "CPU", value: model.systemCpuUsage, fraction: metricFraction(model.systemCpuUsage), subtitle: "Current processor load", tint: .blue)
                    metricCard(title: "RAM", value: model.systemMemoryUsage, fraction: metricFraction(model.systemMemoryUsage), subtitle: "Memory pressure snapshot", tint: .purple)
                }

                Text(model.systemInfoOutput)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .lineLimit(5)
            }
            .padding(2)
        }
    }

    private func metricFraction(_ value: String) -> Double? {
        let cleaned = value.trimmingCharacters(in: CharacterSet(charactersIn: "% "))
        guard let percent = Double(cleaned) else { return nil }
        return max(0, min(percent / 100, 1))
    }

    private func metricCard(title: String, value: String, fraction: Double?, subtitle: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(value)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(tint)
            }

            ProgressView(value: fraction ?? 0)
                .tint(tint)
                .scaleEffect(y: 1.15, anchor: .center)

            Text(subtitle)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
        .padding(14)
        .background(
            LinearGradient(
                colors: [tint.opacity(0.18), Color(nsColor: .controlBackgroundColor).opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(tint.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: tint.opacity(0.12), radius: 10, y: 4)
    }

    private var activitySearchBar: some View {
        GroupBox("Activity Search") {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search logs and tool calls", text: $activitySearchText)
                    .textFieldStyle(.plain)
                if !activitySearchText.isEmpty {
                    Button("Clear") {
                        activitySearchText = ""
                    }
                    .buttonStyle(.bordered)
                }
                Spacer()
                Text("\(filteredLogLines.count) logs · \(filteredToolCalls.count) calls")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private var consoleBox: some View {
        GroupBox("Console") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
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

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(model.consoleLines) { line in
                                consoleLineRow(line)
                                    .id(line.id)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                    }
                    .frame(minHeight: 220)
                    .onChange(of: model.consoleLines.count) { _ in
                        guard let last = model.consoleLines.last else { return }
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                    .onAppear {
                        if let last = model.consoleLines.last {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
    }

    private func consoleLineRow(_ line: PokeClawConnectionModel.ConsoleLine) -> some View {
        let severity = consoleSeverity(for: line)
        return HStack(alignment: .top, spacing: 10) {
            Text(severity.label)
                .font(.system(.caption2, design: .monospaced).weight(.semibold))
                .foregroundStyle(severity.tint)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(severity.background, in: Capsule())
            VStack(alignment: .leading, spacing: 2) {
                Text(line.line)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(severity == .error ? .primary : .primary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(line.stream == "stderr" ? "stderr" : "stdout")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(severity.tint.opacity(0.12), lineWidth: 1))
    }

    private func consoleSeverity(for line: PokeClawConnectionModel.ConsoleLine) -> ConsoleSeverity {
        let normalized = "\(line.stream) \(line.line)".lowercased()
        if line.stream == "stderr" || normalized.contains("error") || normalized.contains("fatal") {
            return .error
        }
        if normalized.contains("warn") || normalized.contains("warning") {
            return .warning
        }
        return .info
    }

    private var toolCallsBox: some View {
        GroupBox("Recent MCP Tool Calls") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Latest calls")
                        .font(.callout.weight(.medium))
                    Spacer()
                    Button("Refresh") {
                        Task { await model.refreshToolCalls() }
                    }
                    .buttonStyle(.bordered)
                }

                if filteredToolCalls.isEmpty {
                    Text(activitySearchText.isEmpty ? "No tool calls yet." : "No matching tool calls.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(filteredToolCalls) { call in
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
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Recent activity")
                        .font(.callout.weight(.medium))
                    Spacer()
                    Button("Reload") {
                        Task { await model.refreshLogs() }
                    }
                    .buttonStyle(.bordered)
                }

                if filteredLogLines.isEmpty {
                    Text(activitySearchText.isEmpty ? "No log lines yet." : "No matching log lines.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(filteredLogLines.enumerated()), id: \.offset) { _, line in
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
    }

    private var roadmapBox: some View {
        GroupBox("Polish roadmap") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(model.notes, id: \.self) { note in
                    Label(note, systemImage: "checkmark.seal")
                }
            }
            .font(.callout)
        }
    }

    private var directionBox: some View {
        GroupBox("Native app direction") {
            VStack(alignment: .leading, spacing: 8) {
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

    private func pinCurrentCommand() {
        let command = model.customCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty else { return }
        var updated = favoriteCommands()()
        guard !updated.contains(where: { $0.command == command }) else { return }
        updated.insert(FavoriteCommand(id: UUID(), title: favoriteTitle(for: command), command: command), at: 0)
        saveFavoriteCommands(updated)
        model.statusMessage = "Pinned command to Favorites"
        model.lastAction = "Pinned favorite command"
    }

    private func removeFavorite(_ favorite: FavoriteCommand) {
        favoriteCommands() = favoriteCommands().filter { $0.id != favorite.id }
        model.lastAction = "Removed favorite command"
    }

    private func runFavorite(_ favorite: FavoriteCommand) {
        model.customCommand = favorite.command
        Task { await model.runCustomCommand() }
    }

    private func favoriteTitle(for command: String) -> String {
        let singleLine = command.components(separatedBy: .newlines).first ?? command
        return singleLine.count > 36 ? String(singleLine.prefix(36)) + "…" : singleLine
    }

    private func toastView(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Text(message)
                .font(.callout.weight(.medium))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: 280)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.12), lineWidth: 1))
        .shadow(radius: 10, y: 4)
    }

    private static func decodeFavorites(_ string: String) -> [FavoriteCommand] {
        guard let data = string.data(using: .utf8), !string.isEmpty else { return [] }
        return (try? JSONDecoder().decode([FavoriteCommand].self, from: data)) ?? []
    }

    private static func encodeFavorites(_ favorites: [FavoriteCommand]) -> String {
        guard let data = try? JSONEncoder().encode(favorites), let string = String(data: data, encoding: .utf8) else { return "[]" }
        return string
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
            .keyboardShortcut("r", modifiers: [.command])
            Spacer()
        }
    }
}
