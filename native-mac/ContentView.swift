import SwiftUI

struct ContentView: View {
    @ObservedObject var model: PokeClawConnectionModel

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
                    LabeledContent("Tunnel", value: model.tunnelEndpoint)
                    LabeledContent("Status", value: model.statusMessage)
                }
                .font(.callout)
                .textSelection(.enabled)
            }

            GroupBox("Polish roadmap") {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(model.notes, id: \.self) { note in
                        Label(note, systemImage: "checkmark.seal")
                    }
                }
                .font(.callout)
            }

            HStack {
                Button(model.isConnected ? "Disconnect" : "Mark Connected") {
                    model.isConnected.toggle()
                    model.statusMessage = model.isConnected ? "Ready for Poke requests" : "Waiting for a local server"
                }
                Button("Copy endpoints next") {
                    model.statusMessage = "UI scaffold ready for native integration work"
                }
                .buttonStyle(.bordered)
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(minWidth: 560, minHeight: 360)
    }
}
