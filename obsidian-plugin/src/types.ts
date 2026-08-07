/** Shared FlowSpec graph types for the Obsidian plugin. */

export type StructuralKind = "Flow" | "Screen" | "Action";
export type GraphNodeKind = StructuralKind | "Unresolved";

export interface DefinitionLocation {
	filePath: string;
	line: number;
	column: number;
}

/** A Flow, Screen, or Action definition discovered in a .flowspec file. */
export interface StructuralDefinition {
	kind: StructuralKind;
	name: string;
	id?: string;
	filePath: string;
	line: number;
	column: number;
}

/** A Go to reference with its enclosing structural definition (if any). */
export interface GoToReference {
	target: string;
	filePath: string;
	line: number;
	column: number;
	/** Nearest enclosing Flow / Screen / Action, when known. */
	source?: StructuralDefinition;
}

export interface ParsedFlowSpecFile {
	filePath: string;
	definitions: StructuralDefinition[];
	goTos: GoToReference[];
}

export interface GraphNode {
	/** Stable graph key. */
	key: string;
	kind: GraphNodeKind;
	label: string;
	/** Optional FlowSpec Id when the node is a resolved definition. */
	flowspecId?: string;
	resolved: boolean;
	filePath?: string;
	line?: number;
	column?: number;
}

export interface GraphEdge {
	key: string;
	sourceKey: string;
	targetKey: string;
	label: string;
	resolved: boolean;
	filePath: string;
	line: number;
}

export interface FlowSpecGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
}
