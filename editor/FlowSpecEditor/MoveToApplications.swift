import AppKit
import Darwin

/// Copies the running app into /Applications (or ~/Applications) when launched
/// from a zip/Downloads location, then relaunches from there.
/// Sparkle cannot update an app that is still in Downloads.
enum MoveToApplications {
    /// Returns true if the current process will terminate to relaunch from Applications.
    @discardableResult
    static func relocateIfNeeded() -> Bool {
        #if DEBUG
        return false
        #else
        let bundleURL = Bundle.main.bundleURL
        guard shouldRelocate(from: bundleURL) else { return false }

        let name = bundleURL.lastPathComponent
        let destinations = [
            URL(fileURLWithPath: "/Applications").appendingPathComponent(name),
            FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Applications")
                .appendingPathComponent(name)
        ]

        for destination in destinations {
            do {
                let parent = destination.deletingLastPathComponent()
                if parent.path.hasPrefix(FileManager.default.homeDirectoryForCurrentUser.path) {
                    try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
                }
                try install(from: bundleURL, to: destination)
                relaunch(from: destination, trashing: originalURLIfAccessible(from: bundleURL))
                return true
            } catch {
                NSLog("MoveToApplications: \(destination.path) failed: \(error.localizedDescription)")
            }
        }
        return false
        #endif
    }

    private static func shouldRelocate(from bundleURL: URL) -> Bool {
        let path = bundleURL.path
        if path.contains("/DerivedData/") || path.contains("/Build/Products/") {
            return false
        }
        if isInsideApplications(path) {
            return false
        }
        return true
    }

    private static func isInsideApplications(_ path: String) -> Bool {
        let applications = "/Applications/"
        let userApplications = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications").path + "/"
        return path.hasPrefix(applications) || path == "/Applications"
            || path.hasPrefix(userApplications)
    }

    private static func install(from source: URL, to destination: URL) throws {
        let fm = FileManager.default
        if fm.fileExists(atPath: destination.path) {
            try fm.removeItem(at: destination)
        }
        try fm.copyItem(at: source, to: destination)
        clearQuarantine(at: destination)
    }

    private static func originalURLIfAccessible(from runningBundle: URL) -> URL? {
        if !runningBundle.path.contains("AppTranslocation") {
            return runningBundle
        }
        let fm = FileManager.default
        let name = runningBundle.lastPathComponent
        let candidates = [
            fm.urls(for: .downloadsDirectory, in: .userDomainMask).first?.appendingPathComponent(name),
            fm.urls(for: .desktopDirectory, in: .userDomainMask).first?.appendingPathComponent(name)
        ].compactMap { $0 }
        return candidates.first { fm.fileExists(atPath: $0.path) }
    }

    private static func clearQuarantine(at url: URL) {
        _ = removexattr(url.path, "com.apple.quarantine", 0)
        guard let enumerator = FileManager.default.enumerator(
            at: url,
            includingPropertiesForKeys: nil
        ) else { return }
        for case let fileURL as URL in enumerator {
            _ = removexattr(fileURL.path, "com.apple.quarantine", 0)
        }
    }

    private static func relaunch(from destination: URL, trashing original: URL?) {
        let open = Process()
        open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        open.arguments = ["-n", destination.path]
        do {
            try open.run()
            open.waitUntilExit()
        } catch {
            NSLog("MoveToApplications: relaunch failed: \(error.localizedDescription)")
            return
        }

        if let original, original.standardizedFileURL != destination.standardizedFileURL {
            NSWorkspace.shared.recycle([original], completionHandler: nil)
        }
        NSApp.terminate(nil)
    }
}
