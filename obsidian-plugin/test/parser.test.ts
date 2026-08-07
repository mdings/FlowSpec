import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFlowSpecSource } from "../src/parser";

describe("parseFlowSpecSource nodes", () => {
	it("parses Flow, Screen, and Action definitions", () => {
		const source = [
			"Flow Load conversation after sign-in",
			"",
			"Screen Conversation",
			"",
			"  Action Enter conversation",
		].join("\n");

		const parsed = parseFlowSpecSource(source, "demo.flowspec");
		assert.equal(parsed.definitions.length, 3);
		assert.equal(parsed.definitions[0].kind, "Flow");
		assert.equal(parsed.definitions[0].name, "Load conversation after sign-in");
		assert.equal(parsed.definitions[0].line, 1);
		assert.equal(parsed.definitions[1].kind, "Screen");
		assert.equal(parsed.definitions[1].name, "Conversation");
		assert.equal(parsed.definitions[2].kind, "Action");
		assert.equal(parsed.definitions[2].name, "Enter conversation");
		assert.equal(parsed.definitions[2].line, 5);
	});

	it("associates Id with the preceding structural definition", () => {
		const source = [
			"Action Bootstrap conversation",
			"Id conversation.bootstrap",
			"",
			"Action Other",
			"Id other.id",
		].join("\n");

		const parsed = parseFlowSpecSource(source, "ids.flowspec");
		assert.equal(parsed.definitions[0].id, "conversation.bootstrap");
		assert.equal(parsed.definitions[1].id, "other.id");
	});

	it("parses optional colons after directives", () => {
		const source = ["Flow: Demo", "Id: demo.flow", "Action: Do thing"].join("\n");
		const parsed = parseFlowSpecSource(source, "colon.flowspec");
		assert.equal(parsed.definitions[0].name, "Demo");
		assert.equal(parsed.definitions[0].id, "demo.flow");
		assert.equal(parsed.definitions[1].name, "Do thing");
	});
});

describe("parseFlowSpecSource Go to", () => {
	it("parses Go to references under an Action", () => {
		const source = [
			"Action Enter conversation",
			"  Steps",
			"    Go to Get or create shopping session",
			"",
			"    Once the shopping session is ready",
			"      Go to Start conversation",
		].join("\n");

		const parsed = parseFlowSpecSource(source, "goto.flowspec");
		assert.equal(parsed.goTos.length, 2);
		assert.equal(parsed.goTos[0].target, "Get or create shopping session");
		assert.equal(parsed.goTos[0].source?.name, "Enter conversation");
		assert.equal(parsed.goTos[1].target, "Start conversation");
		assert.equal(parsed.goTos[1].line, 6);
	});

	it("strips inline comments from Go to targets", () => {
		const source = ["Action A", "  Go to Target # comment"].join("\n");
		const parsed = parseFlowSpecSource(source, "c.flowspec");
		assert.equal(parsed.goTos[0].target, "Target");
	});
});
