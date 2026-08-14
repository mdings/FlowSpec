import AppKit
import SwiftUI

/// Plain AppKit-drawn title for use in the toolbar principal slot (no SwiftUI pill).
struct FlowSpecTitleToolbarItem: NSViewRepresentable {
    let title: String
    var files: [URL]?
    var dirtyURLs: Set<URL> = []
    var onSelect: ((URL) -> Void)?

    func makeNSView(context: Context) -> FlowSpecTitlebarTitleView {
        FlowSpecTitlebarTitleView()
    }

    func updateNSView(_ view: FlowSpecTitlebarTitleView, context: Context) {
        view.title = title
        view.showsMenuChevron = files != nil

        if let files, let onSelect, !files.isEmpty {
            let target = context.coordinator.menuTarget ?? FlowSpecTitleMenuTarget(onSelect: onSelect)
            context.coordinator.menuTarget = target
            let popupMenu = NSMenu()
            for url in files {
                let label = dirtyURLs.contains(url)
                    ? "\(url.lastPathComponent) •"
                    : url.lastPathComponent
                let item = NSMenuItem(
                    title: label,
                    action: #selector(FlowSpecTitleMenuTarget.pick(_:)),
                    keyEquivalent: ""
                )
                item.target = target
                item.representedObject = url
                popupMenu.addItem(item)
            }
            view.popupMenu = popupMenu
        } else {
            context.coordinator.menuTarget = nil
            view.popupMenu = nil
        }

        view.invalidateIntrinsicContentSize()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect)
    }

    final class Coordinator {
        var menuTarget: FlowSpecTitleMenuTarget?
        let onSelect: ((URL) -> Void)?

        init(onSelect: ((URL) -> Void)?) {
            self.onSelect = onSelect
            if let onSelect {
                menuTarget = FlowSpecTitleMenuTarget(onSelect: onSelect)
            }
        }
    }
}

final class FlowSpecTitlebarTitleView: NSView {
    static let titleHeight: CGFloat = 22

    var title = "" {
        didSet {
            needsDisplay = true
            invalidateIntrinsicContentSize()
        }
    }

    var showsMenuChevron = false {
        didSet {
            needsDisplay = true
            invalidateIntrinsicContentSize()
        }
    }

    var popupMenu: NSMenu?

    private let titleFont = NSFont.systemFont(ofSize: 13)

    override var intrinsicContentSize: NSSize {
        let titleSize = (title as NSString).size(withAttributes: [.font: titleFont])
        let chevronSpace: CGFloat = showsMenuChevron ? 14 : 0
        return NSSize(width: titleSize.width + chevronSpace, height: Self.titleHeight)
    }

    override func draw(_ dirtyRect: NSRect) {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: titleFont,
            .foregroundColor: NSColor.secondaryLabelColor,
        ]
        let titleSize = (title as NSString).size(withAttributes: attrs)
        let y = floor((Self.titleHeight - titleSize.height) / 2)
        (title as NSString).draw(at: NSPoint(x: 0, y: y), withAttributes: attrs)

        guard showsMenuChevron,
              let image = NSImage(
                systemSymbolName: "chevron.up.chevron.down",
                accessibilityDescription: "Choose file"
              ) else {
            return
        }

        let config = NSImage.SymbolConfiguration(pointSize: 8, weight: .bold)
        let icon = (image.withSymbolConfiguration(config) ?? image)
        icon.isTemplate = true
        let iconSize = NSSize(width: 10, height: 10)
        let iconRect = NSRect(
            x: titleSize.width + 4,
            y: floor((Self.titleHeight - iconSize.height) / 2),
            width: iconSize.width,
            height: iconSize.height
        )
        NSColor.tertiaryLabelColor.set()
        icon.draw(in: iconRect)
    }

    override func mouseDown(with event: NSEvent) {
        guard let popupMenu else { return }
        popupMenu.popUp(
            positioning: nil,
            at: NSPoint(x: bounds.midX, y: bounds.minY - 4),
            in: self
        )
    }

    override func resetCursorRects() {
        super.resetCursorRects()
        if popupMenu != nil {
            addCursorRect(bounds, cursor: .pointingHand)
        } else {
            addCursorRect(bounds, cursor: .arrow)
        }
    }
}

final class FlowSpecTitleMenuTarget: NSObject {
    let onSelect: (URL) -> Void

    init(onSelect: @escaping (URL) -> Void) {
        self.onSelect = onSelect
    }

    @objc func pick(_ sender: NSMenuItem) {
        guard let url = sender.representedObject as? URL else { return }
        onSelect(url)
    }
}
