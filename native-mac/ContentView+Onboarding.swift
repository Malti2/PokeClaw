import SwiftUI

extension ContentView {
    var onboardingBanner: some View {
        GroupBox {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: hasSeenOnboarding ? "checkmark.seal.fill" : "sparkles")
                    .font(.title2)
                    .foregroundStyle(hasSeenOnboarding ? .green : .blue)
                VStack(alignment: .leading, spacing: 4) {
                    Text(hasSeenOnboarding ? "Onboarding completed" : "First launch setup")
                        .font(.headline)
                    Text(hasSeenOnboarding ? "You can reopen the guide any time from the menu bar or settings." : "Learn what MCP is, which permissions matter, and how to connect PokeClaw to Poke.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(hasSeenOnboarding ? "Review guide" : "Start guide") {
                    showOnboarding = true
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}

struct OnboardingView: View {
    @Binding var isPresented: Bool
    let steps: [ContentView.OnboardingStep]
    @State private var selectedStep = 0

    var body: some View {
        VStack(spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Welcome to PokeClaw")
                        .font(.title2.weight(.semibold))
                    Text("A quick guide to MCP, permissions, and the first setup steps.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") {
                    isPresented = false
                }
                .buttonStyle(.borderedProminent)
            }

            TabView(selection: $selectedStep) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    VStack(alignment: .leading, spacing: 16) {
                        Image(systemName: step.symbol)
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(.blue)
                        Text(step.title)
                            .font(.headline)
                        Text(step.body)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Spacer()
                    }
                    .padding(20)
                    .tag(index)
                }
            }
            .frame(width: 520, height: 260)

            HStack {
                Button("Back") {
                    selectedStep = max(0, selectedStep - 1)
                }
                .buttonStyle(.bordered)
                .disabled(selectedStep == 0)

                Spacer()

                Button(selectedStep == steps.count - 1 ? "Get started" : "Next") {
                    if selectedStep == steps.count - 1 {
                        isPresented = false
                    } else {
                        selectedStep = min(steps.count - 1, selectedStep + 1)
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(width: 620, height: 430)
    }
}
