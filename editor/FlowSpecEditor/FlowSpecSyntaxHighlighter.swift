import AppKit

extension NSAttributedString.Key {
    static let flowSpecDiagnostic = NSAttributedString.Key("FlowSpecDiagnosticMessage")
    static let flowSpecDiagnosticColor = NSAttributedString.Key("FlowSpecDiagnosticColor")
    static let flowSpecGoToLink = NSAttributedString.Key("FlowSpecGoToLink")
    static let flowSpecGoToTarget = NSAttributedString.Key("FlowSpecGoToTarget")
}

enum FlowSpecSyntaxHighlighter {
    static func apply(
        to textStorage: NSTextStorage,
        appearance: NSAppearance?,
        diagnostics suppliedDiagnostics: [FlowSpecStructureDiagnostic]? = nil,
        resolvedGoToRanges suppliedGoToRanges: [NSRange]? = nil,
        goToDestinations suppliedDestinations: [FlowSpecGoToTargetMark]? = nil,
        lineSpacing: CGFloat = FlowSpecLineSpacing.normal.points,
        fontSize: CGFloat = FlowSpecFontSize.medium.points
    ) {
        let fullRange = NSRange(location: 0, length: textStorage.length)
        guard fullRange.length > 0 else { return }

        let font = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
        let boldFont = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .semibold)
        let foreground = NSColor.labelColor
        let structuralColor = dynamicColor(light: .systemPurple, dark: .systemPurple)
        let sectionColor = dynamicColor(light: .systemBlue, dark: .systemTeal)
        let controlColor = dynamicColor(light: .systemOrange, dark: .systemOrange)
        let commentColor = NSColor.secondaryLabelColor

        textStorage.beginEditing()
        textStorage.setAttributes([
            .font: font,
            .foregroundColor: foreground,
            .paragraphStyle: baseParagraphStyle(lineSpacing: lineSpacing)
        ], range: fullRange)
        applyIndentationParagraphStyles(
            to: textStorage,
            font: font,
            lineSpacing: lineSpacing
        )

        let source = textStorage.string
        for highlight in FlowSpecStructureValidator.syntaxHighlights(in: source) {
            let color: NSColor
            switch highlight.category {
            case .structural: color = structuralColor
            case .section: color = sectionColor
            case .control: color = controlColor
            case .comment: color = commentColor
            }
            textStorage.addAttribute(.foregroundColor, value: color, range: highlight.range)
            if highlight.category != .comment {
                textStorage.addAttribute(.font, value: boldFont, range: highlight.range)
            }
        }
        let resolvedGoToRanges: [NSRange]
        if let suppliedGoToRanges {
            resolvedGoToRanges = suppliedGoToRanges
        } else {
            let fileURL = URL(fileURLWithPath: "/document.flowspec")
            resolvedGoToRanges = FlowSpecStructureValidator.resolvedGoToRanges(
                in: [FlowSpecSourceFile(url: fileURL, source: source)],
                currentFileURL: fileURL
            )
        }
        for range in resolvedGoToRanges where NSMaxRange(range) <= fullRange.length {
            textStorage.addAttributes([
                .flowSpecGoToLink: (source as NSString).substring(with: range),
                .foregroundColor: NSColor.linkColor,
                .underlineStyle: NSUnderlineStyle.single.rawValue
            ], range: range)
        }

        let goToDestinations: [FlowSpecGoToTargetMark]
        if let suppliedDestinations {
            goToDestinations = suppliedDestinations
        } else {
            let fileURL = URL(fileURLWithPath: "/document.flowspec")
            goToDestinations = FlowSpecStructureValidator.goToDestinations(
                in: [FlowSpecSourceFile(url: fileURL, source: source)],
                currentFileURL: fileURL
            )
        }
        let nsSource = source as NSString
        for destination in goToDestinations where NSMaxRange(destination.range) <= fullRange.length {
            guard let lastWord = lastWordRange(in: nsSource, containing: destination.range) else { continue }
            textStorage.addAttribute(
                .flowSpecGoToTarget,
                value: FlowSpecGoToTargetAttribute(incoming: destination.incoming),
                range: lastWord
            )
        }

        let diagnosticsByRange = Dictionary(
            grouping: suppliedDiagnostics ?? FlowSpecStructureValidator.validate(source),
            by: { "\($0.range.location):\($0.range.length)" }
        )
        for diagnostics in diagnosticsByRange.values {
            guard let first = diagnostics.first else { continue }
            let isWarning = diagnostics.allSatisfy { $0.severity == .warning }
            let messages = diagnostics.map(\.message).reduce(into: [String]()) { result, message in
                if !result.contains(message) { result.append(message) }
            }
            textStorage.addAttributes([
                .flowSpecDiagnosticColor: isWarning ? NSColor.systemOrange : NSColor.systemRed,
                .flowSpecDiagnostic: messages.joined(separator: "\n\n—\n\n")
            ], range: first.range)
        }
        textStorage.endEditing()
    }

    private static func baseParagraphStyle(lineSpacing: CGFloat) -> NSMutableParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = lineSpacing
        style.tabStops = []
        style.defaultTabInterval = 28
        style.lineBreakMode = .byWordWrapping
        return style
    }

    private static func applyIndentationParagraphStyles(
        to textStorage: NSTextStorage,
        font: NSFont,
        lineSpacing: CGFloat
    ) {
        let source = textStorage.string as NSString
        let spaceWidth = (" " as NSString).size(withAttributes: [.font: font]).width
        var location = 0

        while location < source.length {
            let lineRange = source.lineRange(for: NSRange(location: location, length: 0))
            var indentationWidth: CGFloat = 0
            var characterIndex = lineRange.location

            while characterIndex < NSMaxRange(lineRange) {
                switch source.character(at: characterIndex) {
                case 32:
                    indentationWidth += spaceWidth
                case 9:
                    indentationWidth += spaceWidth * 2
                default:
                    characterIndex = NSMaxRange(lineRange)
                    continue
                }
                characterIndex += 1
            }

            let style = baseParagraphStyle(lineSpacing: lineSpacing)
            style.firstLineHeadIndent = 0
            style.headIndent = indentationWidth
            textStorage.addAttribute(.paragraphStyle, value: style, range: lineRange)

            let nextLocation = NSMaxRange(lineRange)
            if nextLocation <= location { break }
            location = nextLocation
        }
    }

    private static func lastWordRange(in source: NSString, containing range: NSRange) -> NSRange? {
        let lineRange = source.lineRange(for: NSRange(location: min(range.location, max(0, source.length - 1)), length: 0))
        var end = NSMaxRange(lineRange)
        while end > lineRange.location {
            let character = source.character(at: end - 1)
            if character == 10 || character == 13 || character == 32 || character == 9 {
                end -= 1
            } else {
                break
            }
        }
        guard end > lineRange.location else { return nil }

        var start = end
        while start > lineRange.location {
            let character = source.character(at: start - 1)
            if character == 32 || character == 9 { break }
            start -= 1
        }
        return NSRange(location: start, length: end - start)
    }

    private static func dynamicColor(light: NSColor, dark: NSColor) -> NSColor {
        NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        }
    }
}
