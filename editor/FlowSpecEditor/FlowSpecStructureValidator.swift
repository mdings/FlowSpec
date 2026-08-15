import AppKit
import JavaScriptCore

struct FlowSpecStructureDiagnostic {
    enum Severity {
        case error
        case warning
    }

    let range: NSRange
    let message: String
    let severity: Severity
}

struct FlowSpecSourceFile {
    let url: URL
    let source: String
}

struct FlowSpecGoToDestination {
    let fileURL: URL
    let declarationRange: NSRange
}

struct FlowSpecGoToIncomingReference: Equatable {
    let filePath: String
    let line: Int
    let statement: String
    let ref: String
    let container: String

    var fileName: String {
        let name = URL(fileURLWithPath: filePath).lastPathComponent
        return name.isEmpty ? filePath : name
    }

    var fileURL: URL {
        URL(fileURLWithPath: filePath)
    }
}

struct FlowSpecTextReplacement {
    let fileURL: URL
    let range: NSRange
    let newText: String
}

struct FlowSpecLinkedSourceChange {
    let url: URL
    let oldText: String
    let newText: String
}

struct FlowSpecGoToTargetMark: Equatable {
    let range: NSRange
    let incoming: [FlowSpecGoToIncomingReference]

    var hasIncomingReferences: Bool { !incoming.isEmpty }

    var referenceCountLabel: String {
        incoming.count == 1 ? "Referenced by 1" : "Referenced by \(incoming.count)"
    }

    var annotationText: String {
        "← \(referenceCountLabel)"
    }

    var sortedIncoming: [FlowSpecGoToIncomingReference] {
        incoming.sorted { lhs, rhs in
            let fileOrder = lhs.fileName.localizedStandardCompare(rhs.fileName)
            if fileOrder != .orderedSame {
                return fileOrder == .orderedAscending
            }
            if lhs.line != rhs.line {
                return lhs.line < rhs.line
            }
            return lhs.statement.localizedStandardCompare(rhs.statement) == .orderedAscending
        }
    }
}

final class FlowSpecGoToTargetAttribute: NSObject {
    let incoming: [FlowSpecGoToIncomingReference]

    init(incoming: [FlowSpecGoToIncomingReference]) {
        self.incoming = incoming
    }
}

struct FlowSpecSyntaxHighlight {
    enum Category {
        case structural
        case section
        case control
        case comment
    }

    let range: NSRange
    let category: Category
}

/// Runs the canonical FlowSpec core bundled directly from the repository's lib directory.
/// Linting, highlighting, and authoring guidance therefore use the same language definition.
enum FlowSpecStructureValidator {
    private static let runtime = FlowSpecLinterRuntime()

    static func validate(_ source: String) -> [FlowSpecStructureDiagnostic] {
        runtime.validate(source)
    }

    static func validate(
        _ files: [FlowSpecSourceFile],
        currentFileURL: URL
    ) -> [FlowSpecStructureDiagnostic] {
        runtime.validate(files, currentFileURL: currentFileURL)
    }

    static func resolveGoTo(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL,
        characterIndex: Int
    ) -> [FlowSpecGoToDestination] {
        runtime.resolveGoTo(
            in: files,
            currentFileURL: currentFileURL,
            characterIndex: characterIndex
        )
    }

    static func resolvedGoToRanges(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL
    ) -> [NSRange] {
        runtime.resolvedGoToRanges(in: files, currentFileURL: currentFileURL)
    }

    static func goToDestinations(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL
    ) -> [FlowSpecGoToTargetMark] {
        runtime.goToDestinations(in: files, currentFileURL: currentFileURL)
    }

    static func linkedRenameReplacements(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL,
        editedRange: NSRange,
        replacement: String
    ) -> (currentFile: [FlowSpecTextReplacement], otherFiles: [FlowSpecTextReplacement]) {
        runtime.linkedRenameReplacements(
            in: files,
            currentFileURL: currentFileURL,
            editedRange: editedRange,
            replacement: replacement
        )
    }

    static func groupedSourceChanges(
        _ replacements: [FlowSpecTextReplacement],
        files: [FlowSpecSourceFile]
    ) -> [FlowSpecLinkedSourceChange] {
        let filesByURL = Dictionary(uniqueKeysWithValues: files.map { ($0.url, $0) })
        let grouped = Dictionary(grouping: replacements, by: \.fileURL)
        return grouped.compactMap { url, edits in
            guard let file = filesByURL[url] else { return nil }
            let newText = applying(edits, to: file.source)
            guard newText != file.source else { return nil }
            return FlowSpecLinkedSourceChange(url: url, oldText: file.source, newText: newText)
        }
    }

    private static func applying(_ replacements: [FlowSpecTextReplacement], to source: String) -> String {
        var result = source as NSString
        let ordered = replacements.sorted { $0.range.location > $1.range.location }
        for replacement in ordered {
            guard NSMaxRange(replacement.range) <= result.length else { continue }
            result = result.replacingCharacters(
                in: replacement.range,
                with: replacement.newText
            ) as NSString
        }
        return result as String
    }

    static func syntaxHighlights(in source: String) -> [FlowSpecSyntaxHighlight] {
        runtime.syntaxHighlights(in: source)
    }

    static var authoringGuide: String { runtime.authoringGuide }

    static func navigationRange(
        for reference: FlowSpecGoToIncomingReference,
        in source: String
    ) -> NSRange? {
        let mapper = SourceLocationMapper(source: source)
        guard let lineRange = mapper.lineRange(line: reference.line) else {
            return mapper.displayRange(line: reference.line, column: 1)
        }
        let lineText = (source as NSString).substring(with: lineRange)
        if !reference.statement.isEmpty,
           let statementRange = lineText.range(of: reference.statement) {
            let location = lineRange.location + statementRange.lowerBound.utf16Offset(in: lineText)
            return NSRange(location: location, length: reference.statement.utf16.count)
        }
        return mapper.displayRange(line: reference.line, column: 1)
            ?? NSRange(location: lineRange.location, length: max(1, lineRange.length))
    }

    static func structuralNodeRange(containing location: Int, in source: String) -> NSRange {
        let ns = source as NSString
        guard ns.length > 0 else { return NSRange(location: 0, length: 0) }
        let index = min(max(0, location), ns.length - 1)
        let declarationLine = ns.lineRange(for: NSRange(location: index, length: 0))
        let declarationIndent = leadingIndentWidth(in: ns, lineRange: declarationLine)
        var end = NSMaxRange(declarationLine)
        var cursor = end
        while cursor < ns.length {
            let line = ns.lineRange(for: NSRange(location: cursor, length: 0))
            let content = ns.substring(with: line).trimmingCharacters(in: .whitespacesAndNewlines)
            if !content.isEmpty {
                let indent = leadingIndentWidth(in: ns, lineRange: line)
                if indent <= declarationIndent { break }
            }
            end = NSMaxRange(line)
            if NSMaxRange(line) <= cursor { break }
            cursor = NSMaxRange(line)
        }
        return NSRange(location: declarationLine.location, length: end - declarationLine.location)
    }

    private static func leadingIndentWidth(in source: NSString, lineRange: NSRange) -> Int {
        var width = 0
        var index = lineRange.location
        let end = NSMaxRange(lineRange)
        while index < end {
            let character = source.character(at: index)
            if character == 32 {
                width += 1
            } else if character == 9 {
                width += 2
            } else {
                break
            }
            index += 1
        }
        return width
    }
}

private final class FlowSpecLinterRuntime {
    private let context: JSContext?
    private let lintFunction: JSValue?
    private let lintProjectFunction: JSValue?
    private let resolveGoToFunction: JSValue?
    private let resolvedGoToRangesFunction: JSValue?
    private let referencedGoToDestinationsFunction: JSValue?
    private let renameGoToReferencesFunction: JSValue?
    private let syntaxHighlightsFunction: JSValue?
    private let authoringGuideFunction: JSValue?

    init() {
        guard let context = JSContext() else {
            self.context = nil
            self.lintFunction = nil
            self.lintProjectFunction = nil
            self.resolveGoToFunction = nil
            self.resolvedGoToRangesFunction = nil
            self.referencedGoToDestinationsFunction = nil
            self.renameGoToReferencesFunction = nil
            self.syntaxHighlightsFunction = nil
            self.authoringGuideFunction = nil
            return
        }

        var moduleSources: [String: String] = [:]
        for module in ["language", "constants", "diagnostics", "parse", "goto", "lint"] {
            guard let url = Bundle.main.url(forResource: module, withExtension: "js"),
                  let source = try? String(contentsOf: url, encoding: .utf8) else {
                continue
            }
            moduleSources[module] = source
        }

        let sourceProvider: @convention(block) (String) -> String = { moduleName in
            moduleSources[moduleName] ?? ""
        }
        context.setObject(
            sourceProvider,
            forKeyedSubscript: "__flowSpecModuleSource" as NSString
        )

        context.exceptionHandler = { _, exception in
            if let exception {
                NSLog("FlowSpec linter: %@", exception.toString() ?? "Unknown JavaScript error")
            }
        }

        context.evaluateScript(
            #"""
            const __flowSpecModules = Object.create(null);
            function require(request) {
              const name = request.replace(/^\.\//, "").replace(/\.js$/, "");
              if (__flowSpecModules[name]) return __flowSpecModules[name].exports;
              const source = __flowSpecModuleSource(name);
              if (!source) throw new Error("Missing bundled FlowSpec module: " + name);
              const module = { exports: {} };
              __flowSpecModules[name] = module;
              const load = new Function("require", "module", "exports", source + "\n//# sourceURL=" + name + ".js");
              load(require, module, module.exports);
              return module.exports;
            }
            """#
        )

        self.context = context
        let lintModule = context
            .objectForKeyedSubscript("require")?
            .call(withArguments: ["lint"])
        self.lintFunction = lintModule?.objectForKeyedSubscript("lintFlowSpecFile")
        self.lintProjectFunction = lintModule?.objectForKeyedSubscript("lintFlowSpecProject")
        self.resolveGoToFunction = context.evaluateScript(
            #"""
            (function(files, position) {
              return require("goto").resolveGoToDefinitions(files, position);
            })
            """#
        )
        self.resolvedGoToRangesFunction = context.evaluateScript(
            #"""
            (function(files, filePath) {
              const { parseTree, walkNodes } = require("parse");
              const {
                collectStructuralTargets,
                getGoToTargetRange,
                matchGoToTargets,
              } = require("goto");

              const targets = [];
              let currentTree = null;
              for (const file of files) {
                const parsed = parseTree(file.source, file.filePath);
                collectStructuralTargets(parsed.root, file.filePath, targets);
                if (file.filePath === filePath) currentTree = parsed;
              }
              if (!currentTree) return [];

              const ranges = [];
              walkNodes(currentTree.root, (node) => {
                if (node.type !== "goTo") return;
                const ref = String(node.value || "").trim();
                const range = getGoToTargetRange(
                  currentTree.lines[node.location.line - 1] || "",
                  ref
                );
                if (!range || matchGoToTargets(ref, targets).length !== 1) return;
                ranges.push({
                  line: node.location.line,
                  startColumn: range.startColumn,
                  endColumn: range.endColumn,
                });
              });
              return ranges;
            })
            """#
        )
        self.referencedGoToDestinationsFunction = context.evaluateScript(
            #"""
            (function(files, filePath) {
              const goto = require("goto");
              const { parseTree } = require("parse");
              const referenced = goto.referencedGoToDestinations(files, filePath);
              const referencedKeys = new Set(
                referenced.map((destination) => `${destination.line}:${destination.column}`)
              );
              const targets = [];
              for (const file of files) {
                const parsed = parseTree(file.source, file.filePath);
                goto.collectStructuralTargets(parsed.root, file.filePath, targets);
              }
              const extras = [];
              for (const target of targets) {
                if (target.filePath !== filePath) continue;
                const key = `${target.line}:${target.column}`;
                if (referencedKeys.has(key)) continue;
                extras.push({
                  line: target.line,
                  column: target.column,
                  endLine: target.endLine ?? target.line,
                  endColumn: target.endColumn ?? target.column,
                  references: [],
                });
              }
              return referenced.concat(extras);
            })
            """#
        )
        self.renameGoToReferencesFunction = context.evaluateScript(
            #"""
            (function(files, edit) {
              return require("goto").renameGoToReferences(files, edit);
            })
            """#
        )
        self.syntaxHighlightsFunction = context.evaluateScript(
            #"(function(source) { return require("language").syntaxHighlights(source); })"#
        )
        self.authoringGuideFunction = context.evaluateScript(
            #"(function() { return require("language").authoringGuide(); })"#
        )
    }

    func validate(_ source: String) -> [FlowSpecStructureDiagnostic] {
        guard let lintFunction,
              let rawValue = lintFunction.call(withArguments: [source, "document.flowspec"]),
              !rawValue.isUndefined,
              !rawValue.isNull,
              let rawDiagnostics = rawValue.toArray() as? [[String: Any]] else {
            return []
        }

        return mapDiagnostics(rawDiagnostics, source: source)
    }

    func validate(
        _ files: [FlowSpecSourceFile],
        currentFileURL: URL
    ) -> [FlowSpecStructureDiagnostic] {
        guard let currentFile = files.first(where: { $0.url == currentFileURL }),
              let lintProjectFunction else {
            return []
        }
        let fileArguments: [[String: Any]] = files.map {
            ["source": $0.source, "filePath": $0.url.path]
        }
        guard let rawValue = lintProjectFunction.call(withArguments: [fileArguments]),
              !rawValue.isUndefined,
              !rawValue.isNull,
              let rawDiagnostics = rawValue.toArray() as? [[String: Any]] else {
            return []
        }

        return mapDiagnostics(
            rawDiagnostics.filter { ($0["filePath"] as? String) == currentFileURL.path },
            source: currentFile.source
        )
    }

    private func mapDiagnostics(
        _ rawDiagnostics: [[String: Any]],
        source: String
    ) -> [FlowSpecStructureDiagnostic] {
        let mapper = SourceLocationMapper(source: source)
        return rawDiagnostics.compactMap { diagnostic in
            guard let line = diagnostic["line"] as? Int,
                  let column = diagnostic["column"] as? Int,
                  let message = diagnostic["message"] as? String,
                  let range = mapper.displayRange(line: line, column: column) else {
                return nil
            }

            let suggestion = diagnostic["suggestion"] as? String
            let friendlyMessage: String
            if let suggestion, !suggestion.isEmpty {
                friendlyMessage = message + "\n\n" + suggestion
            } else {
                friendlyMessage = message
            }

            return FlowSpecStructureDiagnostic(
                range: range,
                message: friendlyMessage,
                severity: (diagnostic["severity"] as? String) == "warning" ? .warning : .error
            )
        }
    }

    func resolveGoTo(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL,
        characterIndex: Int
    ) -> [FlowSpecGoToDestination] {
        guard let currentFile = files.first(where: { $0.url == currentFileURL }),
              let position = SourceLocationMapper(source: currentFile.source)
                .position(at: characterIndex),
              let resolveGoToFunction else {
            return []
        }

        let fileArguments: [[String: Any]] = files.map {
            ["source": $0.source, "filePath": $0.url.path]
        }
        let positionArgument: [String: Any] = [
            "filePath": currentFileURL.path,
            "line": position.line,
            "column": position.column
        ]

        guard let result = resolveGoToFunction.call(withArguments: [fileArguments, positionArgument]),
              !result.isUndefined,
              !result.isNull,
              let dictionary = result.toDictionary() as? [String: Any],
              let definitions = dictionary["definitions"] as? [[String: Any]] else {
            return []
        }

        let filesByPath = Dictionary(uniqueKeysWithValues: files.map { ($0.url.path, $0) })
        return definitions.compactMap { definition in
            guard let filePath = definition["filePath"] as? String,
                  let file = filesByPath[filePath],
                  let line = definition["line"] as? Int,
                  let column = definition["column"] as? Int,
                  let endLine = definition["endLine"] as? Int,
                  let endColumn = definition["endColumn"] as? Int,
                  let range = SourceLocationMapper(source: file.source).range(
                    line: line,
                    column: column,
                    endLine: endLine,
                    endColumn: endColumn
                  ) else {
                return nil
            }
            return FlowSpecGoToDestination(fileURL: file.url, declarationRange: range)
        }
    }

    func resolvedGoToRanges(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL
    ) -> [NSRange] {
        guard let currentFile = files.first(where: { $0.url == currentFileURL }),
              let resolvedGoToRangesFunction else {
            return []
        }
        let fileArguments: [[String: Any]] = files.map {
            ["source": $0.source, "filePath": $0.url.path]
        }
        guard let rawValue = resolvedGoToRangesFunction.call(
            withArguments: [fileArguments, currentFileURL.path]
        ),
        !rawValue.isUndefined,
        !rawValue.isNull,
        let rawRanges = rawValue.toArray() as? [[String: Any]] else {
            return []
        }

        let mapper = SourceLocationMapper(source: currentFile.source)
        return rawRanges.compactMap { rawRange in
            guard let line = rawRange["line"] as? Int,
                  let startColumn = rawRange["startColumn"] as? Int,
                  let endColumn = rawRange["endColumn"] as? Int else {
                return nil
            }
            return mapper.range(
                line: line,
                column: startColumn,
                endLine: line,
                endColumn: endColumn
            )
        }
    }

    func goToDestinations(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL
    ) -> [FlowSpecGoToTargetMark] {
        guard let currentFile = files.first(where: { $0.url == currentFileURL }),
              let referencedGoToDestinationsFunction else {
            return []
        }
        let fileArguments: [[String: Any]] = files.map {
            ["source": $0.source, "filePath": $0.url.path]
        }
        guard let rawValue = referencedGoToDestinationsFunction.call(
            withArguments: [fileArguments, currentFileURL.path]
        ),
        !rawValue.isUndefined,
        !rawValue.isNull,
        let rawDestinations = rawValue.toArray() as? [[String: Any]] else {
            return []
        }

        let mapper = SourceLocationMapper(source: currentFile.source)
        return rawDestinations.compactMap { rawDestination in
            guard let line = intValue(rawDestination["line"]),
                  let column = intValue(rawDestination["column"]),
                  let endLine = intValue(rawDestination["endLine"]),
                  let endColumn = intValue(rawDestination["endColumn"]),
                  let range = mapper.range(
                    line: line,
                    column: column,
                    endLine: endLine,
                    endColumn: endColumn
                  ) else {
                return nil
            }
            let incoming = (rawDestination["references"] as? [[String: Any]] ?? []).compactMap {
                reference -> FlowSpecGoToIncomingReference? in
                guard let filePath = reference["filePath"] as? String,
                      let referenceLine = intValue(reference["line"]),
                      let statement = reference["statement"] as? String else {
                    return nil
                }
                return FlowSpecGoToIncomingReference(
                    filePath: filePath,
                    line: referenceLine,
                    statement: statement,
                    ref: (reference["ref"] as? String) ?? "",
                    container: (reference["container"] as? String) ?? ""
                )
            }
            return FlowSpecGoToTargetMark(range: range, incoming: incoming)
        }
    }

    func linkedRenameReplacements(
        in files: [FlowSpecSourceFile],
        currentFileURL: URL,
        editedRange: NSRange,
        replacement: String
    ) -> (currentFile: [FlowSpecTextReplacement], otherFiles: [FlowSpecTextReplacement]) {
        let empty: ([FlowSpecTextReplacement], [FlowSpecTextReplacement]) = ([], [])
        guard let currentFile = files.first(where: { $0.url == currentFileURL }),
              let renameGoToReferencesFunction else {
            return empty
        }

        let mapper = SourceLocationMapper(source: currentFile.source)
        guard let start = mapper.position(at: editedRange.location),
              let end = mapper.position(at: NSMaxRange(editedRange)),
              start.line == end.line else {
            return empty
        }

        let fileArguments: [[String: Any]] = files.map {
            ["source": $0.source, "filePath": $0.url.path]
        }
        let editArgument: [String: Any] = [
            "filePath": currentFileURL.path,
            "line": start.line,
            "startColumn": start.column,
            "endColumn": end.column,
            "replacementText": replacement
        ]

        guard let result = renameGoToReferencesFunction.call(
            withArguments: [fileArguments, editArgument]
        ),
        !result.isUndefined,
        !result.isNull,
        let dictionary = result.toDictionary() as? [String: Any],
        let rawEdits = dictionary["edits"] as? [[String: Any]] else {
            return empty
        }

        let filesByPath = Dictionary(uniqueKeysWithValues: files.map { ($0.url.path, $0) })
        var currentFileEdits: [FlowSpecTextReplacement] = []
        var otherFileEdits: [FlowSpecTextReplacement] = []

        for rawEdit in rawEdits {
            guard let filePath = rawEdit["filePath"] as? String,
                  let file = filesByPath[filePath],
                  let line = intValue(rawEdit["line"]),
                  let startColumn = intValue(rawEdit["startColumn"]),
                  let endColumn = intValue(rawEdit["endColumn"]),
                  let newText = rawEdit["newText"] as? String,
                  let range = SourceLocationMapper(source: file.source).range(
                    line: line,
                    column: startColumn,
                    endLine: line,
                    endColumn: endColumn
                  ) else {
                continue
            }
            let edit = FlowSpecTextReplacement(
                fileURL: file.url,
                range: range,
                newText: newText
            )
            if file.url == currentFileURL {
                currentFileEdits.append(edit)
            } else {
                otherFileEdits.append(edit)
            }
        }

        return (currentFileEdits, otherFileEdits)
    }

    private func intValue(_ value: Any?) -> Int? {
        if let int = value as? Int { return int }
        if let number = value as? NSNumber { return number.intValue }
        return nil
    }

    func syntaxHighlights(in source: String) -> [FlowSpecSyntaxHighlight] {
        guard let rawValue = syntaxHighlightsFunction?.call(withArguments: [source]),
              !rawValue.isUndefined,
              !rawValue.isNull,
              let highlights = rawValue.toArray() as? [[String: Any]] else {
            return []
        }
        let sourceLength = (source as NSString).length
        return highlights.compactMap { highlight in
            guard let location = highlight["location"] as? Int,
                  let length = highlight["length"] as? Int,
                  let rawCategory = highlight["category"] as? String,
                  location >= 0,
                  length > 0,
                  location + length <= sourceLength else {
                return nil
            }
            let category: FlowSpecSyntaxHighlight.Category
            switch rawCategory {
            case "structural": category = .structural
            case "section": category = .section
            case "control": category = .control
            case "comment": category = .comment
            default: return nil
            }
            return FlowSpecSyntaxHighlight(
                range: NSRange(location: location, length: length),
                category: category
            )
        }
    }

    var authoringGuide: String {
        guard let value = authoringGuideFunction?.call(withArguments: []),
              !value.isUndefined,
              !value.isNull else {
            return "FlowSpec is a human-readable behavioral specification. Return valid FlowSpec only."
        }
        return value.toString()
    }
}

private struct SourceLocationMapper {
    private let source: NSString
    private let lineStarts: [Int]

    init(source: String) {
        self.source = source as NSString
        var starts = [0]
        for index in 0..<self.source.length where self.source.character(at: index) == 10 {
            starts.append(index + 1)
        }
        lineStarts = starts
    }

    func lineRange(line: Int) -> NSRange? {
        guard line > 0, line <= lineStarts.count else { return nil }
        let lineStart = lineStarts[line - 1]
        let nextLineStart = line < lineStarts.count ? lineStarts[line] : source.length
        return NSRange(location: lineStart, length: max(0, nextLineStart - lineStart))
    }

    func displayRange(line: Int, column: Int) -> NSRange? {
        guard line > 0, line <= lineStarts.count else { return nil }
        let lineStart = lineStarts[line - 1]
        let nextLineStart = line < lineStarts.count ? lineStarts[line] : source.length
        let lineEnd = max(lineStart, nextLineStart - (line < lineStarts.count ? 1 : 0))
        guard lineStart <= lineEnd else { return nil }

        var location = min(lineEnd, lineStart + max(0, column - 1))
        while location < lineEnd {
            let character = source.character(at: location)
            if character != 32 && character != 9 { break }
            location += 1
        }
        guard location < source.length else {
            return NSRange(location: max(0, min(location, source.length - 1)), length: source.length > 0 ? 1 : 0)
        }

        let remaining = source.substring(with: NSRange(location: location, length: lineEnd - location))
        let directivePattern = #"^(At the same time|Otherwise|Receives|Outcome|Section|Screen|Layout|Action|Rules|Steps|Shows|Uses|Flow|Once|When|Go to|If|Id)(?=\s|:|$)"#
        if let directiveRange = remaining.range(of: directivePattern, options: .regularExpression) {
            return NSRange(
                location: location + directiveRange.lowerBound.utf16Offset(in: remaining),
                length: remaining[directiveRange].utf16.count
            )
        }

        var end = location
        while end < lineEnd {
            let character = source.character(at: end)
            if character == 32 || character == 9 { break }
            end += 1
        }
        return NSRange(location: location, length: max(1, end - location))
    }

    func position(at characterIndex: Int) -> (line: Int, column: Int)? {
        guard characterIndex >= 0, characterIndex <= source.length else { return nil }
        guard let lineIndex = lineStarts.lastIndex(where: { $0 <= characterIndex }) else {
            return nil
        }
        return (
            line: lineIndex + 1,
            column: characterIndex - lineStarts[lineIndex] + 1
        )
    }

    func range(
        line: Int,
        column: Int,
        endLine: Int,
        endColumn: Int
    ) -> NSRange? {
        guard line > 0,
              endLine > 0,
              line <= lineStarts.count,
              endLine <= lineStarts.count else {
            return nil
        }

        let start = lineStarts[line - 1] + max(0, column - 1)
        let end = lineStarts[endLine - 1] + max(0, endColumn - 1)
        guard start <= source.length, end >= start else { return nil }
        return NSRange(location: start, length: min(source.length, end) - start)
    }
}
