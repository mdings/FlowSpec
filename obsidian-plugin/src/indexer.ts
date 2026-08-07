import { Notice, TFile, type App } from "obsidian";
import { buildGraph, parseAllFiles } from "./graph";
import type { FlowSpecGraph, GraphNode } from "./types";

/**
 * Indexes all .flowspec files in the vault and exposes a refreshable graph.
 */
export class FlowSpecIndexer {
	private app: App;
	private graph: FlowSpecGraph = { nodes: [], edges: [] };
	private listeners = new Set<(graph: FlowSpecGraph) => void>();
	private refreshQueued = false;

	constructor(app: App) {
		this.app = app;
	}

	getGraph(): FlowSpecGraph {
		return this.graph;
	}

	onChange(listener: (graph: FlowSpecGraph) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener(this.graph);
		}
	}

	/** Debounced refresh for vault events. */
	requestRefresh(): void {
		if (this.refreshQueued) return;
		this.refreshQueued = true;
		window.setTimeout(() => {
			this.refreshQueued = false;
			void this.refresh();
		}, 50);
	}

	async refresh(): Promise<FlowSpecGraph> {
		const files = this.app.vault
			.getFiles()
			.filter((f) => f.extension === "flowspec")
			.sort((a, b) => a.path.localeCompare(b.path));

		const parsedInputs: Array<{ filePath: string; source: string }> = [];
		for (const file of files) {
			try {
				const source = await this.app.vault.cachedRead(file);
				parsedInputs.push({ filePath: file.path, source });
			} catch (err) {
				console.error(`FlowSpec Graph: failed to read ${file.path}`, err);
			}
		}

		this.graph = buildGraph(parseAllFiles(parsedInputs));
		this.notify();
		return this.graph;
	}

	/**
	 * Open the .flowspec file for a resolved node and jump to its definition line.
	 */
	async openDefinition(node: GraphNode): Promise<void> {
		if (!node.resolved || !node.filePath || node.line == null) {
			new Notice(`Unresolved FlowSpec target: ${node.label}`);
			return;
		}

		const abstract = this.app.vault.getAbstractFileByPath(node.filePath);
		if (!(abstract instanceof TFile)) {
			new Notice(`File not found: ${node.filePath}`);
			return;
		}

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(abstract, {
			eState: {
				line: node.line - 1,
			},
		});

		// Best-effort cursor placement for editors that ignore eState.line.
		window.setTimeout(() => {
			const view = leaf.view as {
				editor?: {
					setCursor: (pos: { line: number; ch: number }) => void;
					scrollIntoView: (
						range: {
							from: { line: number; ch: number };
							to: { line: number; ch: number };
						},
						center?: boolean
					) => void;
				};
			};
			const editor = view.editor;
			if (!editor || node.line == null) return;
			const line = node.line - 1;
			editor.setCursor({ line, ch: 0 });
			editor.scrollIntoView(
				{ from: { line, ch: 0 }, to: { line, ch: 0 } },
				true
			);
		}, 50);
	}
}
