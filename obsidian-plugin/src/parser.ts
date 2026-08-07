/**
 * Minimal FlowSpec parser for graph construction.
 * Recognizes only Flow, Screen, Action, Id, and Go to.
 */

import type {
	GoToReference,
	ParsedFlowSpecFile,
	StructuralDefinition,
	StructuralKind,
} from "./types";

const STRUCTURAL_RE = /^(Flow|Screen|Action)\b\s*:?\s*(.*)$/;
const ID_RE = /^(Id)\b\s*:?\s*(.*)$/;
const GO_TO_RE = /^(Go to)\b\s*:?\s*(.*)$/;

interface StackEntry {
	definition: StructuralDefinition;
	indentation: number;
}

function stripInlineComment(text: string): string {
	return String(text || "")
		.replace(/\s+#.*$/, "")
		.trim();
}

function indentWidth(indentText: string): number {
	let width = 0;
	for (const ch of indentText) {
		width += ch === "\t" ? 2 : 1;
	}
	return width;
}

/**
 * Parse a single .flowspec source into structural definitions and Go to refs.
 */
export function parseFlowSpecSource(
	source: string,
	filePath: string
): ParsedFlowSpecFile {
	const lines = String(source).split(/\r?\n/);
	const definitions: StructuralDefinition[] = [];
	const goTos: GoToReference[] = [];
	const stack: StackEntry[] = [];

	/** Most recent structural at a given indent, for same-indent Id association. */
	let lastStructural: StackEntry | null = null;

	for (let i = 0; i < lines.length; i++) {
		const lineNumber = i + 1;
		const raw = lines[i];
		const indentText = (raw.match(/^[ \t]*/) || [""])[0];
		const trimmed = raw.trim();

		if (!trimmed || trimmed.startsWith("#")) continue;

		const indentation = indentWidth(indentText);
		const column = indentation + 1;

		const structural = trimmed.match(STRUCTURAL_RE);
		if (structural) {
			while (stack.length > 0 && indentation <= stack[stack.length - 1].indentation) {
				stack.pop();
			}

			const kind = structural[1] as StructuralKind;
			const name = stripInlineComment(structural[2]);
			const definition: StructuralDefinition = {
				kind,
				name,
				filePath,
				line: lineNumber,
				column,
			};
			definitions.push(definition);
			const entry: StackEntry = { definition, indentation };
			stack.push(entry);
			lastStructural = entry;
			continue;
		}

		const idMatch = trimmed.match(ID_RE);
		if (idMatch) {
			const idValue = stripInlineComment(idMatch[2]);
			if (!idValue) continue;

			// Prefer same-indent structural owner (FlowSpec Id association).
			let owner: StructuralDefinition | null = null;
			if (lastStructural && lastStructural.indentation === indentation) {
				owner = lastStructural.definition;
			} else if (stack.length > 0) {
				owner = stack[stack.length - 1].definition;
			}

			if (owner && !owner.id) {
				owner.id = idValue;
			}
			continue;
		}

		const goTo = trimmed.match(GO_TO_RE);
		if (goTo) {
			while (stack.length > 0 && indentation <= stack[stack.length - 1].indentation) {
				stack.pop();
			}

			const target = stripInlineComment(goTo[2]);
			if (!target) continue;

			const source =
				stack.length > 0 ? stack[stack.length - 1].definition : undefined;

			goTos.push({
				target,
				filePath,
				line: lineNumber,
				column,
				source,
			});
			continue;
		}

		// Ignore other FlowSpec content for the graph.
	}

	return { filePath, definitions, goTos };
}
