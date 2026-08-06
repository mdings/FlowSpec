const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, validate } = require("../lib");

const canonicalPath = path.join(
  __dirname,
  "..",
  "examples",
  "answer-a-user-message.flowspec"
);

describe("canonical example", () => {
  it("parses and validates without errors", () => {
    const source = fs.readFileSync(canonicalPath, "utf8");
    const { document, diagnostics } = validate(source);
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2));

    const flows = document.elements.filter((e) => e.type === "flow");
    const screens = document.elements.filter((e) => e.type === "screen");
    const actions = document.elements.filter((e) => e.type === "action");
    assert.equal(flows.length, 1);
    assert.equal(flows[0].id, "conversation.answer-message");
    assert.equal(screens.length, 1);
    assert.equal(screens[0].id, "conversation.screen");
    assert.equal(actions.length, 6);

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
  });
});
