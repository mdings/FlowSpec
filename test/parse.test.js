const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parse, isValidIdFormat } = require("../lib");

describe("parse Title Case directives", () => {
  it("parses a valid Flow Id", () => {
    const doc = parse("Flow: Answer a user message\nId: conversation.answer-message\n");
    const flow = doc.elements.find((e) => e.type === "flow");
    const id = doc.elements.find((e) => e.type === "id");
    assert.equal(flow.kind, "Flow");
    assert.equal(flow.name, "Answer a user message");
    assert.equal(id.value, "conversation.answer-message");
    assert.equal(id.owner, flow);
    assert.equal(flow.deprecatedCasing, false);
  });

  it("parses a valid Screen Id", () => {
    const doc = parse("Screen: Conversation\nId: conversation.screen\n");
    const screen = doc.elements.find((e) => e.type === "screen");
    assert.equal(screen.kind, "Screen");
    assert.equal(screen.name, "Conversation");
    assert.equal(doc.elements.find((e) => e.type === "id").value, "conversation.screen");
  });

  it("parses a valid Action Id", () => {
    const doc = parse("Action: Create quick replies\nId: conversation.create-quick-replies\n");
    const action = doc.elements.find((e) => e.type === "action");
    assert.equal(action.kind, "Action");
    assert.equal(action.name, "Create quick replies");
    assert.equal(doc.elements.find((e) => e.type === "id").value, "conversation.create-quick-replies");
  });

  it("parses Ids containing periods and hyphens", () => {
    const doc = parse("Action: X\nId: conversation.create-quick-replies\n");
    assert.equal(doc.elements.find((e) => e.type === "id").value, "conversation.create-quick-replies");
    assert.equal(isValidIdFormat("conversation.create-quick-replies"), true);
  });

  it("supports optional colon on Id", () => {
    const doc = parse("Flow Foo\nId conversation.answer-message\n");
    assert.equal(doc.elements.find((e) => e.type === "id").value, "conversation.answer-message");
  });

  it("normalizes deprecated uppercase structural directives", () => {
    const doc = parse("FLOW: Sign in\nID: authentication.sign-in\n");
    const flow = doc.elements.find((e) => e.type === "flow");
    const id = doc.elements.find((e) => e.type === "id");
    assert.equal(flow.kind, "Flow");
    assert.equal(flow.rawKind, "FLOW");
    assert.equal(flow.deprecatedCasing, true);
    assert.equal(id.rawKind, "ID");
    assert.equal(id.deprecatedCasing, true);
  });

  it("does not treat directive-like words in prose as directives", () => {
    const source = [
      "Action: Demo",
      "Id: demo.action",
      "Rules",
      "  Only show this when product results are available",
      "  Do not run if the user is anonymous",
      "  Follow the rules in the brand guide",
    ].join("\n");
    const doc = parse(source);
    assert.equal(doc.elements.filter((e) => e.type === "flow-control").length, 0);
    assert.equal(doc.elements.filter((e) => e.type === "unknown-directive").length, 0);
    const rules = doc.elements.find((e) => e.type === "action").sections.find((s) => s.name === "Rules");
    assert.equal(rules.items.length, 3);
    assert.match(rules.items[0].text, /when product results/);
  });
});
