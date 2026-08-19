import AppKit
import Combine
import SwiftUI

/// Persists sandboxed folder access across app launches via a security-scoped bookmark.
struct FlowSpecFolderReference: Codable, Hashable {
    private let bookmarkData: Data

    init(url: URL) throws {
        bookmarkData = try url.bookmarkData(
            options: [.withSecurityScope],
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
    }

    func resolve() throws -> (url: URL, refreshed: FlowSpecFolderReference?) {
        var isStale = false
        let url = try URL(
            resolvingBookmarkData: bookmarkData,
            options: [.withSecurityScope],
            relativeTo: nil,
            bookmarkDataIsStale: &isStale
        )
        if isStale, let refreshed = try? FlowSpecFolderReference(url: url) {
            return (url, refreshed)
        }
        return (url, nil)
    }
}

struct FlowSpecWorkspaceNode: Identifiable, Hashable {
    let url: URL
    let children: [FlowSpecWorkspaceNode]?

    var id: URL { url }
    var name: String { url.lastPathComponent }
    var isDirectory: Bool { children != nil }
}

@MainActor
final class FlowSpecWorkspace: ObservableObject {
    let folderURL: URL

    @Published private(set) var files: [FlowSpecWorkspaceNode] = []
    @Published private(set) var fileEntries: [URL: [String]] = [:]
    @Published private(set) var selectedURL: URL?
    @Published private(set) var text = ""
    @Published private(set) var dirtyURLs: Set<URL> = []
    @Published var errorMessage: String?

    private var drafts: [URL: String] = [:]
    private var savedText: [URL: String] = [:]
    private let hasSecurityAccess: Bool

    init(folderURL: URL) {
        self.folderURL = folderURL
        hasSecurityAccess = folderURL.startAccessingSecurityScopedResource()
        reload()
    }

    /// Placeholder used when a persisted folder bookmark can no longer be resolved.
    static func unavailable(
        message: String = "This folder could not be read. Choose it again with File → Open Folder…"
    ) -> FlowSpecWorkspace {
        let workspace = FlowSpecWorkspace(unreadableFolderPath: "Unavailable Folder")
        workspace.errorMessage = message
        return workspace
    }

    private init(unreadableFolderPath: String) {
        folderURL = URL(fileURLWithPath: unreadableFolderPath, isDirectory: true)
        hasSecurityAccess = false
        files = []
    }

    deinit {
        if hasSecurityAccess {
            folderURL.stopAccessingSecurityScopedResource()
        }
    }

    var title: String {
        folderURL.lastPathComponent
    }

    var isCurrentFileDirty: Bool {
        selectedURL.map(dirtyURLs.contains) ?? false
    }

    var hasUnsavedChanges: Bool {
        !dirtyURLs.isEmpty
    }

    var sourceFiles: [FlowSpecSourceFile] {
        Self.flattenedFiles(in: files).compactMap { url in
            if url == selectedURL {
                return FlowSpecSourceFile(url: url, source: text)
            }
            if let draft = drafts[url] {
                return FlowSpecSourceFile(url: url, source: draft)
            }
            guard let source = try? String(contentsOf: url, encoding: .utf8) else {
                return nil
            }
            return FlowSpecSourceFile(url: url, source: source)
        }
    }

    func reload() {
        do {
            let nodes = try Self.nodes(in: folderURL)
            files = nodes
            refreshFileEntries()

            let availableFiles = Self.flattenedFiles(in: nodes)
            if let selectedURL, availableFiles.contains(selectedURL) {
                return
            }

            let preferredFile = availableFiles.first {
                $0.lastPathComponent.caseInsensitiveCompare("index.flowspec") == .orderedSame
            } ?? availableFiles.first
            select(preferredFile)
        } catch {
            errorMessage = "This folder could not be read."
        }
    }

    func select(_ url: URL?) {
        guard url != selectedURL else { return }
        guard let url else {
            selectedURL = nil
            text = ""
            return
        }
        guard url.pathExtension.caseInsensitiveCompare("flowspec") == .orderedSame else {
            return
        }

        do {
            let diskText = try String(contentsOf: url, encoding: .utf8)
            savedText[url] = diskText
            text = drafts[url] ?? diskText
            selectedURL = url
        } catch {
            errorMessage = "\(url.lastPathComponent) could not be opened."
        }
    }

    func updateText(_ newText: String) {
        guard newText != text, let selectedURL else { return }
        applyDraft(url: selectedURL, newText: newText)
    }

    func applyLinkedSourceChanges(
        _ changes: [FlowSpecLinkedSourceChange],
        undoManager: UndoManager?
    ) {
        let applicable = changes.filter { $0.oldText != $0.newText }
        guard !applicable.isEmpty else { return }

        let inverses = applicable.map {
            FlowSpecLinkedSourceChange(url: $0.url, oldText: $0.newText, newText: $0.oldText)
        }
        for change in applicable {
            applyDraft(url: change.url, newText: change.newText)
        }
        undoManager?.registerUndo(withTarget: self) { workspace in
            workspace.applyLinkedSourceChanges(inverses, undoManager: undoManager)
        }
    }

    private func applyDraft(url: URL, newText: String) {
        if url == selectedURL {
            text = newText
        }
        if newText == savedText[url] {
            drafts.removeValue(forKey: url)
            dirtyURLs.remove(url)
        } else {
            drafts[url] = newText
            dirtyURLs.insert(url)
        }
        refreshFileEntries(for: [url])
    }

    func saveNow() {
        guard isCurrentFileDirty, let selectedURL else { return }

        do {
            try text.write(to: selectedURL, atomically: true, encoding: .utf8)
            savedText[selectedURL] = text
            drafts.removeValue(forKey: selectedURL)
            dirtyURLs.remove(selectedURL)
        } catch {
            errorMessage = "\(selectedURL.lastPathComponent) could not be saved."
        }
    }

    func saveAllNow() {
        for url in Array(dirtyURLs) {
            guard let draft = drafts[url] else { continue }
            do {
                try draft.write(to: url, atomically: true, encoding: .utf8)
                savedText[url] = draft
                drafts.removeValue(forKey: url)
                dirtyURLs.remove(url)
            } catch {
                errorMessage = "\(url.lastPathComponent) could not be saved."
            }
        }
    }

    private static func nodes(in directory: URL) throws -> [FlowSpecWorkspaceNode] {
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .isSymbolicLinkKey]
        let contents = try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        )

        var collectedNodes: [FlowSpecWorkspaceNode] = []
        for url in contents {
            let values = try url.resourceValues(forKeys: keys)
            if values.isDirectory == true, values.isSymbolicLink != true {
                let children = try nodes(in: url)
                if !children.isEmpty {
                    collectedNodes.append(FlowSpecWorkspaceNode(url: url, children: children))
                }
            } else if url.pathExtension.caseInsensitiveCompare("flowspec") == .orderedSame {
                collectedNodes.append(FlowSpecWorkspaceNode(url: url, children: nil))
            }
        }

        return collectedNodes.sorted { lhs, rhs in
            if lhs.isDirectory != rhs.isDirectory {
                return lhs.isDirectory
            }
            return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
        }
    }

    private func refreshFileEntries(for urls: [URL]? = nil) {
        let files = sourceFiles
        let available = Set(files.map(\.url))
        var next = urls == nil ? [URL: [String]]() : fileEntries
        let targets = Set(urls ?? Array(available))
        for file in files where targets.contains(file.url) {
            let entries = FlowSpecStructureValidator.flowEntries(in: file.source)
            if entries.isEmpty {
                next.removeValue(forKey: file.url)
            } else {
                next[file.url] = entries
            }
        }
        for url in next.keys where !available.contains(url) {
            next.removeValue(forKey: url)
        }
        fileEntries = next
    }

    private static func flattenedFiles(in nodes: [FlowSpecWorkspaceNode]) -> [URL] {
        nodes.flatMap { node in
            if let children = node.children {
                return flattenedFiles(in: children)
            }
            return [node.url]
        }
    }
}

struct FlowSpecWorkspaceView: View {
    private struct NavigationEntry: Equatable {
        let fileURL: URL
        let range: NSRange?
    }

    @Binding private var folderReference: FlowSpecFolderReference
    @StateObject private var workspace: FlowSpecWorkspace
    @State private var expandedFolders: Set<URL> = []
    @State private var navigationTarget: FlowSpecNavigationTarget?
    @State private var backHistory: [NavigationEntry] = []
    @State private var forwardHistory: [NavigationEntry] = []
    @State private var pendingReferenceRefresh: FlowSpecFolderReference?

    init(folderReference: Binding<FlowSpecFolderReference>) {
        _folderReference = folderReference
        do {
            let resolved = try folderReference.wrappedValue.resolve()
            _workspace = StateObject(wrappedValue: FlowSpecWorkspace(folderURL: resolved.url))
            _pendingReferenceRefresh = State(initialValue: resolved.refreshed)
        } catch {
            _workspace = StateObject(wrappedValue: .unavailable())
            _pendingReferenceRefresh = State(initialValue: nil)
        }
    }

    var body: some View {
        NavigationSplitView {
            ScrollView {
                FlowSpecWorkspaceTree(
                    nodes: workspace.files,
                    selectedURL: workspace.selectedURL,
                    dirtyURLs: workspace.dirtyURLs,
                    fileEntries: workspace.fileEntries,
                    expandedFolders: $expandedFolders,
                    select: selectFromSidebar
                )
                .padding(.horizontal, 8)
                .padding(.vertical, 10)
            }
            .background(Color(nsColor: .controlBackgroundColor))
            .navigationSplitViewColumnWidth(min: 180, ideal: 230, max: 360)
        } detail: {
            if workspace.selectedURL != nil {
                FlowSpecEditorSurface(
                    text: Binding(
                        get: { workspace.text },
                        set: { workspace.updateText($0) }
                    ),
                    navigationTarget: navigationTarget,
                    onGoToLink: followGoTo,
                    onFollowBacklink: followBacklink,
                    onLinkedSourceChanges: { changes, undoManager in
                        workspace.applyLinkedSourceChanges(changes, undoManager: undoManager)
                    },
                    validationContext: workspace.selectedURL.map {
                        FlowSpecValidationContext(
                            files: workspace.sourceFiles,
                            currentFileURL: $0
                        )
                    }
                )
            } else {
                ContentUnavailableView(
                    "No FlowSpec Files",
                    systemImage: "doc.text.magnifyingglass",
                    description: Text("Add a .flowspec file to this folder, then refresh.")
                )
            }
        }
        .navigationTitle(workspace.title)
        .toolbar {
            ToolbarItem(id: "install-update", placement: .primaryAction) {
                InstallUpdateToolbarButton()
            }

            ToolbarItemGroup {
                Button {
                    goBack()
                } label: {
                    Label("Back", systemImage: "chevron.left")
                }
                .disabled(backHistory.isEmpty)
                .help("Back")

                Button {
                    goForward()
                } label: {
                    Label("Forward", systemImage: "chevron.right")
                }
                .disabled(forwardHistory.isEmpty)
                .help("Forward")

                Button {
                    workspace.reload()
                } label: {
                    Label("Refresh Folder", systemImage: "arrow.clockwise")
                }
                .help("Refresh Folder")

                Button {
                    workspace.saveNow()
                } label: {
                    Label("Save", systemImage: "square.and.arrow.down")
                }
                .disabled(!workspace.isCurrentFileDirty)
                .help("Save")
            }
        }
        .alert(
            "FlowSpec Editor",
            isPresented: Binding(
                get: { workspace.errorMessage != nil },
                set: { if !$0 { workspace.errorMessage = nil } }
            )
        ) {
            Button("OK") {
                workspace.errorMessage = nil
            }
        } message: {
            Text(workspace.errorMessage ?? "")
        }
        .onAppear {
            if let pendingReferenceRefresh {
                folderReference = pendingReferenceRefresh
                self.pendingReferenceRefresh = nil
            }
        }
        .onDisappear {
            workspace.saveAllNow()
        }
        .background(
            WorkspaceWindowStateView(
                isDocumentEdited: workspace.hasUnsavedChanges,
                save: workspace.saveNow
            )
            .frame(width: 0, height: 0)
        )
        .frame(minWidth: 820, minHeight: 520)
    }

    private func followGoTo(characterIndex: Int) {
        guard let currentFileURL = workspace.selectedURL else { return }
        let destinations = FlowSpecStructureValidator.resolveGoTo(
            in: workspace.sourceFiles,
            currentFileURL: currentFileURL,
            characterIndex: characterIndex
        )
        guard destinations.count == 1, let destination = destinations.first else { return }

        navigate(
            to: NavigationEntry(
                fileURL: destination.fileURL,
                range: destination.declarationRange
            ),
            recordingHistory: true
        )
    }

    private func followBacklink(_ reference: FlowSpecGoToIncomingReference) {
        let destinationURL = workspace.sourceFiles.first {
            $0.url.path == reference.filePath
        }?.url ?? reference.fileURL
        let source = workspace.sourceFiles.first { $0.url == destinationURL }?.source
            ?? (try? String(contentsOf: destinationURL, encoding: .utf8))
            ?? ""
        let range = FlowSpecStructureValidator.navigationRange(for: reference, in: source)
        navigate(
            to: NavigationEntry(fileURL: destinationURL, range: range),
            recordingHistory: true
        )
    }

    private func selectFromSidebar(_ fileURL: URL?) {
        guard let fileURL else { return }
        navigate(
            to: NavigationEntry(fileURL: fileURL, range: nil),
            recordingHistory: true
        )
    }

    private var currentNavigationEntry: NavigationEntry? {
        workspace.selectedURL.map {
            NavigationEntry(fileURL: $0, range: navigationTarget?.range)
        }
    }

    private func navigate(to entry: NavigationEntry, recordingHistory: Bool) {
        if recordingHistory, let currentEntry = currentNavigationEntry, currentEntry != entry {
            backHistory.append(currentEntry)
            if backHistory.count > 100 {
                backHistory.removeFirst(backHistory.count - 100)
            }
            forwardHistory.removeAll()
        }

        expandFolders(containing: entry.fileURL)
        workspace.select(entry.fileURL)
        navigationTarget = entry.range.map(FlowSpecNavigationTarget.init(range:))
    }

    private func goBack() {
        guard let destination = backHistory.popLast() else { return }
        if let currentEntry = currentNavigationEntry {
            forwardHistory.append(currentEntry)
        }
        navigate(to: destination, recordingHistory: false)
    }

    private func goForward() {
        guard let destination = forwardHistory.popLast() else { return }
        if let currentEntry = currentNavigationEntry {
            backHistory.append(currentEntry)
        }
        navigate(to: destination, recordingHistory: false)
    }

    private func expandFolders(containing fileURL: URL) {
        var directory = fileURL.deletingLastPathComponent()
        while directory != workspace.folderURL,
              directory.path.hasPrefix(workspace.folderURL.path) {
            expandedFolders.insert(directory)
            directory.deleteLastPathComponent()
        }
    }
}

private struct WorkspaceWindowStateView: NSViewRepresentable {
    let isDocumentEdited: Bool
    let save: () -> Void

    func makeNSView(context: Context) -> WorkspaceWindowObserverView {
        WorkspaceWindowObserverView()
    }

    func updateNSView(_ view: WorkspaceWindowObserverView, context: Context) {
        view.configure(isDocumentEdited: isDocumentEdited, save: save)
    }

    static func dismantleNSView(_ view: WorkspaceWindowObserverView, coordinator: ()) {
        view.detach()
    }
}

private final class WorkspaceWindowObserverView: NSView {
    private weak var observedWindow: NSWindow?
    private var keyMonitor: Any?
    private var edited = false
    private var saveAction: (() -> Void)?

    func configure(isDocumentEdited: Bool, save: @escaping () -> Void) {
        edited = isDocumentEdited
        saveAction = save
        observedWindow?.isDocumentEdited = isDocumentEdited
    }

    override func viewWillMove(toWindow newWindow: NSWindow?) {
        if newWindow !== observedWindow {
            observedWindow?.isDocumentEdited = false
            removeKeyMonitor()
        }
        super.viewWillMove(toWindow: newWindow)
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        observedWindow = window
        window?.isDocumentEdited = edited
        installKeyMonitor()
    }

    func detach() {
        observedWindow?.isDocumentEdited = false
        observedWindow = nil
        removeKeyMonitor()
    }

    private func installKeyMonitor() {
        guard keyMonitor == nil, window != nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self,
                  self.observedWindow?.isKeyWindow == true,
                  event.charactersIgnoringModifiers?.lowercased() == "s" else {
                return event
            }
            let editingModifiers = event.modifierFlags.intersection([
                .command, .shift, .option, .control
            ])
            guard editingModifiers == .command else { return event }
            self.saveAction?()
            return nil
        }
    }

    private func removeKeyMonitor() {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
            self.keyMonitor = nil
        }
    }

    deinit {
        removeKeyMonitor()
    }
}

private struct FlowSpecSidebarFileName: View {
    let url: URL

    private var stem: String {
        url.deletingPathExtension().lastPathComponent
    }

    private var fileExtension: String {
        url.pathExtension
    }

    var body: some View {
        HStack(spacing: 0) {
            Text(stem)
                .lineLimit(1)
                .truncationMode(.tail)
            if !fileExtension.isEmpty {
                Text(".\(fileExtension)")
                    .lineLimit(1)
                    .fixedSize()
                    .opacity(0.55)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(url.lastPathComponent)
    }
}

private struct FlowSpecWorkspaceTree: View {
    let nodes: [FlowSpecWorkspaceNode]
    let selectedURL: URL?
    let dirtyURLs: Set<URL>
    let fileEntries: [URL: [String]]
    @Binding var expandedFolders: Set<URL>
    let select: (URL?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(nodes) { node in
                if let children = node.children {
                    DisclosureGroup(
                        isExpanded: Binding(
                            get: { expandedFolders.contains(node.url) },
                            set: { isExpanded in
                                if isExpanded {
                                    expandedFolders.insert(node.url)
                                } else {
                                    expandedFolders.remove(node.url)
                                }
                            }
                        )
                    ) {
                        FlowSpecWorkspaceTree(
                            nodes: children,
                            selectedURL: selectedURL,
                            dirtyURLs: dirtyURLs,
                            fileEntries: fileEntries,
                            expandedFolders: $expandedFolders,
                            select: select
                        )
                        .padding(.leading, 13)
                    } label: {
                        Label(node.name, systemImage: "folder")
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                } else {
                    Button {
                        select(node.url)
                    } label: {
                        HStack(alignment: .top, spacing: 7) {
                            Image(systemName: "doc.plaintext")
                                .foregroundStyle(selectedURL == node.url ? Color.accentColor : Color.primary)
                            VStack(alignment: .leading, spacing: 4) {
                                FlowSpecSidebarFileName(url: node.url)
                                    .foregroundStyle(selectedURL == node.url ? Color.accentColor : Color.primary)
                                if let triggers = fileEntries[node.url], !triggers.isEmpty {
                                    FlowSpecSidebarEntryMark(
                                        triggers: triggers,
                                        isSelected: selectedURL == node.url
                                    )
                                }
                            }
                            Spacer(minLength: 5)
                            if dirtyURLs.contains(node.url) {
                                Circle()
                                    .fill(Color.accentColor)
                                    .frame(width: 6, height: 6)
                                    .accessibilityHidden(true)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 5)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(selectedURL == node.url ? Color.accentColor.opacity(0.14) : Color.clear)
                    )
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(sidebarAccessibilityLabel(for: node.url))
                    .accessibilityAddTraits(.isButton)
                    .accessibilityValue(dirtyURLs.contains(node.url) ? "Unsaved changes" : "")
                }
            }
        }
    }

    private func sidebarAccessibilityLabel(for url: URL) -> String {
        guard let triggers = fileEntries[url], !triggers.isEmpty else {
            return url.lastPathComponent
        }
        return "\(url.lastPathComponent), Entry \(triggers.joined(separator: ", "))"
    }
}

private struct FlowSpecSidebarEntryMark: View {
    let triggers: [String]
    let isSelected: Bool

    private var visibleTriggers: [String] {
        Array(triggers.prefix(3))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(visibleTriggers, id: \.self) { trigger in
                chip(for: trigger)
            }
            if triggers.count > 3 {
                Text("+\(triggers.count - 3) more")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .padding(.leading, 2)
            }
        }
        .help(triggers.map { "Entry \($0)" }.joined(separator: "\n"))
    }

    private func chip(for trigger: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.right.to.line")
                .font(.system(size: 8, weight: .bold))
            Text(trigger)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .foregroundStyle(tint)
        .background(Capsule(style: .continuous).fill(tint.opacity(isSelected ? 0.16 : 0.12)))
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(tint.opacity(isSelected ? 0.42 : 0.28), lineWidth: 0.8)
        )
    }

    private var tint: Color {
        isSelected ? Color.accentColor : Color.teal
    }
}
