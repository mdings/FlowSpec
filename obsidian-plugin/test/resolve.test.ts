import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	buildGraph,
	indexFlowSpecFiles,
	matchGoToTargets,
	parseAllFiles,
} from "../src/graph";

describe("resolve by name", () => {
	it("resolves Go to targets by definition name across files", () => {
		const graph = indexFlowSpecFiles([
			{
				filePath: "load.flowspec",
				source: [
					"Flow Load conversation after sign-in",
					"Screen Conversation",
					"  Action Enter conversation",
					"    Steps",
					"      Go to Get or create shopping session",
					"      Go to Start conversation",
				].join("\n"),
			},
			{
				filePath: "start.flowspec",
				source: [
					"Action Start conversation",
					"  Steps",
					"    Go to Bootstrap conversation",
				].join("\n"),
			},
			{
				filePath: "bootstrap.flowspec",
				source: [
					"Action Bootstrap conversation",
					"Action Get or create shopping session",
				].join("\n"),
			},
		]);

		const actionNames = graph.nodes
			.filter((n) => n.kind === "Action")
			.map((n) => n.label)
			.sort();
		assert.deepEqual(actionNames, [
			"Bootstrap conversation",
			"Enter conversation",
			"Get or create shopping session",
			"Start conversation",
		]);

		assert.equal(graph.edges.length, 3);
		assert.ok(graph.edges.every((e) => e.resolved));
		assert.equal(graph.nodes.filter((n) => !n.resolved).length, 0);
	});
});

describe("resolve by Id", () => {
	it("resolves Go to targets by optional Id", () => {
		const definitions = parseAllFiles([
			{
				filePath: "a.flowspec",
				source: [
					"Action Bootstrap conversation",
					"Id conversation.bootstrap",
				].join("\n"),
			},
		]).flatMap((f) => f.definitions);

		const matches = matchGoToTargets("conversation.bootstrap", definitions);
		assert.equal(matches.length, 1);
		assert.equal(matches[0].name, "Bootstrap conversation");
		assert.equal(matches[0].id, "conversation.bootstrap");

		const graph = buildGraph(
			parseAllFiles([
				{
					filePath: "a.flowspec",
					source: [
						"Action Bootstrap conversation",
						"Id conversation.bootstrap",
					].join("\n"),
				},
				{
					filePath: "b.flowspec",
					source: [
						"Action Jump",
						"  Steps",
						"    Go to conversation.bootstrap",
					].join("\n"),
				},
			])
		);

		assert.equal(graph.edges.length, 1);
		assert.equal(graph.edges[0].resolved, true);
		const target = graph.nodes.find((n) => n.key === graph.edges[0].targetKey);
		assert.equal(target?.label, "Bootstrap conversation");
		assert.equal(target?.flowspecId, "conversation.bootstrap");
	});
});

describe("unresolved references", () => {
	it("creates unresolved nodes for missing Go to targets", () => {
		const graph = indexFlowSpecFiles([
			{
				filePath: "a.flowspec",
				source: [
					"Action Enter conversation",
					"  Steps",
					"    Go to Missing target that does not exist",
				].join("\n"),
			},
		]);

		const unresolved = graph.nodes.filter((n) => !n.resolved);
		assert.equal(unresolved.length, 1);
		assert.equal(unresolved[0].kind, "Unresolved");
		assert.equal(unresolved[0].label, "Missing target that does not exist");

		assert.equal(graph.edges.length, 1);
		assert.equal(graph.edges[0].resolved, false);
		assert.equal(graph.edges[0].targetKey, unresolved[0].key);
	});

	it("keeps resolved and unresolved edges side by side", () => {
		const graph = indexFlowSpecFiles([
			{
				filePath: "a.flowspec",
				source: [
					"Action Known",
					"Action Jump",
					"  Steps",
					"    Go to Known",
					"    Go to Unknown",
				].join("\n"),
			},
		]);

		assert.equal(graph.edges.filter((e) => e.resolved).length, 1);
		assert.equal(graph.edges.filter((e) => !e.resolved).length, 1);
		assert.equal(graph.nodes.filter((n) => n.kind === "Unresolved").length, 1);
	});
});
