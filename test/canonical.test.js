const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, validate, lintFlowSpecFile } = require("../lib");

const canonicalPath = path.join(
  __dirname,
  "..",
  "examples",
  "answer-a-user-message.flowspec"
);

const chooseFocusPath = path.join(
  __dirname,
  "..",
  "examples",
  "fixtures",
  "choose-focus.flowspec"
);

describe("canonical example", () => {
  it("parses and lints Title Case without errors", () => {
    const source = fs.readFileSync(canonicalPath, "utf8");
    const { document, diagnostics } = validate(source, "examples/answer-a-user-message.flowspec");
    assert.equal(
      diagnostics.filter((d) => d.severity === "error").length,
      0,
      JSON.stringify(diagnostics, null, 2)
    );

    const flows = document.elements.filter((e) => e.type === "flow");
    const screens = document.elements.filter((e) => e.type === "screen");
    const actions = document.elements.filter((e) => e.type === "action");
    assert.equal(flows.length, 1);
    assert.equal(flows[0].kind, "Flow");
    assert.equal(flows[0].id, "conversation.answer-message");
    assert.equal(screens.length, 1);
    assert.equal(screens[0].kind, "Screen");
    assert.equal(actions.length, 6);
    assert.ok(actions.every((a) => a.kind === "Action"));

    const ids = actions.map((a) => a.id).sort();
    assert.deepEqual(ids, [
      "conversation.continue-without-quick-replies",
      "conversation.create-quick-replies",
      "conversation.create-response",
      "conversation.find-products",
      "conversation.show-quick-replies",
      "conversation.show-response",
    ]);

    const parsed = parse(source);
    const when = parsed.elements.find(
      (e) => e.type === "flow-control" && e.kind === "When"
    );
    assert.ok(when);
    assert.match(when.text, /user sends a message/);

    const lint = lintFlowSpecFile(source, "examples/answer-a-user-message.flowspec");
    assert.equal(lint.filter((d) => d.severity === "error").length, 0);
  });

  it("parses concise Screen interactions in choose-focus", () => {
    const source = fs.readFileSync(chooseFocusPath, "utf8");
    const { document, diagnostics } = validate(
      source,
      "examples/fixtures/choose-focus.flowspec"
    );
    assert.equal(
      diagnostics.filter((d) => d.severity === "error").length,
      0,
      JSON.stringify(diagnostics, null, 2)
    );

    const screens = document.elements.filter((e) => e.type === "screen");
    const actions = document.elements.filter((e) => e.type === "action");
    assert.equal(screens.length, 4);
    assert.ok(actions.length >= 5);
    assert.ok(actions.some((a) => a.name === "Select focus"));
    assert.ok(actions.some((a) => a.name === "Select voice"));
    assert.ok(actions.some((a) => a.name === "Generate meditation"));

    const lint = lintFlowSpecFile(source, "examples/fixtures/choose-focus.flowspec");
    assert.equal(lint.length, 0, JSON.stringify(lint, null, 2));
  });
});
