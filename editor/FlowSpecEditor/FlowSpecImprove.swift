import Foundation
import FoundationModels

@Generable(description: "An improved FlowSpec document and a short change summary.")
struct FlowSpecImprovement {
    @Guide(description: "The full improved FlowSpec source. Preserve comments when useful. Do not wrap in markdown fences.")
    var improvedSource: String

    @Guide(description: "One or two sentences describing the main improvements.")
    var summary: String
}

struct FlowSpecImproveResult {
    var improvedSource: String
    var summary: String
}

enum FlowSpecImproveError: LocalizedError {
    case emptySource
    case appleIntelligenceUnavailable(String)
    case emptyResult
    case underlying(String)

    var errorDescription: String? {
        switch self {
        case .emptySource:
            return "There is no FlowSpec text to improve."
        case .appleIntelligenceUnavailable(let message):
            return message
        case .emptyResult:
            return "The model returned an empty result."
        case .underlying(let message):
            return message
        }
    }
}

enum FlowSpecImprove {
    /// Loaded from the same bundled core used by the parser and linter.
    static var documentationGuide: String { FlowSpecStructureValidator.authoringGuide }

    static func availabilityMessage() -> String? {
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:
            return nil
        case .unavailable(.deviceNotEligible):
            return "Apple Intelligence is not available on this Mac."
        case .unavailable(.appleIntelligenceNotEnabled):
            return "Turn on Apple Intelligence in System Settings to use Improve."
        case .unavailable(.modelNotReady):
            return "The on-device model is still downloading or not ready. Try again shortly."
        case .unavailable:
            return "Apple Intelligence is currently unavailable."
        }
    }

    static func improve(
        source: String,
        diagnostics: [FlowSpecStructureDiagnostic] = []
    ) async throws -> FlowSpecImproveResult {
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw FlowSpecImproveError.emptySource }

        if let message = availabilityMessage() {
            throw FlowSpecImproveError.appleIntelligenceUnavailable(message)
        }

        let diagnosticNotes: String
        if diagnostics.isEmpty {
            diagnosticNotes = "No current diagnostics."
        } else {
            diagnosticNotes = diagnostics.map { diagnostic in
                let kind = diagnostic.severity == .warning ? "warning" : "error"
                return "- [\(kind)] \(diagnostic.message)"
            }.joined(separator: "\n")
        }

        let session = LanguageModelSession {
            """
            You improve FlowSpec documents using only Apple's on-device foundation model.
            Follow the FlowSpec documentation strictly.

            \(documentationGuide)
            """
        }

        let options = GenerationOptions(
            sampling: .greedy,
            temperature: 0.2,
            maximumResponseTokens: 3200
        )

        do {
            let response = try await session.respond(
                generating: FlowSpecImprovement.self,
                options: options
            ) {
                """
                Improve this FlowSpec for clearer concepts and correct syntax.

                Current diagnostics:
                \(diagnosticNotes)

                Current FlowSpec:
                \(source)
                """
            }

            var improved = sanitize(response.content.improvedSource)
            guard !improved.isEmpty else { throw FlowSpecImproveError.emptyResult }

            if !improved.hasSuffix("\n") {
                improved += "\n"
            }

            let summary = response.content.summary.trimmingCharacters(in: .whitespacesAndNewlines)
            return FlowSpecImproveResult(
                improvedSource: improved,
                summary: summary.isEmpty ? "Improved FlowSpec concepts and syntax." : summary
            )
        } catch let error as FlowSpecImproveError {
            throw error
        } catch {
            throw FlowSpecImproveError.underlying(error.localizedDescription)
        }
    }

    private static func sanitize(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("```") {
            let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            if lines.count >= 2 {
                var body = Array(lines.dropFirst())
                if body.last?.hasPrefix("```") == true {
                    body.removeLast()
                }
                text = body.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        return text
    }
}
