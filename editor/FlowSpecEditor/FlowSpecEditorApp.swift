import AppKit
import SwiftUI

@main
struct FlowSpecEditorApp: App {
    var body: some Scene {
        DocumentGroup(newDocument: FlowSpecDocument()) { file in
            ContentView(document: file.$document)
        }
        .commands {
            FlowSpecFolderCommands()
            FlowSpecViewCommands()

            CommandGroup(after: .textEditing) {
                Divider()
                Button("Find…") {
                    NSApp.sendAction(#selector(NSTextView.performFindPanelAction(_:)), to: nil, from: NSNumber(value: 1))
                }
                .keyboardShortcut("f", modifiers: .command)

                Button("Find and Replace…") {
                    NSApp.sendAction(#selector(NSTextView.performFindPanelAction(_:)), to: nil, from: NSNumber(value: 12))
                }
                .keyboardShortcut("f", modifiers: [.command, .option])
            }
        }

        WindowGroup("FlowSpec Folder", id: "flowspec-folder", for: FlowSpecFolderReference.self) { $folderReference in
            if let folderReference = Binding($folderReference) {
                FlowSpecWorkspaceView(folderReference: folderReference)
            }
        }
        .defaultSize(width: 1040, height: 700)
    }
}

private struct FlowSpecViewCommands: Commands {
    @AppStorage("lineSpacing") private var storedLineSpacing = FlowSpecLineSpacing.normal.rawValue
    @AppStorage("fontSize") private var storedFontSize = FlowSpecFontSize.medium.rawValue

    var body: some Commands {
        CommandGroup(after: .toolbar) {
            Menu("Line Spacing") {
                ForEach(FlowSpecLineSpacing.allCases) { spacing in
                    Toggle(
                        spacing.title,
                        isOn: Binding(
                            get: { storedLineSpacing == spacing.rawValue },
                            set: { _ in storedLineSpacing = spacing.rawValue }
                        )
                    )
                }
            }

            Menu("Text Size") {
                ForEach(FlowSpecFontSize.allCases) { size in
                    Toggle(
                        size.title,
                        isOn: Binding(
                            get: { storedFontSize == size.rawValue },
                            set: { _ in storedFontSize = size.rawValue }
                        )
                    )
                }
            }
        }
    }
}

private struct FlowSpecFolderCommands: Commands {
    @Environment(\.openWindow) private var openWindow

    var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("Open Folder…") {
                let panel = NSOpenPanel()
                panel.title = "Open FlowSpec Folder"
                panel.message = "Choose a folder containing FlowSpec files."
                panel.prompt = "Open Folder"
                panel.canChooseFiles = false
                panel.canChooseDirectories = true
                panel.allowsMultipleSelection = false
                panel.canCreateDirectories = true

                panel.begin { response in
                    guard response == .OK, let folderURL = panel.url else { return }
                    guard let folderReference = try? FlowSpecFolderReference(url: folderURL) else {
                        return
                    }
                    Task { @MainActor in
                        openWindow(id: "flowspec-folder", value: folderReference)
                    }
                }
            }
            .keyboardShortcut("o", modifiers: [.command, .shift])
        }
    }
}
