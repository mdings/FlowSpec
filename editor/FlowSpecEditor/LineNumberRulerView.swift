import AppKit

final class LineNumberRulerView: NSRulerView {
    private weak var textView: NSTextView?
    private let padding: CGFloat = 8

    init(textView: NSTextView) {
        self.textView = textView
        super.init(scrollView: textView.enclosingScrollView, orientation: .verticalRuler)
        clientView = textView
        ruleThickness = 48

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(textDidChange),
            name: NSText.didChangeNotification,
            object: textView
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(boundsDidChange),
            name: NSView.boundsDidChangeNotification,
            object: textView.enclosingScrollView?.contentView
        )
        textView.enclosingScrollView?.contentView.postsBoundsChangedNotifications = true
    }

    required init(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func textDidChange() {
        needsDisplay = true
    }

    @objc private func boundsDidChange() {
        needsDisplay = true
    }

    override func drawHashMarksAndLabels(in rect: NSRect) {
        guard let textView,
              let layoutManager = textView.layoutManager,
              let textContainer = textView.textContainer else { return }

        NSColor.controlBackgroundColor.setFill()
        let gutterRect = NSRect(
            x: bounds.minX,
            y: rect.minY,
            width: min(ruleThickness, bounds.width),
            height: rect.height
        ).intersection(bounds)
        gutterRect.fill()

        NSColor.separatorColor.setFill()
        NSRect(x: ruleThickness - 1, y: gutterRect.minY, width: 1, height: gutterRect.height).fill()

        let visibleRect = scrollView?.contentView.bounds ?? textView.visibleRect
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular),
            .foregroundColor: NSColor.tertiaryLabelColor
        ]
        if textView.string.isEmpty {
            let label = "1" as NSString
            let size = label.size(withAttributes: attributes)
            label.draw(
                at: NSPoint(x: ruleThickness - padding - size.width, y: textView.textContainerInset.height),
                withAttributes: attributes
            )
            return
        }

        let visibleGlyphRange = layoutManager.glyphRange(forBoundingRect: visibleRect, in: textContainer)
        let source = textView.string as NSString
        var lineNumber = 1
        if visibleGlyphRange.location > 0 {
            let characterIndex = layoutManager.characterIndexForGlyph(at: visibleGlyphRange.location)
            lineNumber = source.substring(to: min(characterIndex, source.length)).reduce(1) { count, character in
                character == "\n" ? count + 1 : count
            }
        }

        let characterRange = layoutManager.characterRange(forGlyphRange: visibleGlyphRange, actualGlyphRange: nil)
        var index = characterRange.location
        while index <= NSMaxRange(characterRange), index <= source.length {
            let lineRange = source.lineRange(for: NSRange(location: index, length: 0))
            let glyphIndex = layoutManager.glyphIndexForCharacter(at: min(lineRange.location, max(0, source.length - 1)))
            var lineRect = layoutManager.lineFragmentRect(forGlyphAt: glyphIndex, effectiveRange: nil)
            lineRect.origin.y += textView.textContainerOrigin.y - visibleRect.origin.y

            let label = "\(lineNumber)" as NSString
            let size = label.size(withAttributes: attributes)
            label.draw(
                at: NSPoint(x: ruleThickness - padding - size.width, y: lineRect.minY + 1),
                withAttributes: attributes
            )

            if NSMaxRange(lineRange) <= index { break }
            index = NSMaxRange(lineRange)
            lineNumber += 1
            if index >= source.length { break }
        }
    }
}
