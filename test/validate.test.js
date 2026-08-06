const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validate, ID_PATTERN } = require("../lib");

describe("validate IDs", () => {
  it("accepts valid IDs and attaches them to owners", () => {
    const { document, diagnostics } = validate(
      "FLOW: Answer a user message\nID: conversation.answer-message\n"
    );
    assert.equal(diagnostics.length, 0);
    assert.equal(document.elements[0].id, "conversation.answer-message");
  });

  it("rejects invalid uppercase IDs", () => {
    const { diagnostics } = validate("ACTION: X\nID: Conversation.Create\n");
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].code, "invalid-id");
    assert.equal(ID_PATTERN.test("Conversation.Create"), false);
  });

  it("rejects IDs containing spaces", () => {
    const { diagnostics } = validate("ACTION: X\nID: create quick replies\n");
    assert.equal(diagnostics.some((d) => d.code === "invalid-id"), true);
  });

  it("rejects duplicate IDs", () => {
    const source = [
      "ACTION: One",
      "ID: shared.id",
      "ACTION: Two",
      "ID: shared.id",
    ].join("\n");
    const { diagnostics } = validate(source);
    assert.equal(diagnostics.some((d) => d.code === "duplicate-id"), true);
    assert.equal(diagnostics.find((d) => d.code === "duplicate-id").line, 4);
  });

  it("rejects orphaned IDs", () => {
    const { diagnostics } = validate("ID: orphan.id\n");
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].code, "orphaned-id");
  });

  it("rejects multiple IDs on one structural element", () => {
    const source = [
      "ACTION: Create quick replies",
      "ID: conversation.create-quick-replies",
      "ID: conversation.other",
    ].join("\n");
    const { diagnostics } = validate(source);
    assert.equal(diagnostics.some((d) => d.code === "multiple-ids"), true);
  });

  it("warns on discouraged action-section ordering", () => {
    const source = [
      "ACTION: Demo",
      "ID: demo.action",
      "Outcome",
      "  Done",
      "Receives",
      "  Input",
    ].join("\n");
    const { diagnostics } = validate(source);
    const order = diagnostics.filter((d) => d.code === "section-order");
    assert.ok(order.length >= 1);
    assert.equal(order[0].severity, "warning");
  });

  it("does not error when recommended order is followed", () => {
    const source = [
      "ACTION: Demo",
      "ID: demo.action",
      "Receives",
      "  Input",
      "Rules",
      "  A rule",
      "Steps",
      "  Do work",
      "Shows",
      "  UI",
      "Outcome",
      "  Done",
    ].join("\n");
    const { diagnostics } = validate(source);
    assert.equal(diagnostics.filter((d) => d.severity === "error").length, 0);
    assert.equal(diagnostics.filter((d) => d.code === "section-order").length, 0);
  });
});
