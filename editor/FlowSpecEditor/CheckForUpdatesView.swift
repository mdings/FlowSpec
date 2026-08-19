import Sparkle
import SwiftUI

final class UpdateOffer: ObservableObject {
    @Published private(set) var availableVersion: String?
    var install: () -> Void = {}

    var isAvailable: Bool { availableVersion != nil }

    func show(version: String) {
        availableVersion = version
    }

    func clear() {
        availableVersion = nil
    }
}

final class CheckForUpdatesViewModel: ObservableObject {
    @Published var canCheckForUpdates = false

    init(updater: SPUUpdater) {
        updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)
    }
}

struct CheckForUpdatesView: View {
    @ObservedObject private var checkForUpdatesViewModel: CheckForUpdatesViewModel
    private let updater: SPUUpdater

    init(updater: SPUUpdater) {
        self.updater = updater
        self.checkForUpdatesViewModel = CheckForUpdatesViewModel(updater: updater)
    }

    var body: some View {
        Button("Check for Updates…", action: updater.checkForUpdates)
            .disabled(!checkForUpdatesViewModel.canCheckForUpdates)
    }
}

struct InstallUpdateToolbarButton: View {
    @EnvironmentObject private var updateOffer: UpdateOffer

    var body: some View {
        if let version = updateOffer.availableVersion {
            Button("Update to \(version)") {
                updateOffer.install()
            }
            .help("Install FlowSpec Editor \(version)")
        }
    }
}
