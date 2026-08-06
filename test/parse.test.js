const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parse, isValidIdFormat } = require("../lib");

describe("parse IDs", () => {
  it("parses a valid FLOW ID", () => {
    const doc = parse("FLOW: Answer a user message\nID: conversation.answer-message\n");
    const flow = doc.elements.find((e) => e.type === "flow");
    const id = doc.elements.find((e) => e.type === "id");
    assert.equal(flow.name, "Answer a user message");
    assert.equal(id.value, "conversation.answer-message");
    assert.equal(id.owner, flow);
  });

  it("parses a valid SCREEN ID", () => {
    const doc = parse("SCREEN: Conversation\nID: conversation.screen\n");
    const screen = doc.elements.find((e) => e.type === "screen");
    const id = doc.elements.find((e) => e.type === "id");
    assert.equal(screen.name, "Conversation");
    assert.equal(id.value, "conversation.screen");
    assert.equal(id.owner, screen);
  });

  it("parses a valid ACTION ID", () => {
    const doc = parse("ACTION: Create quick replies\nID: conversation.create-quick-replies\n");
    const action = doc.elements.find((e) => e.type === "action");
    const id = doc.elements.find((e) => e.type === "id");
    assert.equal(action.name, "Create quick replies");
    assert.equal(id.value, "conversation.create-quick-replies");
    assert.equal(id.owner, action);
  });

  it("parses IDs containing periods and hyphens", () => {
    const doc = parse("ACTION: X\nID: conversation.create-quick-replies\n");
    assert.equal(doc.elements.find((e) => e.type === "id").value, "conversation.create-quick-replies");
    assert.equal(isValidIdFormat("conversation.create-quick-replies"), true);
    assert.equal(isValidIdFormat("a_b-c.d0"), true);
  });

  it("supports optional colon on ID", () => {
    const doc = parse("FLOW Foo\nID conversation.answer-message\n");
    assert.equal(doc.elements.find((e) => e.type === "id").value, "conversation.answer-message");
  });

  it("does not treat directive-like words in prose as directives", () => {
    const source = [
      "ACTION: Demo",
      "ID: demo.action",
      "Rules",
      "  Only show this when product results are available",
      "  Do not run if the user is anonymous",
    ].join("\n");
    const doc = parse(source);
    const flowControls = doc.elements.filter((e) => e.type === "flow-control");
    assert.equal(flowControls.length, 0);
    const rules = doc.elements.find((e) => e.type === "action").sections.find((s) => s.name === "Rules");
    assert.equal(rules.items.length, 2);
    assert.match(rules.items[0].text, /when product results/);
  });
});
