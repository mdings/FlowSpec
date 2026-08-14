const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parse, isValidIdFormat, parseTree } = require("../lib");

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

  it("does not attach document-level Shows to a preceding Screen", () => {
    const source = [
      "Flow Email login",
      "Screen Enter email",
      "Shows",
      "  Email address input",
    ].join("\n");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const screen = root.children.find((c) => c.type === "screen");
    const shows = root.children.find((c) => c.type === "shows");
    assert.ok(flow);
    assert.ok(screen);
    assert.ok(shows);
    assert.equal(screen.parent.type, "document");
    assert.equal(shows.parent.type, "document");
    assert.equal(
      (flow.children || []).some((c) => c.type === "screen" || c.type === "shows"),
      false
    );
  });

  it("does not attach document-level Rules to a preceding Action", () => {
    const source = [
      "Flow Email login",
      "Action Send login code",
      "Rules",
      "  Email address must be valid",
    ].join("\n");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const action = root.children.find((c) => c.type === "action");
    const rules = root.children.find((c) => c.type === "rules");
    assert.ok(flow);
    assert.ok(action);
    assert.ok(rules);
    assert.equal(action.parent.type, "document");
    assert.equal(rules.parent.type, "document");
  });

  it("owns indented Screen and When under Flow only via indentation", () => {
    const source = [
      "Flow Home",
      "",
      "  Screen Home",
      "",
      "    When the user changes mood",
      "      Store selected mood",
      "",
      "  When connectivity returns",
      "    Retry pending work",
    ].join("\n");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const screen = flow.children.find((c) => c.type === "screen");
    const screenWhen = screen.children.find((c) => c.type === "when");
    const flowWhen = flow.children.find((c) => c.type === "when");
    assert.equal(screenWhen.value.trim(), "the user changes mood");
    assert.equal(screenWhen.parent.type, "screen");
    assert.equal(flowWhen.value.trim(), "connectivity returns");
    assert.equal(flowWhen.parent.type, "flow");
  });
});

describe("implicit Actions under Screen", () => {
  function screenOf(source) {
    return parseTree(source).root.children[0].children.find((c) => c.type === "screen");
  }

  function actionShape(action) {
    return {
      type: action.type,
      value: action.value,
      children: (action.children || []).map((c) => ({
        type: c.type,
        value: c.value,
        children: (c.children || []).map((gc) => ({
          type: gc.type,
          value: gc.value,
        })),
      })),
    };
  }

  it("promotes a valid implicit Action inside Screen", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Select voice", "      If the voice requires Premium", "        Go to Premium paywall"].join("\n");
    const screen = screenOf(source);
    const action = screen.children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(action.value, "Select voice");
    assert.equal(action.implicit, true);
    assert.equal(action.children[0].type, "if");
    assert.equal(action.children[0].children[0].type, "goTo");
    assert.equal(action.children[0].parent, action);
  });

  it("promotes multiple implicit Actions inside one Screen", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Select voice", "      Go to Choose duration", "    Hold voice", "      Shows", "        Voice name", "        Voice description"].join("\n");
    const screen = screenOf(source);
    const actions = screen.children.filter((c) => c.type === "action");
    assert.equal(actions.length, 2);
    assert.equal(actions[0].value, "Select voice");
    assert.equal(actions[0].implicit, true);
    assert.equal(actions[1].value, "Hold voice");
    assert.equal(actions[1].implicit, true);
    assert.equal(actions[1].children[0].type, "shows");
  });

  it("promotes an implicit Action with If / Otherwise", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Select voice", "      If the voice requires Premium", "        Go to Premium paywall", "      Otherwise", "        Store selected voice"].join("\n");
    const action = screenOf(source).children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(action.children[0].type, "if");
    assert.equal(action.children[1].type, "otherwise");
  });

  it("promotes an implicit Action with Shows", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Hold voice", "      Shows", "        Voice name"].join("\n");
    const action = screenOf(source).children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(action.implicit, true);
    assert.equal(action.children[0].type, "shows");
  });

  it("keeps explicit Action working inside Screen", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Action Select voice", "      Go to Choose duration"].join("\n");
    const action = screenOf(source).children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(action.value, "Select voice");
    assert.equal(Boolean(action.implicit), false);
    assert.equal(action.children[0].type, "goTo");
  });

  it("is structurally equivalent to an explicit Action", () => {
    const implicit = ["Flow Voice", "  Screen Choose voice", "    Select voice", "      If the voice requires Premium", "        Go to Premium paywall"].join("\n");
    const explicit = ["Flow Voice", "  Screen Choose voice", "    Action Select voice", "      If the voice requires Premium", "        Go to Premium paywall"].join("\n");
    const implicitAction = screenOf(implicit).children.find((c) => c.type === "action");
    const explicitAction = screenOf(explicit).children.find((c) => c.type === "action");
    assert.deepEqual(actionShape(implicitAction), actionShape(explicitAction));
    assert.equal(implicitAction.implicit, true);
    assert.equal(Boolean(explicitAction.implicit), false);
  });

  it("does not promote bare content without a nested body", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Voice picker copy", "    Shows", "      Voice list"].join("\n");
    const screen = screenOf(source);
    assert.equal(screen.children.some((c) => c.type === "action" && c.implicit), false);
    assert.equal(screen.children[0].type, "content");
    assert.equal(screen.children[0].value, "Voice picker copy");
    assert.equal(screen.children[1].type, "shows");
  });

  it("does not promote nested prose notes as an Action", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Introduction", "      Welcome to the voice picker"].join("\n");
    const screen = screenOf(source);
    assert.equal(screen.children.some((c) => c.type === "action"), false);
    assert.equal(screen.children[0].type, "content");
    assert.equal(screen.children[1].type, "content");
  });

  it("does not promote plain content inside sections as an implicit Action", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Shows", "      Select voice", "      Hold voice"].join("\n");
    const screen = screenOf(source);
    assert.equal(screen.children.some((c) => c.type === "action"), false);
    assert.equal(screen.children[0].type, "shows");
    assert.deepEqual(
      screen.children[0].children.map((c) => c.value),
      ["Select voice", "Hold voice"]
    );
  });

  it("does not promote the same text at Flow level as an implicit Action", () => {
    const source = ["Flow Voice", "  Select voice", "    Go to Choose duration"].join("\n");
    const { root } = parseTree(source);
    const flow = root.children[0];
    assert.equal(flow.children.some((c) => c.type === "action"), false);
    assert.equal(flow.children[0].type, "content");
    assert.equal(flow.children[0].value, "Select voice");
    assert.equal(flow.children[1].type, "goTo");
  });

  it("rejects Id on an implicit Action", () => {
    const withIndentedId = ["Flow Voice", "  Screen Choose voice", "    Select voice", "      Id voice.select", "      Outcome", "        Voice is selected"].join("\n");
    const { root } = parseTree(withIndentedId);
    const action = screenOf(withIndentedId).children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(action.implicit, true);
    assert.equal(action.id, undefined);
    const d = require("../lib").lintFlowSpecFile(withIndentedId, "a.flowspec");
    assert.ok(d.some((x) => x.code === "FS019"));
  });
});
