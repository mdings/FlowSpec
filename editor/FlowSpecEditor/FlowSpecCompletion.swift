import AppKit

struct FlowSpecCompletionItem: Equatable {
    let directive: String
    let detail: String
    let addsTrailingSpace: Bool
}

struct FlowSpecCompletionResult {
    let items: [FlowSpecCompletionItem]
    let replacementRange: NSRange
}

enum FlowSpecCompletionProvider {
    private enum Kind {
        case document, flow, screen, section, layout, action, id, entry
        case receives, rules, uses, steps, shows, outcome
        case when, once, `if`, otherwise, parallel, goTo, content

        var canOwnChildren: Bool {
            switch self {
            case .flow, .screen, .section, .layout, .action,
                 .receives, .rules, .uses, .steps, .shows, .outcome,
                 .when, .once, .if, .otherwise, .parallel:
                true
            case .document, .id, .entry, .goTo, .content:
                false
            }
        }
    }

    private struct ParsedLine {
        let lineIndex: Int
        let indentation: Int
        let kind: Kind
        let parentLineIndex: Int?
    }

    private struct StackEntry {
        let lineIndex: Int
        let indentation: Int
        let kind: Kind
    }

    private static let allItems: [FlowSpecCompletionItem] = [
        .init(directive: "Flow", detail: "Start the file's flow", addsTrailingSpace: true),
        .init(directive: "Screen", detail: "Add a screen", addsTrailingSpace: true),
        .init(directive: "Section", detail: "Group screen content", addsTrailingSpace: true),
        .init(directive: "Layout", detail: "Arrange sections", addsTrailingSpace: false),
        .init(directive: "Action", detail: "Describe an interaction", addsTrailingSpace: true),
        .init(directive: "Id", detail: "Give this destination an identifier", addsTrailingSpace: true),
        .init(directive: "Entry", detail: "Mark an external trigger that can begin this Flow", addsTrailingSpace: true),
        .init(directive: "Receives", detail: "List the input", addsTrailingSpace: false),
        .init(directive: "Rules", detail: "List behavioral rules", addsTrailingSpace: false),
        .init(directive: "Uses", detail: "List required information", addsTrailingSpace: false),
        .init(directive: "Steps", detail: "Describe what happens", addsTrailingSpace: false),
        .init(directive: "Shows", detail: "Describe visible content", addsTrailingSpace: false),
        .init(directive: "Outcome", detail: "Describe the result", addsTrailingSpace: false),
        .init(directive: "When", detail: "Respond to an event", addsTrailingSpace: true),
        .init(directive: "Once", detail: "Continue after something completes", addsTrailingSpace: true),
        .init(directive: "If", detail: "Add a condition", addsTrailingSpace: true),
        .init(directive: "Otherwise", detail: "Add the alternative branch", addsTrailingSpace: false),
        .init(directive: "At the same time", detail: "Run steps in parallel", addsTrailingSpace: false),
        .init(directive: "Go to", detail: "Navigate to another destination", addsTrailingSpace: true)
    ]

    static func completions(
        in source: String,
        selectedRange: NSRange,
        includeEmptyPrefix: Bool = false
    ) -> FlowSpecCompletionResult? {
        let nsSource = source as NSString
        guard selectedRange.length == 0, selectedRange.location <= nsSource.length else { return nil }

        let lineRange = nsSource.lineRange(for: NSRange(location: selectedRange.location, length: 0))
        let prefixRange = NSRange(
            location: lineRange.location,
            length: selectedRange.location - lineRange.location
        )
        let linePrefix = nsSource.substring(with: prefixRange)
        let indentationText = String(linePrefix.prefix { $0 == " " || $0 == "\t" })
        let typedPrefix = String(linePrefix.dropFirst(indentationText.count))

        guard includeEmptyPrefix || !typedPrefix.isEmpty else { return nil }
        guard !typedPrefix.hasPrefix("#"),
              typedPrefix == typedPrefix.trimmingCharacters(in: .newlines) else { return nil }

        let currentLineIndex = lineIndex(at: lineRange.location, in: nsSource)
        let indentation = indentWidth(indentationText)
        let parsed = parseLines(in: source, excluding: currentLineIndex)
        let parent = nearestParent(
            before: currentLineIndex,
            indentation: indentation,
            parsedLines: parsed
        )
        let parentKind = parent?.kind ?? .document
        let insideSteps = hasAncestor(.steps, from: parent, parsedLines: parsed)
        var allowed = allowedDirectives(in: parentKind, insideSteps: insideSteps)

        let previousMeaningfulLine = parsed.last { $0.lineIndex < currentLineIndex }
        let sameIndentIdOwner = previousMeaningfulLine.flatMap { line -> ParsedLine? in
            guard line.indentation == indentation,
                  line.kind == .flow || line.kind == .screen || line.kind == .action else {
                return nil
            }
            return line
        }

        let parentOfParent = parent?.parentLineIndex.flatMap { parentLineIndex in
            parsed.first { $0.lineIndex == parentLineIndex }
        }
        if !(parentKind == .when && parentOfParent?.kind == .layout) {
            allowed.remove("Layout")
        }

        if hasMatchingIfSibling(
            before: currentLineIndex,
            indentation: indentation,
            parentLineIndex: parent?.lineIndex,
            parsedLines: parsed
        ) {
            allowed.insert("Otherwise")
        } else {
            allowed.remove("Otherwise")
        }

        let existingChildren = Set(parsed.compactMap { line -> String? in
            guard line.parentLineIndex == parent?.lineIndex else { return nil }
            if line.kind == .id { return "Id" }
            guard line.indentation == indentation else { return nil }
            return directive(for: line.kind)
        })
        for uniqueDirective in ["Id", "Receives", "Rules", "Uses", "Steps", "Shows", "Outcome"]
            where existingChildren.contains(uniqueDirective) {
            allowed.remove(uniqueDirective)
        }
        if (parentKind == .screen || parentKind == .section), existingChildren.contains("Layout") {
            allowed.remove("Layout")
        }
        if parentKind == .document,
           parsed.contains(where: { $0.kind == .flow && $0.parentLineIndex == nil }) {
            allowed.remove("Flow")
        }
        if let sameIndentIdOwner,
           !parsed.contains(where: {
               $0.kind == .id && $0.parentLineIndex == sameIndentIdOwner.lineIndex
           }) {
            allowed.insert("Id")
        }

        let normalizedPrefix = typedPrefix.lowercased()
        let matchingItems = allItems.filter { item in
            allowed.contains(item.directive) &&
                (normalizedPrefix.isEmpty || item.directive.lowercased().hasPrefix(normalizedPrefix))
        }
        guard !matchingItems.isEmpty else { return nil }

        return FlowSpecCompletionResult(
            items: matchingItems,
            replacementRange: NSRange(
                location: lineRange.location + (indentationText as NSString).length,
                length: (typedPrefix as NSString).length
            )
        )
    }

    private static func allowedDirectives(in parent: Kind, insideSteps: Bool) -> Set<String> {
        switch parent {
        case .document:
            ["Flow"]
        case .flow:
            ["Screen", "Action", "Entry", "Receives", "Rules", "Uses", "Steps",
             "Outcome", "When", "Once", "If", "Go to"]
        case .screen:
            ["Section", "Layout", "Action", "Shows", "When", "Once", "If", "Go to"]
        case .section:
            ["Section", "Layout", "Action", "When", "Once", "If", "Go to"]
        case .layout:
            ["Rules", "When"]
        case .action:
            ["Receives", "Rules", "Uses", "Steps", "Outcome",
             "When", "Once", "If", "Go to"]
        case .steps, .parallel:
            ["When", "Once", "If", "At the same time", "Go to"]
        case .when:
            controlDirectives(insideSteps: insideSteps).union(["Layout"])
        case .once, .if, .otherwise:
            controlDirectives(insideSteps: insideSteps)
        case .receives, .rules, .uses, .shows, .outcome, .id, .entry, .goTo, .content:
            []
        }
    }

    private static func controlDirectives(insideSteps: Bool) -> Set<String> {
        var result: Set<String> = ["When", "Once", "If", "Go to"]
        if insideSteps { result.insert("At the same time") }
        return result
    }

    private static func parseLines(in source: String, excluding excludedLine: Int) -> [ParsedLine] {
        var stack: [StackEntry] = []
        var result: [ParsedLine] = []
        for (lineIndex, rawLine) in source.components(separatedBy: .newlines).enumerated()
            where lineIndex != excludedLine {
            let indentationText = String(rawLine.prefix { $0 == " " || $0 == "\t" })
            let trimmed = rawLine.dropFirst(indentationText.count)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { continue }

            let kind = classify(trimmed)
            let indentation = indentWidth(indentationText)

            if kind == .id,
               let owner = stack.last,
               owner.indentation == indentation,
               owner.kind == .flow || owner.kind == .screen || owner.kind == .action {
                result.append(ParsedLine(
                    lineIndex: lineIndex,
                    indentation: indentation,
                    kind: kind,
                    parentLineIndex: owner.lineIndex
                ))
                continue
            }

            while let last = stack.last, last.indentation >= indentation { stack.removeLast() }
            let line = ParsedLine(
                lineIndex: lineIndex,
                indentation: indentation,
                kind: kind,
                parentLineIndex: stack.last?.lineIndex
            )
            result.append(line)
            if kind.canOwnChildren {
                stack.append(StackEntry(lineIndex: lineIndex, indentation: indentation, kind: kind))
            }
        }
        return result
    }

    private static func nearestParent(
        before lineIndex: Int,
        indentation: Int,
        parsedLines: [ParsedLine]
    ) -> ParsedLine? {
        parsedLines.last { candidate in
            candidate.lineIndex < lineIndex &&
                candidate.indentation < indentation &&
                candidate.kind.canOwnChildren &&
                !parsedLines.contains { line in
                    line.lineIndex > candidate.lineIndex &&
                        line.lineIndex < lineIndex &&
                        line.indentation <= candidate.indentation &&
                        !(line.kind == .id && line.parentLineIndex == candidate.lineIndex)
                }
        }
    }

    private static func hasAncestor(
        _ kind: Kind,
        from parent: ParsedLine?,
        parsedLines: [ParsedLine]
    ) -> Bool {
        var current = parent
        while let line = current {
            if line.kind == kind { return true }
            guard let parentLineIndex = line.parentLineIndex else { return false }
            current = parsedLines.first { $0.lineIndex == parentLineIndex }
        }
        return false
    }

    private static func hasMatchingIfSibling(
        before lineIndex: Int,
        indentation: Int,
        parentLineIndex: Int?,
        parsedLines: [ParsedLine]
    ) -> Bool {
        for line in parsedLines.reversed() where line.lineIndex < lineIndex {
            guard line.indentation == indentation,
                  line.parentLineIndex == parentLineIndex else { continue }
            if line.kind == .otherwise { return false }
            if line.kind == .if { return true }
            if line.kind != .content { return false }
        }
        return false
    }

    private static func classify(_ line: String) -> Kind {
        let patterns: [(String, Kind)] = [
            ("At the same time", .parallel), ("Otherwise", .otherwise),
            ("Receives", .receives), ("Outcome", .outcome), ("Section", .section),
            ("Screen", .screen), ("Layout", .layout), ("Action", .action),
            ("Rules", .rules), ("Steps", .steps), ("Shows", .shows),
            ("Uses", .uses), ("Flow", .flow), ("Once", .once),
            ("When", .when), ("Go to", .goTo), ("If", .if), ("Id", .id), ("Entry", .entry)
        ]
        for (directive, kind) in patterns where line.hasPrefix(directive) {
            let suffix = line.dropFirst(directive.count)
            if suffix.isEmpty || suffix.first == ":" || suffix.first?.isWhitespace == true {
                return kind
            }
        }
        return .content
    }

    private static func directive(for kind: Kind) -> String? {
        switch kind {
        case .flow: "Flow"
        case .screen: "Screen"
        case .section: "Section"
        case .layout: "Layout"
        case .action: "Action"
        case .id: "Id"
        case .entry: "Entry"
        case .receives: "Receives"
        case .rules: "Rules"
        case .uses: "Uses"
        case .steps: "Steps"
        case .shows: "Shows"
        case .outcome: "Outcome"
        case .when: "When"
        case .once: "Once"
        case .if: "If"
        case .otherwise: "Otherwise"
        case .parallel: "At the same time"
        case .goTo: "Go to"
        case .document, .content: nil
        }
    }

    private static func lineIndex(at location: Int, in source: NSString) -> Int {
        guard location > 0 else { return 0 }
        return source.substring(to: min(location, source.length)).reduce(0) {
            $1 == "\n" ? $0 + 1 : $0
        }
    }

    private static func indentWidth(_ indentation: String) -> Int {
        indentation.reduce(0) { $0 + ($1 == "\t" ? 2 : 1) }
    }
}

final class FlowSpecCompletionController {
    private let rowHeight: CGFloat = 29
    private let width: CGFloat = 330
    private var panel: NSPanel?
    private var listView: FlowSpecCompletionListView?
    private(set) var result: FlowSpecCompletionResult?
    private(set) var selectedIndex = 0
    private let onAccept: (FlowSpecCompletionItem, NSRange) -> Void

    init(onAccept: @escaping (FlowSpecCompletionItem, NSRange) -> Void) {
        self.onAccept = onAccept
    }

    var isVisible: Bool { panel?.isVisible == true }

    func show(_ result: FlowSpecCompletionResult, in textView: NSTextView) {
        guard !result.items.isEmpty, let window = textView.window else { hide(); return }
        self.result = result
        selectedIndex = min(selectedIndex, result.items.count - 1)

        let listView = ensurePanel().contentView as! FlowSpecCompletionListView
        self.listView = listView
        listView.items = result.items
        listView.selectedIndex = selectedIndex
        listView.onHover = { [weak self] index in self?.select(index) }
        listView.onChoose = { [weak self] index in
            self?.select(index)
            self?.acceptSelection()
        }

        let height = CGFloat(result.items.count) * rowHeight + 2
        panel?.setContentSize(NSSize(width: width, height: height))
        positionPanel(height: height, beside: textView, in: window)
        if panel?.parent == nil { window.addChildWindow(panel!, ordered: .above) }
        panel?.orderFront(nil)
    }

    func hide() {
        if let panel, let parent = panel.parent { parent.removeChildWindow(panel) }
        panel?.orderOut(nil)
        result = nil
        selectedIndex = 0
    }

    func moveSelection(by delta: Int) {
        guard let result, !result.items.isEmpty else { return }
        select((selectedIndex + delta + result.items.count) % result.items.count)
    }

    func acceptSelection() {
        guard let result, result.items.indices.contains(selectedIndex) else { return }
        let item = result.items[selectedIndex]
        let range = result.replacementRange
        hide()
        onAccept(item, range)
    }

    private func select(_ index: Int) {
        guard let result, result.items.indices.contains(index) else { return }
        selectedIndex = index
        listView?.selectedIndex = index
        listView?.needsDisplay = true
    }

    private func ensurePanel() -> NSPanel {
        if let panel { return panel }
        let panel = NSPanel(
            contentRect: .zero,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = true
        panel.level = .popUpMenu
        panel.collectionBehavior = [.transient, .ignoresCycle]
        panel.contentView = FlowSpecCompletionListView(frame: .zero)
        self.panel = panel
        return panel
    }

    private func positionPanel(height: CGFloat, beside textView: NSTextView, in window: NSWindow) {
        guard let panel else { return }
        let insertion = min(textView.selectedRange().location, textView.string.utf16.count)
        var screenRect = textView.firstRect(
            forCharacterRange: NSRange(location: insertion, length: 0),
            actualRange: nil
        )
        screenRect.size = NSSize(width: 1, height: max(screenRect.height, 18))
        let visibleFrame = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? window.frame
        var origin = NSPoint(x: screenRect.minX, y: screenRect.minY - height - 4)
        if origin.y < visibleFrame.minY { origin.y = screenRect.maxY + 4 }
        origin.x = min(max(origin.x, visibleFrame.minX + 4), visibleFrame.maxX - width - 4)
        panel.setFrameOrigin(origin)
    }
}

private final class FlowSpecCompletionListView: NSView {
    var items: [FlowSpecCompletionItem] = [] { didSet { needsDisplay = true } }
    var selectedIndex = 0
    var onHover: ((Int) -> Void)?
    var onChoose: ((Int) -> Void)?
    private var trackingArea: NSTrackingArea?
    private let rowHeight: CGFloat = 29

    override var isFlipped: Bool { true }

    override func updateTrackingAreas() {
        if let trackingArea { removeTrackingArea(trackingArea) }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .inVisibleRect, .mouseMoved, .mouseEnteredAndExited],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        trackingArea = area
        super.updateTrackingAreas()
    }

    override func resetCursorRects() { addCursorRect(bounds, cursor: .arrow) }

    override func mouseMoved(with event: NSEvent) {
        let index = Int(convert(event.locationInWindow, from: nil).y / rowHeight)
        if items.indices.contains(index) { onHover?(index) }
    }

    override func mouseDown(with event: NSEvent) {
        let index = Int(convert(event.locationInWindow, from: nil).y / rowHeight)
        if items.indices.contains(index) { onChoose?(index) }
    }

    override func draw(_ dirtyRect: NSRect) {
        let background = NSBezierPath(roundedRect: bounds, xRadius: 7, yRadius: 7)
        NSColor.windowBackgroundColor.setFill()
        background.fill()

        for (index, item) in items.enumerated() {
            let rowRect = NSRect(x: 1, y: 1 + CGFloat(index) * rowHeight,
                                 width: bounds.width - 2, height: rowHeight)
            if index == selectedIndex {
                NSColor.selectedContentBackgroundColor.withAlphaComponent(0.16).setFill()
                NSBezierPath(roundedRect: rowRect.insetBy(dx: 3, dy: 2),
                             xRadius: 5, yRadius: 5).fill()
            }
            let directive = NSAttributedString(string: item.directive, attributes: [
                .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                .foregroundColor: NSColor.labelColor
            ])
            directive.draw(at: NSPoint(x: 10, y: rowRect.minY + 6))
            NSAttributedString(string: item.detail, attributes: [
                .font: NSFont.systemFont(ofSize: 12),
                .foregroundColor: NSColor.secondaryLabelColor
            ]).draw(at: NSPoint(x: max(118, 18 + directive.size().width), y: rowRect.minY + 7))
        }

        NSColor.separatorColor.setStroke()
        background.lineWidth = 1
        background.stroke()
    }
}
