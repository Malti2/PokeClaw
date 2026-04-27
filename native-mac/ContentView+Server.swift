import AppKit
import SwiftUI

extension ContentView {
    var header: some View {
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

    var statusBadge: some View {
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

    var overviewGrid: some View {
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

    func infoCard(title: String, value: String, symbol: String) -> some View {
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

    var serverControlSection: some View {
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

    var helpSection: some View {
        GroupBox("Quick help") {
            VStack(alignment: .leading, spacing: 10) {
                Label("Copy the MCP URL into Poke's integration settings.", systemImage: "doc.on.doc")
                Label("Use the onboarding guide to review permissions and setup.", systemImage: "sparkles")
                Label("Launch-at-login and notifications are optional and can be disabled anytime.", systemImage: "bell.badge")
            }
            .font(.callout)
        }
    }
}
