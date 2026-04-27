import AppKit
import SwiftUI

@main
struct PokeClawMacApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }

        MenuBarExtra("PokeClaw", systemImage: "pawprint") {
            Button("Show PokeClaw") {
                NSApp.activate(ignoringOtherApps: true)
            }

            Divider()

            Button("Quit PokeClaw") {
                NSApplication.shared.terminate(nil)
            }
        }
        .menuBarExtraStyle(.window)
    }
}
