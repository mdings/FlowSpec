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
      "  Rules",
      "    Only show this when product results are available",
      "    Do not run if the user is anonymous",
      "    Follow the rules in the brand guide",
      "    The response uses available product context",
    ].join("\n");
    const doc = parse(source);
    assert.equal(doc.elements.filter((e) => e.type === "flow-control").length, 0);
    assert.equal(doc.elements.filter((e) => e.type === "unknown-directive").length, 0);
    const rules = doc.elements.find((e) => e.type === "action").sections.find((s) => s.name === "Rules");
    assert.equal(rules.items.length, 4);
    assert.match(rules.items[0].text, /when product results/);
    assert.match(rules.items[3].text, /uses available/);
  });

  it("parses Uses as an action section", () => {
    const source = [
      "Action Generate response",
      "  Uses",
      "    Provider OpenAI",
      "    Model GPT-5",
    ].join("\n");
    const doc = parse(source);
    const action = doc.elements.find((e) => e.type === "action");
    const uses = action.sections.find((s) => s.name === "Uses");
    assert.ok(uses);
    assert.equal(uses.key, "uses");
    assert.deepEqual(
      uses.items.map((i) => i.text),
      ["Provider OpenAI", "Model GPT-5"]
    );
  });

  it("does not attach same-indent Shows to a preceding Screen", () => {
    const { parseTree } = require("../lib");
    const source = [
      "Flow Email login",
      "Screen Enter email",
      "Shows",
      "  Email address input",
    ].join("\n");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const screen = flow.children.find((c) => c.type === "screen");
    const shows = flow.children.find((c) => c.type === "shows");
    assert.ok(screen);
    assert.ok(shows);
    assert.equal(shows.parent.type, "flow");
    assert.equal(
      screen.children.some((c) => c.type === "shows"),
      false
    );
  });

  it("does not attach same-indent Rules to a preceding Action", () => {
    const { parseTree } = require("../lib");
    const source = [
      "Flow Email login",
      "Action Send login code",
      "Rules",
      "  Email address must be valid",
    ].join("\n");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const action = flow.children.find((c) => c.type === "action");
    const rules = flow.children.find((c) => c.type === "rules");
    assert.ok(action);
    assert.ok(rules);
    assert.equal(rules.parent.type, "flow");
    assert.equal(
      action.children.some((c) => c.type === "rules"),
      false
    );
  });
});
