import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { ItemView, WorkspaceLeaf } from "obsidian";
import type { FlowSpecIndexer } from "./indexer";
import type { FlowSpecGraph, GraphNode } from "./types";

export const VIEW_TYPE_FLOWSPEC_GRAPH = "flowspec-graph-view";

const NODE_COLORS: Record<string, { bg: string; border: string }> = {
	Flow: { bg: "#3b82f6", border: "#1d4ed8" },
	Screen: { bg: "#10b981", border: "#047857" },
	Action: { bg: "#f59e0b", border: "#b45309" },
	Unresolved: { bg: "#fecaca", border: "#ef4444" },
};

export class FlowSpecGraphView extends ItemView {
	private indexer: FlowSpecIndexer;
	private cy: Core | null = null;
	private canvasEl: HTMLElement | null = null;
	private metaEl: HTMLElement | null = null;
	private emptyEl: HTMLElement | null = null;
	private unsubscribe: (() => void) | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(leaf: WorkspaceLeaf, indexer: FlowSpecIndexer) {
		super(leaf);
		this.indexer = indexer;
	}

	getViewType(): string {
		return VIEW_TYPE_FLOWSPEC_GRAPH;
	}

	getDisplayText(): string {
		return "FlowSpec Graph";
	}

	getIcon(): string {
		return "git-fork";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("flowspec-graph-view");

		const toolbar = container.createDiv({ cls: "flowspec-graph-toolbar" });
		toolbar.createSpan({ cls: "flowspec-graph-title", text: "FlowSpec Graph" });

		const legend = toolbar.createDiv({ cls: "flowspec-graph-legend" });
		this.addLegendItem(legend, "flow", "Flow");
		this.addLegendItem(legend, "screen", "Screen");
		this.addLegendItem(legend, "action", "Action");
		this.addLegendItem(legend, "unresolved", "Unresolved");

		this.metaEl = toolbar.createSpan({ cls: "flowspec-graph-meta" });

		const refreshBtn = toolbar.createEl("button", {
			text: "Refresh",
			cls: "mod-cta",
		});
		refreshBtn.addEventListener("click", () => {
			void this.indexer.refresh();
		});

		this.emptyEl = container.createDiv({ cls: "flowspec-graph-empty" });
		this.emptyEl.setText(
			"No .flowspec files found in this vault. Drop .flowspec files into the vault and refresh."
		);

		this.canvasEl = container.createDiv({ cls: "flowspec-graph-canvas" });

		this.unsubscribe = this.indexer.onChange((graph) => {
			this.renderGraph(graph);
		});

		this.resizeObserver = new ResizeObserver(() => {
			this.cy?.resize();
		});
		this.resizeObserver.observe(this.canvasEl);

		await this.indexer.refresh();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.destroyCy();
	}

	private addLegendItem(parent: HTMLElement, cls: string, label: string): void {
		const item = parent.createSpan({ cls: "flowspec-graph-legend-item" });
		item.createSpan({ cls: `flowspec-graph-swatch ${cls}` });
		item.createSpan({ text: label });
	}

	private destroyCy(): void {
		if (this.cy) {
			this.cy.destroy();
			this.cy = null;
		}
	}

	private toElements(graph: FlowSpecGraph): ElementDefinition[] {
		const elements: ElementDefinition[] = [];

		for (const node of graph.nodes) {
			elements.push({
				group: "nodes",
				data: {
					id: node.key,
					label: this.nodeLabel(node),
					kind: node.kind,
					resolved: node.resolved,
					node,
				},
			});
		}

		for (const edge of graph.edges) {
			elements.push({
				group: "edges",
				data: {
					id: edge.key,
					source: edge.sourceKey,
					target: edge.targetKey,
					label: edge.label,
					// Cytoscape selectors work more reliably with numeric flags.
					resolved: edge.resolved ? 1 : 0,
				},
			});
		}

		return elements;
	}

	private nodeLabel(node: GraphNode): string {
		if (node.flowspecId) {
			return `${node.label}\n[${node.flowspecId}]`;
		}
		return node.label;
	}

	private renderGraph(graph: FlowSpecGraph): void {
		if (!this.canvasEl || !this.metaEl || !this.emptyEl) return;

		const fileCount = new Set(
			graph.nodes.filter((n) => n.filePath).map((n) => n.filePath)
		).size;
		const unresolved = graph.nodes.filter((n) => !n.resolved).length;
		this.metaEl.setText(
			`${graph.nodes.length} nodes · ${graph.edges.length} edges · ${fileCount} files` +
				(unresolved ? ` · ${unresolved} unresolved` : "")
		);

		if (graph.nodes.length === 0) {
			this.destroyCy();
			this.canvasEl.hide();
			this.emptyEl.show();
			return;
		}

		this.emptyEl.hide();
		this.canvasEl.show();

		const elements = this.toElements(graph);

		if (this.cy) {
			this.cy.json({ elements });
			this.cy.layout(this.layoutOptions()).run();
			return;
		}

		const cy = cytoscape({
			container: this.canvasEl,
			elements,
			style: [
				{
					selector: "node",
					style: {
						label: "data(label)",
						"text-wrap": "wrap",
						"text-max-width": "140px",
						"text-valign": "center",
						"text-halign": "center",
						color: "#111827",
						"font-size": "11px",
						"font-weight": 600,
						width: "label",
						height: "label",
						padding: "12px",
						"border-width": 2,
						"background-color": "#93c5fd",
						"border-color": "#1d4ed8",
						shape: "round-rectangle",
					},
				},
				{
					selector: 'node[kind = "Flow"]',
					style: {
						"background-color": NODE_COLORS.Flow.bg,
						"border-color": NODE_COLORS.Flow.border,
						color: "#ffffff",
						shape: "round-rectangle",
					},
				},
				{
					selector: 'node[kind = "Screen"]',
					style: {
						"background-color": NODE_COLORS.Screen.bg,
						"border-color": NODE_COLORS.Screen.border,
						color: "#ffffff",
						shape: "round-rectangle",
					},
				},
				{
					selector: 'node[kind = "Action"]',
					style: {
						"background-color": NODE_COLORS.Action.bg,
						"border-color": NODE_COLORS.Action.border,
						color: "#111827",
						shape: "ellipse",
					},
				},
				{
					selector: 'node[kind = "Unresolved"]',
					style: {
						"background-color": NODE_COLORS.Unresolved.bg,
						"border-color": NODE_COLORS.Unresolved.border,
						"border-style": "dashed",
						color: "#7f1d1d",
						shape: "diamond",
					},
				},
				{
					selector: "edge",
					style: {
						width: 2,
						"curve-style": "bezier",
						"target-arrow-shape": "triangle",
						"line-color": "#64748b",
						"target-arrow-color": "#64748b",
						label: "data(label)",
						"font-size": "9px",
						color: "#64748b",
						"text-rotation": "autorotate",
						"text-margin-y": -8,
					},
				},
				{
					selector: "edge[resolved = 0]",
					style: {
						"line-style": "dashed",
						"line-color": "#ef4444",
						"target-arrow-color": "#ef4444",
						color: "#ef4444",
					},
				},
				{
					selector: "node:selected",
					style: {
						"border-width": 4,
						"border-color": "#111827",
					},
				},
			],
			layout: this.layoutOptions(),
			wheelSensitivity: 0.3,
			minZoom: 0.2,
			maxZoom: 2.5,
		});

		cy.on("tap", "node", (evt) => {
			const data = evt.target.data();
			const node = data.node as GraphNode | undefined;
			if (!node) return;
			void this.indexer.openDefinition(node);
		});

		this.cy = cy;
	}

	private layoutOptions(): cytoscape.LayoutOptions {
		return {
			name: "cose",
			animate: false,
			padding: 40,
			nodeRepulsion: () => 8000,
			idealEdgeLength: () => 120,
			nodeDimensionsIncludeLabels: true,
		} as cytoscape.LayoutOptions;
	}
}
