import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import {
	FlowSpecGraphView,
	VIEW_TYPE_FLOWSPEC_GRAPH,
} from "./graph-view";
import { FlowSpecIndexer } from "./indexer";

function isFlowSpecFile(file: TAbstractFile): boolean {
	return file instanceof TFile && file.extension === "flowspec";
}

export default class FlowSpecGraphPlugin extends Plugin {
	indexer!: FlowSpecIndexer;

	async onload(): Promise<void> {
		this.indexer = new FlowSpecIndexer(this.app);

		this.registerView(
			VIEW_TYPE_FLOWSPEC_GRAPH,
			(leaf) => new FlowSpecGraphView(leaf, this.indexer)
		);

		this.addCommand({
			id: "open-flowspec-graph",
			name: "Open graph",
			callback: () => {
				void this.activateView();
			},
		});

		this.addRibbonIcon("git-fork", "Open FlowSpec graph", () => {
			void this.activateView();
		});

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (isFlowSpecFile(file)) this.indexer.requestRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (isFlowSpecFile(file)) this.indexer.requestRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (isFlowSpecFile(file)) this.indexer.requestRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (
					isFlowSpecFile(file) ||
					oldPath.toLowerCase().endsWith(".flowspec")
				) {
					this.indexer.requestRefresh();
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			void this.indexer.refresh();
		});
	}

	async onunload(): Promise<void> {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_FLOWSPEC_GRAPH);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_FLOWSPEC_GRAPH);

		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_FLOWSPEC_GRAPH,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}
}
