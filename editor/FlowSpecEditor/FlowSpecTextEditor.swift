import SwiftUI
import AppKit

struct FlowSpecNavigationTarget: Equatable {
    let id = UUID()
    let range: NSRange
}

struct FlowSpecValidationContext {
    let files: [FlowSpecSourceFile]
    let currentFileURL: URL
}

struct FlowSpecHighlightAnalysis {
    let diagnostics: [FlowSpecStructureDiagnostic]
    let resolvedGoToRanges: [NSRange]
    let goToDestinations: [FlowSpecGoToTargetMark]
}

enum FlowSpecLineSpacing: String, CaseIterable, Identifiable {
    case tight
    case normal
    case loose

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tight: "Tight"
        case .normal: "Normal"
        case .loose: "Loose"
        }
    }

    var points: CGFloat {
        switch self {
        case .tight: 0
        case .normal: 2
        case .loose: 6
        }
    }
}

enum FlowSpecFontSize: String, CaseIterable, Identifiable {
    case small
    case medium
    case large

    var id: String { rawValue }

    var title: String {
        switch self {
        case .small: "Small"
        case .medium: "Medium"
        case .large: "Large"
        }
    }

    var points: CGFloat {
        switch self {
        case .small: 12
        case .medium: 14
        case .large: 17
        }
    }
}

struct FlowSpecTextEditor: NSViewRepresentable {
    @Binding var text: String
    @Binding var hoveredDiagnostic: String?
    let diagnosticsDrawerOpen: Bool
    let lineSpacing: FlowSpecLineSpacing
    let fontSize: FlowSpecFontSize
    let navigationTarget: FlowSpecNavigationTarget?
    let onGoToLink: ((Int) -> Void)?
    let onActiveBacklinkChange: ((FlowSpecGoToTargetMark?) -> Void)?
    let onLinkedSourceChanges: (([FlowSpecLinkedSourceChange], UndoManager?) -> Void)?
    let validationContext: FlowSpecValidationContext?

    func makeCoordinator() -> Coordinator {
        Coordinator(
            text: $text,
            hoveredDiagnostic: $hoveredDiagnostic,
            onGoToLink: onGoToLink,
            onActiveBacklinkChange: onActiveBacklinkChange,
            onLinkedSourceChanges: onLinkedSourceChanges,
            validationContext: validationContext,
            lineSpacing: lineSpacing.points,
            fontSize: fontSize.points
        )
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = EditorScrollView()
        scrollView.contentView.drawsBackground = true
        scrollView.contentView.backgroundColor = .textBackgroundColor
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.horizontalScrollElasticity = .none
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = true
        scrollView.backgroundColor = .textBackgroundColor

        let textView = IndentingTextView(
            frame: NSRect(x: 0, y: 0, width: 680, height: 480)
        )
        textView.delegate = context.coordinator
        textView.string = text
        textView.isRichText = false
        textView.importsGraphics = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isContinuousSpellCheckingEnabled = false
        textView.allowsUndo = true
        textView.usesFindBar = true
        textView.isIncrementalSearchingEnabled = true
        textView.isHorizontallyResizable = false
        textView.isVerticallyResizable = true
        textView.autoresizingMask = [.width]
        textView.minSize = NSSize(width: 0, height: scrollView.contentSize.height)
        textView.maxSize = NSSize(
            width: CGFloat.greatestFiniteMagnitude,
            height: CGFloat.greatestFiniteMagnitude
        )
        textView.textContainer?.containerSize = NSSize(
            width: EditorScrollView.preferredWrapWidth,
            height: CGFloat.greatestFiniteMagnitude
        )
        textView.textContainer?.widthTracksTextView = false
        textView.textContainerInset = NSSize(
            width: EditorScrollView.minHorizontalInset,
            height: EditorScrollView.verticalTextInset
        )
        textView.lineSpacing = lineSpacing.points
        textView.editorFontSize = fontSize.points
        textView.defaultParagraphStyle = Self.paragraphStyle(lineSpacing: lineSpacing.points)
        textView.typingAttributes = Self.baseAttributes(
            lineSpacing: lineSpacing.points,
            fontSize: fontSize.points
        )
        textView.backgroundColor = .textBackgroundColor
        textView.drawsBackground = true
        textView.insertionPointColor = .labelColor
        textView.showsStructureHintDetails = diagnosticsDrawerOpen
        textView.onStructureHintHover = { [weak coordinator = context.coordinator] message in
            coordinator?.hoveredDiagnostic = message
        }
        textView.onGoToLink = { [weak coordinator = context.coordinator] characterIndex in
            coordinator?.onGoToLink?(characterIndex)
        }
        textView.onActiveBacklinkChange = { [weak coordinator = context.coordinator] mark in
            coordinator?.onActiveBacklinkChange?(mark)
        }
        textView.highlightAnalysisProvider = { [weak coordinator = context.coordinator] source in
            coordinator?.analysis(for: source) ?? FlowSpecHighlightAnalysis(
                diagnostics: [],
                resolvedGoToRanges: [],
                goToDestinations: []
            )
        }

        scrollView.documentView = textView

        context.coordinator.textView = textView
        let initialAnalysis = context.coordinator.analysis(for: text)
        FlowSpecSyntaxHighlighter.apply(
            to: textView.textStorage!,
            appearance: textView.effectiveAppearance,
            diagnostics: initialAnalysis.diagnostics,
            resolvedGoToRanges: initialAnalysis.resolvedGoToRanges,
            goToDestinations: initialAnalysis.goToDestinations,
            lineSpacing: lineSpacing.points,
            fontSize: fontSize.points
        )
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }
        context.coordinator.onGoToLink = onGoToLink
        context.coordinator.onActiveBacklinkChange = onActiveBacklinkChange
        context.coordinator.onLinkedSourceChanges = onLinkedSourceChanges
        context.coordinator.validationContext = validationContext
        if let textView = textView as? IndentingTextView {
            textView.onActiveBacklinkChange = { [weak coordinator = context.coordinator] mark in
                coordinator?.onActiveBacklinkChange?(mark)
            }
        }
        let spacingChanged = context.coordinator.lineSpacing != lineSpacing.points
        let fontSizeChanged = context.coordinator.fontSize != fontSize.points
        context.coordinator.lineSpacing = lineSpacing.points
        context.coordinator.fontSize = fontSize.points
        if let textView = textView as? IndentingTextView {
            textView.showsStructureHintDetails = diagnosticsDrawerOpen
            textView.lineSpacing = lineSpacing.points
            textView.editorFontSize = fontSize.points
            if !diagnosticsDrawerOpen {
                textView.clearStructureHint()
            }
        }
        if textView.string != text {
            (textView as? IndentingTextView)?.hideCompletions()
            (textView as? IndentingTextView)?.resetBacklinkPresentation()
            context.coordinator.pendingHighlight?.cancel()
            let selectedRanges = textView.selectedRanges
            textView.string = text
            let analysis = context.coordinator.analysis(for: text)
            FlowSpecSyntaxHighlighter.apply(
                to: textView.textStorage!,
                appearance: textView.effectiveAppearance,
                diagnostics: analysis.diagnostics,
                resolvedGoToRanges: analysis.resolvedGoToRanges,
                goToDestinations: analysis.goToDestinations,
                lineSpacing: lineSpacing.points,
                fontSize: fontSize.points
            )
            textView.selectedRanges = Self.validSelectionRanges(
                selectedRanges,
                documentLength: (text as NSString).length
            )
            textView.window?.invalidateCursorRects(for: textView)
            textView.needsDisplay = true
            (textView as? IndentingTextView)?.refreshActiveBacklink()
        } else if spacingChanged || fontSizeChanged, let storage = textView.textStorage {
            let selectedRanges = textView.selectedRanges
            let analysis = context.coordinator.analysis(for: textView.string)
            FlowSpecSyntaxHighlighter.apply(
                to: storage,
                appearance: textView.effectiveAppearance,
                diagnostics: analysis.diagnostics,
                resolvedGoToRanges: analysis.resolvedGoToRanges,
                goToDestinations: analysis.goToDestinations,
                lineSpacing: lineSpacing.points,
                fontSize: fontSize.points
            )
            textView.defaultParagraphStyle = Self.paragraphStyle(lineSpacing: lineSpacing.points)
            textView.typingAttributes = Self.baseAttributes(
                lineSpacing: lineSpacing.points,
                fontSize: fontSize.points
            )
            textView.selectedRanges = selectedRanges
            textView.needsDisplay = true
            (textView as? IndentingTextView)?.refreshActiveBacklink()
        }

        if let navigationTarget,
           context.coordinator.lastNavigationID != navigationTarget.id {
            context.coordinator.lastNavigationID = navigationTarget.id
            let documentLength = (text as NSString).length
            let location = min(navigationTarget.range.location, documentLength)
            let length = min(navigationTarget.range.length, documentLength - location)
            let visibleRange = NSRange(location: location, length: length)
            textView.setSelectedRange(NSRange(location: location, length: 0))
            textView.scrollRangeToVisible(visibleRange)
            if visibleRange.length > 0 {
                textView.showFindIndicator(for: visibleRange)
            }
            textView.window?.makeFirstResponder(textView)
        }
    }

    private static func validSelectionRanges(
        _ ranges: [NSValue],
        documentLength: Int
    ) -> [NSValue] {
        let clampedRanges = ranges.map { value -> NSValue in
            let range = value.rangeValue
            let location = min(range.location, documentLength)
            let end = min(NSMaxRange(range), documentLength)
            return NSValue(range: NSRange(
                location: location,
                length: max(0, end - location)
            ))
        }

        // NSTextView requires at least one selection, even for an empty document.
        return clampedRanges.isEmpty
            ? [NSValue(range: NSRange(location: 0, length: 0))]
            : clampedRanges
    }

    static func dismantleNSView(_ scrollView: NSScrollView, coordinator: Coordinator) {
        coordinator.pendingHighlight?.cancel()
    }

    private static func paragraphStyle(lineSpacing: CGFloat) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = lineSpacing
        style.tabStops = []
        style.defaultTabInterval = 28
        style.lineBreakMode = .byWordWrapping
        return style
    }

    fileprivate static func baseAttributes(
        lineSpacing: CGFloat,
        fontSize: CGFloat
    ) -> [NSAttributedString.Key: Any] {
        [
            .font: NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: paragraphStyle(lineSpacing: lineSpacing)
        ]
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        @Binding var text: String
        @Binding var hoveredDiagnostic: String?
        weak var textView: NSTextView?
        var pendingHighlight: DispatchWorkItem?
        var onGoToLink: ((Int) -> Void)?
        var onActiveBacklinkChange: ((FlowSpecGoToTargetMark?) -> Void)?
        var onLinkedSourceChanges: (([FlowSpecLinkedSourceChange], UndoManager?) -> Void)?
        var lastNavigationID: UUID?
        var validationContext: FlowSpecValidationContext?
        var lineSpacing: CGFloat
        var fontSize: CGFloat
        private var isApplyingLinkedRename = false

        init(
            text: Binding<String>,
            hoveredDiagnostic: Binding<String?>,
            onGoToLink: ((Int) -> Void)?,
            onActiveBacklinkChange: ((FlowSpecGoToTargetMark?) -> Void)?,
            onLinkedSourceChanges: (([FlowSpecLinkedSourceChange], UndoManager?) -> Void)?,
            validationContext: FlowSpecValidationContext?,
            lineSpacing: CGFloat,
            fontSize: CGFloat
        ) {
            _text = text
            _hoveredDiagnostic = hoveredDiagnostic
            self.onGoToLink = onGoToLink
            self.onActiveBacklinkChange = onActiveBacklinkChange
            self.onLinkedSourceChanges = onLinkedSourceChanges
            self.validationContext = validationContext
            self.lineSpacing = lineSpacing
            self.fontSize = fontSize
        }

        func textDidChange(_ notification: Notification) {
            guard !isApplyingLinkedRename else { return }
            guard let textView = notification.object as? NSTextView else { return }
            text = textView.string
            scheduleHighlight(for: textView)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            (notification.object as? IndentingTextView)?.refreshCurrentLine()
            (notification.object as? IndentingTextView)?.refreshActiveBacklink()
        }

        func textView(
            _ textView: NSTextView,
            shouldChangeTextIn affectedCharRange: NSRange,
            replacementString: String?
        ) -> Bool {
            if isApplyingLinkedRename { return true }
            guard let replacementString else { return true }
            if textView.hasMarkedText() { return true }
            if textView.undoManager?.isUndoing == true
                || textView.undoManager?.isRedoing == true {
                return true
            }

            let currentFileURL = validationContext?.currentFileURL
                ?? URL(fileURLWithPath: "/document.flowspec")
            let files: [FlowSpecSourceFile]
            if let validationContext {
                files = validationContext.files.map { file in
                    file.url == currentFileURL
                        ? FlowSpecSourceFile(url: file.url, source: textView.string)
                        : file
                }
            } else {
                files = [FlowSpecSourceFile(url: currentFileURL, source: textView.string)]
            }

            let plan = FlowSpecStructureValidator.linkedRenameReplacements(
                in: files,
                currentFileURL: currentFileURL,
                editedRange: affectedCharRange,
                replacement: replacementString
            )
            guard !plan.currentFile.isEmpty || !plan.otherFiles.isEmpty else {
                return true
            }

            isApplyingLinkedRename = true
            let undo = textView.undoManager
            undo?.beginUndoGrouping()

            textView.replaceCharacters(in: affectedCharRange, with: replacementString)

            let utf16Delta = (replacementString as NSString).length - affectedCharRange.length
            var caret = affectedCharRange.location + (replacementString as NSString).length
            let originalReplacementRange = NSRange(
                location: affectedCharRange.location,
                length: (replacementString as NSString).length
            )

            let followUps = plan.currentFile
                .compactMap { edit -> FlowSpecTextReplacement? in
                    var range = edit.range
                    if range.location >= NSMaxRange(affectedCharRange) {
                        range.location += utf16Delta
                    } else if NSMaxRange(range) > affectedCharRange.location {
                        return nil
                    }
                    return FlowSpecTextReplacement(
                        fileURL: edit.fileURL,
                        range: range,
                        newText: edit.newText
                    )
                }
                .sorted { $0.range.location > $1.range.location }

            let documentLength = (textView.string as NSString).length
            for edit in followUps {
                guard NSMaxRange(edit.range) <= documentLength,
                      NSIntersectionRange(edit.range, originalReplacementRange).length == 0
                else { continue }
                let delta = (edit.newText as NSString).length - edit.range.length
                textView.replaceCharacters(in: edit.range, with: edit.newText)
                if edit.range.location < caret {
                    caret += delta
                }
            }

            if !plan.otherFiles.isEmpty {
                let changes = FlowSpecStructureValidator.groupedSourceChanges(
                    plan.otherFiles,
                    files: files
                )
                if !changes.isEmpty {
                    onLinkedSourceChanges?(changes, undo)
                    if let context = validationContext {
                        let updated = Dictionary(
                            uniqueKeysWithValues: changes.map { ($0.url, $0.newText) }
                        )
                        validationContext = FlowSpecValidationContext(
                            files: context.files.map { file in
                                guard let newText = updated[file.url] else { return file }
                                return FlowSpecSourceFile(url: file.url, source: newText)
                            },
                            currentFileURL: context.currentFileURL
                        )
                    }
                }
            }

            undo?.endUndoGrouping()
            isApplyingLinkedRename = false

            let length = (textView.string as NSString).length
            caret = min(max(0, caret), length)
            textView.setSelectedRange(NSRange(location: caret, length: 0))
            text = textView.string
            scheduleHighlight(for: textView)
            return false
        }

        private func scheduleHighlight(for textView: NSTextView) {
            pendingHighlight?.cancel()
            let work = DispatchWorkItem { [weak self, weak textView] in
                guard let self, let textView, let storage = textView.textStorage else { return }
                let ranges = textView.selectedRanges
                let analysis = self.analysis(for: textView.string)
                FlowSpecSyntaxHighlighter.apply(
                    to: storage,
                    appearance: textView.effectiveAppearance,
                    diagnostics: analysis.diagnostics,
                    resolvedGoToRanges: analysis.resolvedGoToRanges,
                    goToDestinations: analysis.goToDestinations,
                    lineSpacing: self.lineSpacing,
                    fontSize: self.fontSize
                )
                textView.selectedRanges = ranges
                textView.typingAttributes = FlowSpecTextEditor.baseAttributes(
                    lineSpacing: self.lineSpacing,
                    fontSize: self.fontSize
                )
                textView.window?.invalidateCursorRects(for: textView)
                textView.needsDisplay = true
                (textView as? IndentingTextView)?.refreshActiveBacklink()
            }
            pendingHighlight = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.04, execute: work)
        }

        func analysis(for source: String) -> FlowSpecHighlightAnalysis {
            guard let validationContext else {
                let fileURL = URL(fileURLWithPath: "/document.flowspec")
                let files = [FlowSpecSourceFile(url: fileURL, source: source)]
                return FlowSpecHighlightAnalysis(
                    diagnostics: FlowSpecStructureValidator.validate(source),
                    resolvedGoToRanges: FlowSpecStructureValidator.resolvedGoToRanges(
                        in: files,
                        currentFileURL: fileURL
                    ),
                    goToDestinations: FlowSpecStructureValidator.goToDestinations(
                        in: files,
                        currentFileURL: fileURL
                    )
                )
            }

            let files = validationContext.files.map { file in
                file.url == validationContext.currentFileURL
                    ? FlowSpecSourceFile(url: file.url, source: source)
                    : file
            }
            return FlowSpecHighlightAnalysis(
                diagnostics: FlowSpecStructureValidator.validate(
                    files,
                    currentFileURL: validationContext.currentFileURL
                ),
                resolvedGoToRanges: FlowSpecStructureValidator.resolvedGoToRanges(
                    in: files,
                    currentFileURL: validationContext.currentFileURL
                ),
                goToDestinations: FlowSpecStructureValidator.goToDestinations(
                    in: files,
                    currentFileURL: validationContext.currentFileURL
                )
            )
        }
    }
}

final class EditorScrollView: NSScrollView {
    /// Roughly 100 characters in the editor's 14-point monospaced font.
    static let preferredWrapWidth: CGFloat = 840
    static let minHorizontalInset: CGFloat = 24
    static let verticalTextInset: CGFloat = 12

    override func scrollWheel(with event: NSEvent) {
        (documentView as? IndentingTextView)?.hideCompletions()
        let horizontalOrigin = contentView.bounds.origin.x
        super.scrollWheel(with: event)

        let currentOrigin = contentView.bounds.origin
        guard abs(currentOrigin.x - horizontalOrigin) > 0.01 else { return }
        contentView.setBoundsOrigin(NSPoint(x: horizontalOrigin, y: currentOrigin.y))
        reflectScrolledClipView(contentView)
    }

    override func layout() {
        super.layout()
        guard let textView = documentView as? NSTextView else { return }

        let viewport = contentView.bounds.size
        let requiredWidth = viewport.width
        let requiredHeight = max(textView.frame.height, viewport.height)
        if textView.frame.size != NSSize(width: requiredWidth, height: requiredHeight) {
            textView.setFrameSize(NSSize(width: requiredWidth, height: requiredHeight))
        }

        updateCenteredTextLayout(in: textView, viewportWidth: viewport.width)
    }

    private func updateCenteredTextLayout(in textView: NSTextView, viewportWidth: CGFloat) {
        guard let textContainer = textView.textContainer else { return }

        let wrapWidth = min(
            Self.preferredWrapWidth,
            max(1, viewportWidth - Self.minHorizontalInset * 2)
        )
        let horizontalInset = max(
            Self.minHorizontalInset,
            (viewportWidth - wrapWidth) / 2
        )
        let insetChanged =
            abs(textView.textContainerInset.width - horizontalInset) > 0.5
            || abs(textView.textContainerInset.height - Self.verticalTextInset) > 0.5
        if insetChanged {
            textView.textContainerInset = NSSize(
                width: horizontalInset,
                height: Self.verticalTextInset
            )
        }

        let widthChanged = abs(textContainer.containerSize.width - wrapWidth) > 0.5
        if widthChanged {
            textContainer.containerSize = NSSize(
                width: wrapWidth,
                height: CGFloat.greatestFiniteMagnitude
            )
        }

        if insetChanged || widthChanged {
            textView.layoutManager?.ensureLayout(for: textContainer)
            textView.needsDisplay = true
            textView.window?.invalidateCursorRects(for: textView)
        }
    }
}

final class IndentingTextView: NSTextView {
    var showsStructureHintDetails = false
    var lineSpacing = FlowSpecLineSpacing.normal.points
    var editorFontSize = FlowSpecFontSize.medium.points
    var onStructureHintHover: ((String?) -> Void)?
    var onGoToLink: ((Int) -> Void)?
    var onActiveBacklinkChange: ((FlowSpecGoToTargetMark?) -> Void)?
    var highlightAnalysisProvider: ((String) -> FlowSpecHighlightAnalysis)?
    private let indent = "  "
    private var hoverTrackingArea: NSTrackingArea?
    private var pendingHint: DispatchWorkItem?
    private var pendingHintRange = NSRange(location: NSNotFound, length: 0)
    private var displayedHintMessage: String?
    private var hoveredBacklinkRange = NSRange(location: NSNotFound, length: 0)
    private var dismissedBacklinkLocation: Int?
    private var lastReportedBacklink: FlowSpecGoToTargetMark?
    private lazy var completionController = FlowSpecCompletionController { [weak self] item, range in
        self?.insertCompletion(item, replacing: range)
    }

    override func keyDown(with event: NSEvent) {
        if completionController.isVisible {
            switch event.keyCode {
            case 125:
                completionController.moveSelection(by: 1)
                return
            case 126:
                completionController.moveSelection(by: -1)
                return
            case 36, 76, 48:
                completionController.acceptSelection()
                return
            case 53:
                completionController.hide()
                return
            default:
                break
            }
        }

        if event.keyCode == 49,
           event.modifierFlags.intersection([.control, .command, .option]) == .control {
            updateCompletions(includeEmptyPrefix: true)
            return
        }

        if event.keyCode == 48 {
            completionController.hide()
            event.modifierFlags.contains(.shift) ? outdentSelection() : indentSelection()
            return
        }
        if event.keyCode == 36 || event.keyCode == 76 {
            completionController.hide()
            insertIndentedNewline()
            return
        }

        let refreshAfterKey = shouldRefreshCompletions(after: event)
        if !refreshAfterKey { completionController.hide() }
        super.keyDown(with: event)
        if refreshAfterKey {
            DispatchQueue.main.async { [weak self] in
                self?.updateCompletions(includeEmptyPrefix: false)
            }
        }
    }

    override func resignFirstResponder() -> Bool {
        completionController.hide()
        clearBacklinkHover()
        return super.resignFirstResponder()
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        backgroundColor = .textBackgroundColor
        insertionPointColor = .labelColor
        if let storage = textStorage {
            let analysis = highlightAnalysisProvider?(string)
            FlowSpecSyntaxHighlighter.apply(
                to: storage,
                appearance: effectiveAppearance,
                diagnostics: analysis?.diagnostics,
                resolvedGoToRanges: analysis?.resolvedGoToRanges,
                goToDestinations: analysis?.goToDestinations,
                lineSpacing: lineSpacing,
                fontSize: editorFontSize
            )
        }
        needsDisplay = true
        window?.invalidateCursorRects(for: self)
        refreshActiveBacklink()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.acceptsMouseMovedEvents = true
    }

    override func updateTrackingAreas() {
        if let hoverTrackingArea {
            removeTrackingArea(hoverTrackingArea)
        }
        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeInKeyWindow, .inVisibleRect, .mouseMoved, .mouseEnteredAndExited, .cursorUpdate],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
        hoverTrackingArea = trackingArea
        super.updateTrackingAreas()
    }

    override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        updateBacklinkHover(at: point)
        if backlinkAnnotation(at: point) != nil {
            NSCursor.arrow.set()
            clearStructureHint()
            return
        }

        super.mouseMoved(with: event)
        guard showsStructureHintDetails else {
            clearStructureHint()
            return
        }
        guard let hint = structureHint(at: point) else {
            clearStructureHint()
            return
        }

        if pendingHintRange == hint.range, pendingHint != nil {
            return
        }
        if pendingHintRange == hint.range { return }

        clearStructureHint()
        pendingHintRange = hint.range
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.pendingHintRange == hint.range else { return }
            self.pendingHint = nil
            self.displayedHintMessage = hint.message
            self.onStructureHintHover?(hint.message)
        }
        pendingHint = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
    }

    override func cursorUpdate(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if backlinkAnnotation(at: point) != nil {
            NSCursor.arrow.set()
            return
        }
        super.cursorUpdate(with: event)
    }

    override func mouseEntered(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if backlinkAnnotation(at: point) != nil {
            NSCursor.arrow.set()
            return
        }
        super.mouseEntered(with: event)
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        clearStructureHint()
        clearBacklinkHover()
    }

    override func mouseDown(with event: NSEvent) {
        completionController.hide()
        clearStructureHint()
        let point = convert(event.locationInWindow, from: nil)
        if event.clickCount == 1, let mark = backlinkAnnotation(at: point) {
            handleBacklinkAnnotationClick(mark)
            return
        }
        if event.clickCount == 1,
           let characterIndex = goToLinkCharacterIndex(at: point) {
            onGoToLink?(characterIndex)
            return
        }
        super.mouseDown(with: event)
    }

    override func resetCursorRects() {
        super.resetCursorRects()
        guard let textStorage,
              let layoutManager,
              let textContainer else {
            return
        }

        let fullRange = NSRange(location: 0, length: textStorage.length)
        textStorage.enumerateAttribute(.flowSpecGoToLink, in: fullRange) { value, range, _ in
            guard value != nil, range.length > 0 else { return }
            let glyphRange = layoutManager.glyphRange(
                forCharacterRange: range,
                actualCharacterRange: nil
            )
            layoutManager.enumerateEnclosingRects(
                forGlyphRange: glyphRange,
                withinSelectedGlyphRange: NSRange(location: NSNotFound, length: 0),
                in: textContainer
            ) { rect, _ in
                var linkRect = rect
                linkRect.origin.x += self.textContainerOrigin.x
                linkRect.origin.y += self.textContainerOrigin.y
                self.addCursorRect(linkRect, cursor: .pointingHand)
            }
        }
        enumerateBacklinkAnnotations { mark, pillRect in
            guard mark.hasIncomingReferences else { return }
            addCursorRect(pillRect, cursor: .arrow)
        }
    }

    override func drawBackground(in rect: NSRect) {
        super.drawBackground(in: rect)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        drawBacklinkAnnotations(in: dirtyRect)
        drawDiagnosticSquiggles(in: dirtyRect)
    }

    func refreshCurrentLine() {
        needsDisplay = true
    }

    func hideCompletions() {
        completionController.hide()
    }

    func resetBacklinkPresentation() {
        dismissedBacklinkLocation = nil
        hoveredBacklinkRange = NSRange(location: NSNotFound, length: 0)
        reportActiveBacklink(nil)
    }

    func refreshActiveBacklink() {
        let mark = innermostBacklinkMark(containing: selectedRange().location)
        if let mark, mark.hasIncomingReferences {
            if dismissedBacklinkLocation == mark.range.location {
                reportActiveBacklink(nil)
            } else {
                reportActiveBacklink(mark)
            }
        } else {
            dismissedBacklinkLocation = nil
            reportActiveBacklink(nil)
        }
    }

    private func shouldRefreshCompletions(after event: NSEvent) -> Bool {
        if event.keyCode == 51 { return true }
        guard !event.modifierFlags.contains(.command),
              !event.modifierFlags.contains(.control),
              let characters = event.characters,
              !characters.isEmpty else { return false }
        return characters.unicodeScalars.allSatisfy {
            CharacterSet.letters.contains($0) || $0.value == 32
        }
    }

    private func updateCompletions(includeEmptyPrefix: Bool) {
        guard window?.firstResponder === self,
              let result = FlowSpecCompletionProvider.completions(
                in: string,
                selectedRange: selectedRange(),
                includeEmptyPrefix: includeEmptyPrefix
              ) else {
            completionController.hide()
            return
        }
        completionController.show(result, in: self)
    }

    private let backlinkAnnotationPadding = NSSize(width: 7, height: 2)

    private var backlinkAnnotationFont: NSFont {
        NSFont.systemFont(ofSize: max(10, min(12, editorFontSize - 2)), weight: .regular)
    }

    private func backlinkAnnotationAttributes(highlighted: Bool) -> [NSAttributedString.Key: Any] {
        [
            .font: backlinkAnnotationFont,
            .foregroundColor: highlighted ? NSColor.secondaryLabelColor : NSColor.tertiaryLabelColor
        ]
    }

    private func snapBacklinkValue(_ value: CGFloat) -> CGFloat {
        let scale = window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
        return (value * scale).rounded() / scale
    }

    private func drawBacklinkAnnotations(in dirtyRect: NSRect) {
        effectiveAppearance.performAsCurrentDrawingAppearance {
            enumerateBacklinkAnnotations { mark, pillRect in
                guard mark.hasIncomingReferences, pillRect.intersects(dirtyRect) else { return }

                let highlighted = hoveredBacklinkRange == mark.range
                    || lastReportedBacklink?.range.location == mark.range.location
                if highlighted {
                    NSColor.quaternaryLabelColor.setFill()
                    let radius = snapBacklinkValue(min(4, pillRect.height / 2))
                    NSBezierPath(roundedRect: pillRect, xRadius: radius, yRadius: radius).fill()
                }

                let label = mark.annotationText as NSString
                label.draw(
                    at: NSPoint(
                        x: pillRect.minX + backlinkAnnotationPadding.width,
                        y: pillRect.minY + backlinkAnnotationPadding.height
                    ),
                    withAttributes: backlinkAnnotationAttributes(highlighted: highlighted)
                )
            }
        }
    }

    private func enumerateBacklinkAnnotations(
        _ body: (FlowSpecGoToTargetMark, NSRect) -> Void
    ) {
        guard let textStorage,
              textStorage.length > 0,
              let layoutManager,
              let textContainer else { return }

        let attributes = backlinkAnnotationAttributes(highlighted: false)
        let padding = backlinkAnnotationPadding
        let fullRange = NSRange(location: 0, length: textStorage.length)
        textStorage.enumerateAttribute(.flowSpecGoToTarget, in: fullRange) { value, characterRange, _ in
            guard let info = value as? FlowSpecGoToTargetAttribute, characterRange.length > 0 else { return }
            let mark = FlowSpecGoToTargetMark(range: characterRange, incoming: info.incoming)
            let glyphRange = layoutManager.glyphRange(
                forCharacterRange: characterRange,
                actualCharacterRange: nil
            )
            guard glyphRange.length > 0 else { return }

            var wordRect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
            wordRect.origin.x += self.textContainerOrigin.x
            wordRect.origin.y += self.textContainerOrigin.y

            let lastGlyph = NSMaxRange(glyphRange) - 1
            var lineRect = layoutManager.lineFragmentRect(forGlyphAt: lastGlyph, effectiveRange: nil)
            lineRect.origin.x += self.textContainerOrigin.x
            lineRect.origin.y += self.textContainerOrigin.y

            let labelSize = (mark.annotationText as NSString).size(withAttributes: attributes)
            let pillSize = NSSize(
                width: ceil(labelSize.width) + padding.width * 2,
                height: ceil(labelSize.height) + padding.height * 2
            )
            let minX = wordRect.maxX + 10
            let maxX = self.bounds.maxX - 8 - pillSize.width
            let preferredX = self.textContainerOrigin.x + textContainer.size.width - pillSize.width
            let annotationX = self.snapBacklinkValue(min(max(minX, preferredX), max(minX, maxX)))
            let annotationY = self.snapBacklinkValue(lineRect.midY - pillSize.height / 2)

            body(mark, NSRect(
                x: annotationX,
                y: annotationY,
                width: pillSize.width,
                height: pillSize.height
            ))
        }
    }

    private func updateBacklinkHover(at point: NSPoint) {
        let range = backlinkAnnotation(at: point)?.range
            ?? NSRange(location: NSNotFound, length: 0)
        guard range != hoveredBacklinkRange else { return }
        hoveredBacklinkRange = range
        needsDisplay = true
    }

    private func clearBacklinkHover() {
        guard hoveredBacklinkRange.location != NSNotFound else { return }
        hoveredBacklinkRange = NSRange(location: NSNotFound, length: 0)
        needsDisplay = true
    }

    private func backlinkAnnotation(at point: NSPoint) -> FlowSpecGoToTargetMark? {
        var found: FlowSpecGoToTargetMark?
        enumerateBacklinkAnnotations { mark, pillRect in
            guard mark.hasIncomingReferences else { return }
            if pillRect.contains(point) {
                found = mark
            }
        }
        return found
    }

    private func handleBacklinkAnnotationClick(_ mark: FlowSpecGoToTargetMark) {
        let isShowing = lastReportedBacklink?.range.location == mark.range.location
            && dismissedBacklinkLocation != mark.range.location
        if isShowing {
            dismissedBacklinkLocation = mark.range.location
            reportActiveBacklink(nil)
        } else {
            dismissedBacklinkLocation = nil
            reportActiveBacklink(mark)
        }
        setSelectedRange(NSRange(location: mark.range.location, length: 0))
    }

    private func innermostBacklinkMark(containing location: Int) -> FlowSpecGoToTargetMark? {
        var matches: [(mark: FlowSpecGoToTargetMark, nodeRange: NSRange)] = []
        enumerateBacklinkAnnotations { mark, _ in
            let nodeRange = FlowSpecStructureValidator.structuralNodeRange(
                containing: mark.range.location,
                in: self.string
            )
            if NSLocationInRange(location, nodeRange)
                || (location == NSMaxRange(nodeRange) && nodeRange.length > 0) {
                matches.append((mark, nodeRange))
            }
        }
        return matches.min(by: { $0.nodeRange.length < $1.nodeRange.length })?.mark
    }

    private func reportActiveBacklink(_ mark: FlowSpecGoToTargetMark?) {
        if lastReportedBacklink == mark { return }
        lastReportedBacklink = mark
        onActiveBacklinkChange?(mark)
        needsDisplay = true
    }

    private func insertCompletion(_ item: FlowSpecCompletionItem, replacing range: NSRange) {
        let insertedText = item.directive + (item.addsTrailingSpace ? " " : "")
        guard shouldChangeText(in: range, replacementString: insertedText) else { return }
        textStorage?.replaceCharacters(in: range, with: insertedText)
        didChangeText()
        setSelectedRange(NSRange(
            location: range.location + (insertedText as NSString).length,
            length: 0
        ))
        typingAttributes = FlowSpecTextEditor.baseAttributes(
            lineSpacing: lineSpacing,
            fontSize: editorFontSize
        )
        scrollRangeToVisible(selectedRange())
    }

    private func drawDiagnosticSquiggles(in dirtyRect: NSRect) {
        guard let textStorage,
              textStorage.length > 0,
              let layoutManager,
              let textContainer else { return }

        let fullRange = NSRange(location: 0, length: textStorage.length)
        textStorage.enumerateAttribute(.flowSpecDiagnostic, in: fullRange) { value, characterRange, _ in
            guard value != nil, characterRange.length > 0 else { return }
            let color = textStorage.attribute(
                .flowSpecDiagnosticColor,
                at: characterRange.location,
                effectiveRange: nil
            ) as? NSColor ?? .systemRed
            let diagnosticGlyphRange = layoutManager.glyphRange(
                forCharacterRange: characterRange,
                actualCharacterRange: nil
            )

            layoutManager.enumerateLineFragments(forGlyphRange: diagnosticGlyphRange) {
                _, _, _, lineGlyphRange, _ in
                let segment = NSIntersectionRange(diagnosticGlyphRange, lineGlyphRange)
                guard segment.length > 0 else { return }

                var glyphRect = layoutManager.boundingRect(forGlyphRange: segment, in: textContainer)
                glyphRect.origin.x += self.textContainerOrigin.x
                glyphRect.origin.y += self.textContainerOrigin.y
                guard glyphRect.insetBy(dx: -3, dy: -3).intersects(dirtyRect) else { return }

                self.drawSquiggle(
                    fromX: glyphRect.minX,
                    toX: glyphRect.maxX,
                    y: glyphRect.maxY - 3.5,
                    color: color
                )
            }
        }
    }

    private func drawSquiggle(fromX startX: CGFloat, toX endX: CGFloat, y baseY: CGFloat, color: NSColor) {
        guard endX > startX else { return }
        let path = NSBezierPath()
        path.lineWidth = 1.65
        path.lineCapStyle = .round
        path.lineJoinStyle = .round

        let amplitude: CGFloat = 1.7
        let wavelength: CGFloat = 6
        let step: CGFloat = 0.75
        path.move(to: NSPoint(x: startX, y: baseY))

        var x = startX + step
        while x < endX {
            let phase = ((x - startX) / wavelength) * 2 * .pi
            path.line(to: NSPoint(x: x, y: baseY + sin(phase) * amplitude))
            x += step
        }
        let finalPhase = ((endX - startX) / wavelength) * 2 * .pi
        path.line(to: NSPoint(x: endX, y: baseY + sin(finalPhase) * amplitude))

        color.setStroke()
        path.stroke()
    }

    private func structureHint(at point: NSPoint) -> (message: String, range: NSRange, rect: NSRect)? {
        guard let textStorage,
              textStorage.length > 0,
              let layoutManager,
              let textContainer else { return nil }

        let containerPoint = NSPoint(
            x: point.x - textContainerOrigin.x,
            y: point.y - textContainerOrigin.y
        )
        let glyphIndex = layoutManager.glyphIndex(
            for: containerPoint,
            in: textContainer,
            fractionOfDistanceThroughGlyph: nil
        )
        guard glyphIndex < layoutManager.numberOfGlyphs else { return nil }

        let glyphRect = layoutManager.boundingRect(
            forGlyphRange: NSRange(location: glyphIndex, length: 1),
            in: textContainer
        )
        guard glyphRect.insetBy(dx: -2, dy: -2).contains(containerPoint) else { return nil }

        let characterIndex = layoutManager.characterIndexForGlyph(at: glyphIndex)
        guard characterIndex < textStorage.length else { return nil }

        var effectiveRange = NSRange(location: 0, length: 0)
        guard let message = textStorage.attribute(
            .flowSpecDiagnostic,
            at: characterIndex,
            effectiveRange: &effectiveRange
        ) as? String else { return nil }

        let hintGlyphRange = layoutManager.glyphRange(
            forCharacterRange: effectiveRange,
            actualCharacterRange: nil
        )
        var hintRect = layoutManager.boundingRect(forGlyphRange: hintGlyphRange, in: textContainer)
        hintRect.origin.x += textContainerOrigin.x
        hintRect.origin.y += textContainerOrigin.y
        return (message, effectiveRange, hintRect)
    }

    private func goToLinkCharacterIndex(at point: NSPoint) -> Int? {
        guard let textStorage,
              textStorage.length > 0,
              let layoutManager,
              let textContainer else {
            return nil
        }

        let containerPoint = NSPoint(
            x: point.x - textContainerOrigin.x,
            y: point.y - textContainerOrigin.y
        )
        let glyphIndex = layoutManager.glyphIndex(
            for: containerPoint,
            in: textContainer,
            fractionOfDistanceThroughGlyph: nil
        )
        guard glyphIndex < layoutManager.numberOfGlyphs else { return nil }

        let glyphRect = layoutManager.boundingRect(
            forGlyphRange: NSRange(location: glyphIndex, length: 1),
            in: textContainer
        )
        guard glyphRect.contains(containerPoint) else { return nil }

        let characterIndex = layoutManager.characterIndexForGlyph(at: glyphIndex)
        guard characterIndex < textStorage.length,
              textStorage.attribute(
                .flowSpecGoToLink,
                at: characterIndex,
                effectiveRange: nil
              ) != nil else {
            return nil
        }
        return characterIndex
    }

    func clearStructureHint() {
        pendingHint?.cancel()
        pendingHint = nil
        pendingHintRange = NSRange(location: NSNotFound, length: 0)
        if displayedHintMessage != nil {
            displayedHintMessage = nil
            onStructureHintHover?(nil)
        }
    }

    private func insertIndentedNewline() {
        guard shouldChangeText(in: selectedRange(), replacementString: "\n") else { return }
        let source = string as NSString
        let caret = selectedRange().location
        let lineRange = source.lineRange(for: NSRange(location: min(caret, source.length), length: 0))
        let beforeCaretLength = max(0, min(caret - lineRange.location, lineRange.length))
        let beforeCaret = source.substring(with: NSRange(location: lineRange.location, length: beforeCaretLength))
        let leading = String(beforeCaret.prefix { $0 == " " || $0 == "\t" })
        let replacement = "\n" + leading
        insertText(replacement, replacementRange: selectedRange())
        didChangeText()
    }

    private func indentSelection() {
        let selection = selectedRange()
        let source = string as NSString
        if selection.length == 0 {
            insertText(indent, replacementRange: selection)
            return
        }

        let lineRange = source.lineRange(for: selection)
        let block = source.substring(with: lineRange)
        let lines = block.components(separatedBy: "\n")
        let replacement = lines.enumerated().map { index, line in
            if index == lines.count - 1 && line.isEmpty { return line }
            return indent + line
        }.joined(separator: "\n")

        guard shouldChangeText(in: lineRange, replacementString: replacement) else { return }
        textStorage?.replaceCharacters(in: lineRange, with: replacement)
        didChangeText()
        setSelectedRange(NSRange(location: lineRange.location, length: (replacement as NSString).length))
    }

    private func outdentSelection() {
        let selection = selectedRange()
        let source = string as NSString
        let lineRange = source.lineRange(for: selection)
        let block = source.substring(with: lineRange)
        let lines = block.components(separatedBy: "\n")
        var lineStart = 0
        var removals: [(start: Int, count: Int)] = []
        let replacement = lines.enumerated().map { index, line in
            defer { lineStart += (line as NSString).length + 1 }
            if index == lines.count - 1 && line.isEmpty { return line }

            let removalCount: Int
            if line.hasPrefix(indent) {
                removalCount = indent.count
            } else if line.hasPrefix("\t") || line.hasPrefix(" ") {
                removalCount = 1
            } else {
                removalCount = 0
            }
            removals.append((lineStart, removalCount))
            return String(line.dropFirst(removalCount))
        }.joined(separator: "\n")

        guard replacement != block, shouldChangeText(in: lineRange, replacementString: replacement) else { return }
        let relativeStart = selection.location - lineRange.location
        let relativeEnd = NSMaxRange(selection) - lineRange.location
        let mappedStart = mappedOffset(relativeStart, afterRemoving: removals)
        let mappedEnd = mappedOffset(relativeEnd, afterRemoving: removals)

        textStorage?.replaceCharacters(in: lineRange, with: replacement)
        didChangeText()
        setSelectedRange(NSRange(
            location: lineRange.location + mappedStart,
            length: max(0, mappedEnd - mappedStart)
        ))
    }

    private func mappedOffset(
        _ offset: Int,
        afterRemoving removals: [(start: Int, count: Int)]
    ) -> Int {
        var removedBefore = 0
        for removal in removals where removal.count > 0 {
            if offset <= removal.start { break }
            if offset < removal.start + removal.count {
                return removal.start - removedBefore
            }
            removedBefore += removal.count
        }
        return max(0, offset - removedBefore)
    }
}
