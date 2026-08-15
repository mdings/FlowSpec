import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let flowSpec = UTType(
        exportedAs: "com.maartendings.flowspec",
        conformingTo: .plainText
    )
}

struct FlowSpecDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.flowSpec] }
    static var writableContentTypes: [UTType] { [.flowSpec] }

    var text: String

    init(text: String = FlowSpecDocument.starterText) {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        guard let decoded = String(data: data, encoding: .utf8) else {
            throw CocoaError(.fileReadInapplicableStringEncoding)
        }
        text = decoded
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        guard let data = text.data(using: .utf8) else {
            throw CocoaError(.fileWriteInapplicableStringEncoding)
        }
        return FileWrapper(regularFileWithContents: data)
    }

    private static let starterText = """
    # A small FlowSpec example
    Flow Home
    Id home.main

      Entry App launch

      Screen Home
      Id home.screen

        Shows
          Time-of-day greeting in Greeting
          Recommended cards in Recommendations

        Layout
          Greeting
          Recommendations

        Section Greeting
        Section Recommendations

        When the user opens a card
          Go to detail.screen

      Screen Detail
      Id detail.screen

        Shows
          Selected card
    """
}
