import SwiftUI

struct ContentView: View {
    @Binding var document: FlowSpecDocument
    @State private var navigationTarget: FlowSpecNavigationTarget?

    var body: some View {
        FlowSpecEditorSurface(
            text: $document.text,
            navigationTarget: navigationTarget,
            onGoToLink: followGoTo
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
}

struct FlowSpecEditorSurface: View {
    @Binding var text: String
    let navigationTarget: FlowSpecNavigationTarget?
    let onGoToLink: ((Int) -> Void)?
    let onLinkedSourceChanges: (([FlowSpecLinkedSourceChange], UndoManager?) -> Void)?
    let validationContext: FlowSpecValidationContext?
    @State private var isStructureDrawerOpen = false
    @State private var hoveredDiagnostic: String?
    @State private var isImproving = false
    @State private var improveError: String?
    @State private var improveSummary: String?
    @AppStorage("lineSpacing") private var storedLineSpacing = FlowSpecLineSpacing.normal.rawValue
    @AppStorage("fontSize") private var storedFontSize = FlowSpecFontSize.medium.rawValue

    private let drawerHeight: CGFloat = 136
    private let drawerHandleHeight: CGFloat = 30
    private let drawerAnimation = Animation.timingCurve(0.22, 0.8, 0.22, 1, duration: 0.22)

    init(
        text: Binding<String>,
        navigationTarget: FlowSpecNavigationTarget? = nil,
        onGoToLink: ((Int) -> Void)? = nil,
        onLinkedSourceChanges: (([FlowSpecLinkedSourceChange], UndoManager?) -> Void)? = nil,
        validationContext: FlowSpecValidationContext? = nil
    ) {
        _text = text
        self.navigationTarget = navigationTarget
        self.onGoToLink = onGoToLink
        self.onLinkedSourceChanges = onLinkedSourceChanges
        self.validationContext = validationContext
    }

    var body: some View {
        VStack(spacing: 0) {
            FlowSpecTextEditor(
                text: $text,
                hoveredDiagnostic: $hoveredDiagnostic,
                diagnosticsDrawerOpen: isStructureDrawerOpen,
                lineSpacing: lineSpacing,
                fontSize: fontSize,
                navigationTarget: navigationTarget,
                onGoToLink: onGoToLink,
                onLinkedSourceChanges: onLinkedSourceChanges,
                validationContext: validationContext
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .textBackgroundColor))

            structureDrawer
                .frame(height: isStructureDrawerOpen ? drawerHeight : drawerHandleHeight)
                .clipped()
                .animation(drawerAnimation, value: isStructureDrawerOpen)
        }
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

