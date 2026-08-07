/**
 * Discover .flowspec paths and build an in-memory relationship graph.
 */

import { parseFlowSpecSource } from "./parser";
import type {
	FlowSpecGraph,
	GraphEdge,
	GraphNode,
	ParsedFlowSpecFile,
	StructuralDefinition,
} from "./types";

const FLOWSPEC_EXTENSION = ".flowspec";

/** Return paths that look like FlowSpec files. */
export function discoverFlowSpecFiles(paths: string[]): string[] {
	return paths
		.filter((p) => typeof p === "string" && p.toLowerCase().endsWith(FLOWSPEC_EXTENSION))
		.slice()
		.sort();
}

function definitionKey(def: StructuralDefinition): string {
	return `def:${def.filePath}:${def.line}:${def.kind}:${def.name}`;
}

function unresolvedKey(name: string): string {
	return `unresolved:${name}`;
}

/**
 * Match a Go to reference against indexed definitions by display name or Id.
 * Same resolution rules as the shared FlowSpec goto helper.
 */
export function matchGoToTargets(
	ref: string,
	definitions: StructuralDefinition[]
): StructuralDefinition[] {
	const trimmed = String(ref || "").trim();
	if (!trimmed) return [];

	const matches = definitions.filter(
		(d) => d.name === trimmed || (d.id && d.id === trimmed)
	);

	const unique: StructuralDefinition[] = [];
	const seen = new Set<string>();
	for (const m of matches) {
		const key = `${m.kind}|${m.name}|${m.id || ""}|${m.filePath}|${m.line}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(m);
	}
	return unique;
}

export function parseAllFiles(
	files: Array<{ filePath: string; source: string }>
): ParsedFlowSpecFile[] {
	return files.map((f) => parseFlowSpecSource(f.source, f.filePath));
}

/**
 * Build a graph from parsed files: structural nodes + Go to edges.
 * Unresolved targets become explicit Unresolved nodes.
 */
export function buildGraph(parsedFiles: ParsedFlowSpecFile[]): FlowSpecGraph {
	const definitions = parsedFiles.flatMap((f) => f.definitions);
	const goTos = parsedFiles.flatMap((f) => f.goTos);

	const nodes = new Map<string, GraphNode>();
	const edges: GraphEdge[] = [];

	for (const def of definitions) {
		const key = definitionKey(def);
		nodes.set(key, {
			key,
			kind: def.kind,
			label: def.name || `(unnamed ${def.kind})`,
			flowspecId: def.id,
			resolved: true,
			filePath: def.filePath,
			line: def.line,
			column: def.column,
		});
	}

	let edgeIndex = 0;
	for (const goTo of goTos) {
		const matches = matchGoToTargets(goTo.target, definitions);
		const sourceKey = goTo.source
			? definitionKey(goTo.source)
			: `orphan-source:${goTo.filePath}:${goTo.line}`;

		if (!goTo.source) {
			nodes.set(sourceKey, {
				key: sourceKey,
				kind: "Unresolved",
				label: `(orphan Go to @ ${goTo.filePath}:${goTo.line})`,
				resolved: false,
				filePath: goTo.filePath,
				line: goTo.line,
				column: goTo.column,
			});
		}

		if (matches.length === 0) {
			const targetKey = unresolvedKey(goTo.target);
			if (!nodes.has(targetKey)) {
				nodes.set(targetKey, {
					key: targetKey,
					kind: "Unresolved",
					label: goTo.target,
					resolved: false,
				});
			}
			edges.push({
				key: `edge:${edgeIndex++}:${sourceKey}->${targetKey}`,
				sourceKey,
				targetKey,
				label: "Go to",
				resolved: false,
				filePath: goTo.filePath,
				line: goTo.line,
			});
			continue;
		}

		for (const match of matches) {
			const targetKey = definitionKey(match);
			edges.push({
				key: `edge:${edgeIndex++}:${sourceKey}->${targetKey}`,
				sourceKey,
				targetKey,
				label: "Go to",
				resolved: true,
				filePath: goTo.filePath,
				line: goTo.line,
			});
		}
	}

	return {
		nodes: [...nodes.values()],
		edges,
	};
}

/** Convenience: discover + parse + build from path/source pairs. */
export function indexFlowSpecFiles(
	files: Array<{ filePath: string; source: string }>
): FlowSpecGraph {
	const flowspecFiles = files.filter((f) =>
		f.filePath.toLowerCase().endsWith(FLOWSPEC_EXTENSION)
	);
	return buildGraph(parseAllFiles(flowspecFiles));
}
