import AppKit
import SwiftUI

struct ContentView: View {
    @ObservedObject var model: PokeClawConnectionModel
    @State private var activitySearchText: String = ""
    @State private var commandToast: PokeClawConnectionModel.CustomCommandBanner? = nil
    @FocusState private var customCommandFocused: Bool
    @AppStorage("pokeclaw.favoriteCommands") private var favoriteCommandsData = "[]"

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
        var colorName: String

        init(id: UUID = UUID(), title: String, command: String, colorName: String = "blue") {
            self.id = id
            self.title = title
            self.command = command
            self.colorName = colorName
        }

        var color: Color { ContentView.favoriteColor(named: colorName) }

        enum CodingKeys: String, CodingKey {
            case id, title, command, colorName
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(UUID.self, forKey: .id)
            title = try container.decode(String.self, forKey: .title)
            command = try container.decode(String.self, forKey: .command)
            colorName = try container.decodeIfPresent(String.self, forKey: .colorName) ?? "blue"
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(id, forKey: .id)
            try container.encode(title, forKey: .title)
            try container.encode(command, forKey: .command)
            try container.encode(colorName, forKey: .colorName)
        }
    }

    private static let favoriteColorOptions: [(name: String, label: String, color: Color)] = [
        ("blue", "Blue", .blue),
        ("purple", "Purple", .purple),
        ("pink", "Pink", .pink),
        ("red", "Red", .red),
        ("orange", "Orange", .orange),
        ("yellow", "Yellow", .yellow),
        ("green", "Green", .green),
        ("mint", "Mint", .mint),
        ("teal", "Teal", .teal),
        ("indigo", "Indigo", .indigo)
    ]

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
                commandHistoryBox
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
                            .keyboardShortcut("k", modifiers: [.command])
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

    private var commandHistoryBox: some View {
        GroupBox("Command History") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Recent custom commands")
                            .font(.callout.weight(.medium))
                        Text("Quickly recall commands you used before.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(commandHistory().count) saved")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if commandHistory().isEmpty {
                    Text("Your executed custom commands will appear here for quick reuse.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(commandHistory(), id: \.self) { command in
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(command)
                                        .font(.system(.callout, design: .monospaced))
                                        .textSelection(.enabled)
                                        .lineLimit(2)
                                    Text("Tap Recall to reuse or Run to execute immediately")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button("Recall") {
                                    recallHistoryCommand(command)
                                }
                                .buttonStyle(.bordered)
                                Button("Run") {
                                    runHistoryCommand(command)
                                }
                                .buttonStyle(.borderedProminent)
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
                                HStack(alignment: .top, spacing: 12) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 8) {
                                            Circle()
                                                .fill(favorite.color)
                                                .frame(width: 10, height: 10)
                                            Text(favorite.title)
                                                .fontWeight(.semibold)
                                        }
                                        Text(favorite.command)
                                            .font(.system(.caption, design: .monospaced))
                                            .foregroundStyle(.secondary)
                                            .textSelection(.enabled)
                                            .lineLimit(2)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 8) {
                                        Menu {
                                            ForEach(Self.favoriteColorOptions, id: \.name) { option in
                                                Button {
                                                    updateFavoriteColor(favorite, to: option.name)
                                                } label: {
                                                    Label(option.label, systemImage: option.name == favorite.colorName ? "checkmark.circle.fill" : "circle")
                                                }
                                            }
                                        } label: {
                                            Label("Pin Color", systemImage: "paintpalette")
                                        }
                                        .buttonStyle(.bordered)

                                        HStack(spacing: 8) {
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
                                }
                            }
                            .padding(12)
                            .background(LinearGradient(colors: [favorite.color.opacity(0.18), Color(nsColor: .controlBackgroundColor).opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(favorite.color.opacity(0.20), lineWidth: 1))
                        }
                    }
                }
            }
            .font(.callout)
        }
    }

    private func pinCurrentCommand() {
        let command = model.customCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty else { return }
        var updated = favoriteCommands()
        guard !updated.contains(where: { $0.command == command }) else { return }
        updated.insert(FavoriteCommand(id: UUID(), title: favoriteTitle(for: command), command: command, colorName: favoriteColorName(for: command)), at: 0)
        saveFavoriteCommands(updated)
        model.statusMessage = "Pinned command to Favorites"
        model.lastAction = "Pinned favorite command"
    }

    private func removeFavorite(_ favorite: FavoriteCommand) {
        let remaining = favoriteCommands().filter { $0.id != favorite.id }
        saveFavoriteCommands(remaining)
        model.lastAction = "Removed favorite command"
    }

    private func updateFavoriteColor(_ favorite: FavoriteCommand, to colorName: String) {
        var updated = favoriteCommands()
        guard let index = updated.firstIndex(where: { $0.id == favorite.id }) else { return }
        updated[index].colorName = colorName
        saveFavoriteCommands(updated)
    }

    private func runFavorite(_ favorite: FavoriteCommand) {
        model.customCommand = favorite.command
        Task { await model.runCustomCommand() }
    }

    private func favoriteTitle(for command: String) -> String {
        let singleLine = command.components(separatedBy: .newlines).first ?? command
        return singleLine.count > 36 ? String(singleLine.prefix(36)) + "\u2026" : singleLine
    }

    private func favoriteColorName(for command: String) -> String {
        let palette = Self.favoriteColorOptions.map(\.name)
        guard !palette.isEmpty else { return "blue" }
        let index = abs(command.hashValue) % palette.count
        return palette[index]
    }

    private static func favoriteColor(named name: String) -> Color {
        switch name {
        case "purple": return .purple
        case "pink": return .pink
        case "red": return .red
        case "orange": return .orange
        case "yellow": return .yellow
        case "green": return .green
        case "mint": return .mint
        case "teal": return .teal
        case "indigo": return .indigo
        default: return .blue
        }
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
