import SwiftUI

struct ContentView: View {
    @Binding var document: FlowSpecDocument
    @State private var navigationTarget: FlowSpecNavigationTarget?

    var body: some View {
        FlowSpecEditorSurface(
            text: $document.text,
            navigationTarget: navigationTarget,
            onGoToLink: followGoTo,
            onFollowBacklink: followBacklink
        )
    }

    private func followGoTo(characterIndex: Int) {
        let fileURL = URL(fileURLWithPath: "/document.flowspec")
        let destinations = FlowSpecStructureValidator.resolveGoTo(
            in: [FlowSpecSourceFile(url: fileURL, source: document.text)],
            currentFileURL: fileURL,
            characterIndex: characterIndex
        )
        guard destinations.count == 1, let destination = destinations.first else { return }
        navigationTarget = FlowSpecNavigationTarget(range: destination.declarationRange)
    }

    private func followBacklink(_ reference: FlowSpecGoToIncomingReference) {
        guard let range = FlowSpecStructureValidator.navigationRange(
            for: reference,
            in: document.text
        ) else { return }
        navigationTarget = FlowSpecNavigationTarget(range: range)
    }
}

struct FlowSpecEditorSurface: View {
    @Binding var text: String
    let navigationTarget: FlowSpecNavigationTarget?
    let onGoToLink: ((Int) -> Void)?
    let onFollowBacklink: ((FlowSpecGoToIncomingReference) -> Void)?
    let onLinkedSourceChanges: (([FlowSpecLinkedSourceChange], UndoManager?) -> Void)?
    let validationContext: FlowSpecValidationContext?
    @State private var isStructureDrawerOpen = false
    @State private var hoveredDiagnostic: String?
    @State private var isImproving = false
    @State private var improveError: String?
    @State private var improveSummary: String?
    @State private var activeBacklink: FlowSpecGoToTargetMark?
    @State private var railHiddenForLocation: Int?
    @State private var editorWidth: CGFloat = 800
    @AppStorage("lineSpacing") private var storedLineSpacing = FlowSpecLineSpacing.normal.rawValue
    @AppStorage("fontSize") private var storedFontSize = FlowSpecFontSize.medium.rawValue

    private let drawerHeight: CGFloat = 136
    private let drawerHandleHeight: CGFloat = 30
    private let drawerAnimation = Animation.timingCurve(0.22, 0.8, 0.22, 1, duration: 0.22)
    private let railWidth: CGFloat = 280
    private let minEditorWidthForRail: CGFloat = 520

    init(
        text: Binding<String>,
        navigationTarget: FlowSpecNavigationTarget? = nil,
        onGoToLink: ((Int) -> Void)? = nil,
        onFollowBacklink: ((FlowSpecGoToIncomingReference) -> Void)? = nil,
        onLinkedSourceChanges: (([FlowSpecLinkedSourceChange], UndoManager?) -> Void)? = nil,
        validationContext: FlowSpecValidationContext? = nil
    ) {
        _text = text
        self.navigationTarget = navigationTarget
        self.onGoToLink = onGoToLink
        self.onFollowBacklink = onFollowBacklink
        self.onLinkedSourceChanges = onLinkedSourceChanges
        self.validationContext = validationContext
    }

    private var visibleBacklink: FlowSpecGoToTargetMark? {
        guard let activeBacklink,
              railHiddenForLocation != activeBacklink.range.location else {
            return nil
        }
        return activeBacklink
    }

    private var showsInlineRail: Bool {
        visibleBacklink != nil && editorWidth >= railWidth + minEditorWidthForRail
    }

    private var showsBacklinkPopover: Bool {
        visibleBacklink != nil && editorWidth < railWidth + minEditorWidthForRail
    }

    private var backlinkPopoverPresented: Binding<Bool> {
        Binding(
            get: { showsBacklinkPopover },
            set: { presented in
                if !presented, let location = activeBacklink?.range.location {
                    railHiddenForLocation = location
                }
            }
        )
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                FlowSpecTextEditor(
                    text: $text,
                    hoveredDiagnostic: $hoveredDiagnostic,
                    diagnosticsDrawerOpen: isStructureDrawerOpen,
                    lineSpacing: lineSpacing,
                    fontSize: fontSize,
                    navigationTarget: navigationTarget,
                    onGoToLink: onGoToLink,
                    onActiveBacklinkChange: { mark in
                        if mark?.range.location != activeBacklink?.range.location {
                            railHiddenForLocation = nil
                        }
                        activeBacklink = mark
                    },
                    onLinkedSourceChanges: onLinkedSourceChanges,
                    validationContext: validationContext
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .textBackgroundColor))
                .popover(isPresented: backlinkPopoverPresented, arrowEdge: .trailing) {
                    if let visibleBacklink {
                        FlowSpecBacklinkRail(
                            mark: visibleBacklink,
                            onFollow: followBacklink
                        )
                        .frame(width: railWidth, height: 360)
                    }
                }

                structureDrawer
                    .frame(height: isStructureDrawerOpen ? drawerHeight : drawerHandleHeight)
                    .clipped()
                    .animation(drawerAnimation, value: isStructureDrawerOpen)
            }

            if showsInlineRail, let visibleBacklink {
                FlowSpecBacklinkRail(
                    mark: visibleBacklink,
                    onFollow: followBacklink
                )
                .frame(width: railWidth)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(drawerAnimation, value: showsInlineRail)
        .background(
            GeometryReader { proxy in
                Color.clear.preference(key: EditorWidthPreferenceKey.self, value: proxy.size.width)
            }
        )
        .onPreferenceChange(EditorWidthPreferenceKey.self) { editorWidth = $0 }
        .frame(minWidth: 680, minHeight: 480)
        .toolbar {
            ToolbarItem(id: "improve") {
                Button {
                    Task { await improveFlowSpec() }
                } label: {
                    if isImproving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Improve", systemImage: "wand.and.stars")
                    }
                }
                .disabled(isImproving || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .help(improveHelpText)
            }

            ToolbarItem(id: "line-spacing") {
                Menu {
                    ForEach(FlowSpecLineSpacing.allCases) { spacing in
                        Button {
                            storedLineSpacing = spacing.rawValue
                        } label: {
                            if spacing == lineSpacing {
                                Label(spacing.title, systemImage: "checkmark")
                            } else {
                                Text(spacing.title)
                            }
                        }
                    }
                } label: {
                    Label("Line Spacing", systemImage: "line.3.horizontal")
                }
                .accessibilityLabel("Line Spacing")
                .help("Line Spacing: \(lineSpacing.title)")
            }

            ToolbarItem(id: "font-size") {
                Menu {
                    ForEach(FlowSpecFontSize.allCases) { size in
                        Button {
                            storedFontSize = size.rawValue
                        } label: {
                            if size == fontSize {
                                Label(size.title, systemImage: "checkmark")
                            } else {
                                Text(size.title)
                            }
                        }
                    }
                } label: {
                    Label("Text Size", systemImage: "textformat.size")
                }
                .accessibilityLabel("Text Size")
                .help("Text Size: \(fontSize.title)")
            }
        }
        .alert(
            "Improve",
            isPresented: Binding(
                get: { improveError != nil },
                set: { if !$0 { improveError = nil } }
            )
        ) {
            Button("OK") { improveError = nil }
        } message: {
            Text(improveError ?? "")
        }
        .alert(
            "Improved",
            isPresented: Binding(
                get: { improveSummary != nil },
                set: { if !$0 { improveSummary = nil } }
            )
        ) {
            Button("OK") { improveSummary = nil }
        } message: {
            Text(improveSummary ?? "")
        }
    }

    private var improveHelpText: String {
        if let message = FlowSpecImprove.availabilityMessage() {
            return message
        }
        return "Improve FlowSpec concepts and syntax with Apple Intelligence"
    }

    private func followBacklink(_ reference: FlowSpecGoToIncomingReference) {
        onFollowBacklink?(reference)
    }

    private var lineSpacing: FlowSpecLineSpacing {
        FlowSpecLineSpacing(rawValue: storedLineSpacing) ?? .normal
    }

    private var fontSize: FlowSpecFontSize {
        FlowSpecFontSize(rawValue: storedFontSize) ?? .medium
    }

    @MainActor
    private func improveFlowSpec() async {
        guard !isImproving else { return }
        isImproving = true
        defer { isImproving = false }

        let diagnostics: [FlowSpecStructureDiagnostic]
        if let validationContext {
            diagnostics = FlowSpecStructureValidator.validate(
                validationContext.files,
                currentFileURL: validationContext.currentFileURL
            )
        } else {
            diagnostics = FlowSpecStructureValidator.validate(text)
        }

        do {
            let result = try await FlowSpecImprove.improve(
                source: text,
                diagnostics: diagnostics
            )
            text = result.improvedSource
            improveSummary = result.summary
        } catch {
            improveError = error.localizedDescription
        }
    }

    private var structureDrawer: some View {
        VStack(spacing: 0) {
            Divider()

            Button {
                withAnimation(drawerAnimation) {
                    isStructureDrawerOpen.toggle()
                    if !isStructureDrawerOpen {
                        hoveredDiagnostic = nil
                    }
                }
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "checklist")
                        .foregroundStyle(.secondary)
                    Text("Structure hints")
                        .font(.system(size: 12, weight: .medium))
                    Spacer()
                    Image(systemName: "chevron.up")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isStructureDrawerOpen ? 180 : 0))
                }
                .contentShape(Rectangle())
                .padding(.horizontal, 12)
                .frame(height: drawerHandleHeight)
            }
            .buttonStyle(.plain)
            .background(Color(nsColor: .controlBackgroundColor))

            Divider()

            ScrollView {
                Text(hoveredDiagnostic ?? "Hover an underlined item to understand what needs attention.")
                    .font(.system(size: 13))
                    .foregroundStyle(hoveredDiagnostic == nil ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .textSelection(.disabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

private struct EditorWidthPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 800
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct FlowSpecBacklinkRail: View {
    let mark: FlowSpecGoToTargetMark
    let onFollow: (FlowSpecGoToIncomingReference) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Referenced by")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 8)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(mark.sortedIncoming.enumerated()), id: \.offset) { _, reference in
                        FlowSpecBacklinkRow(reference: reference, onFollow: onFollow)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 12)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(nsColor: .controlBackgroundColor))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color(nsColor: .separatorColor).opacity(0.45))
                .frame(width: 1)
        }
    }
}

private struct FlowSpecBacklinkRow: View {
    let reference: FlowSpecGoToIncomingReference
    let onFollow: (FlowSpecGoToIncomingReference) -> Void
    @State private var isHovered = false

    var body: some View {
        Button {
            onFollow(reference)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                if !reference.container.isEmpty {
                    Text(reference.container)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .help(reference.container)
                }
                Text(reference.fileName)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .help(reference.fileName)
                Text(reference.statement)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .help(reference.statement)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isHovered ? Color.accentColor.opacity(0.12) : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}

