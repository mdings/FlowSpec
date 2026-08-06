const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validate, ID_PATTERN } = require("../lib");

describe("validate Ids and casing", () => {
  it("accepts valid Title Case Ids", () => {
    const { document, diagnostics } = validate(
      "Flow: Answer a user message\nId: conversation.answer-message\n"
    );
    assert.equal(diagnostics.length, 0);
    assert.equal(document.elements[0].id, "conversation.answer-message");
    assert.equal(document.elements[0].kind, "Flow");
  });

  it("rejects invalid uppercase Id values", () => {
    const { diagnostics } = validate("Action: X\nId: Conversation.Create\n");
    assert.equal(diagnostics.some((d) => d.code === "invalid-id"), true);
    assert.equal(ID_PATTERN.test("Conversation.Create"), false);
  });

  it("rejects Ids containing spaces", () => {
    const { diagnostics } = validate("Action: X\nId: create quick replies\n");
    assert.equal(diagnostics.some((d) => d.code === "invalid-id"), true);
  });

  it("rejects duplicate Ids", () => {
    const source = [
      "Action: One",
      "Id: shared.id",
      "Action: Two",
      "Id: shared.id",
    ].join("\n");
    const { diagnostics } = validate(source);
    assert.equal(diagnostics.some((d) => d.code === "duplicate-id"), true);
  });

  it("rejects orphaned Ids", () => {
    const { diagnostics } = validate("Id: orphan.id\n");
    assert.equal(diagnostics.some((d) => d.code === "orphaned-id"), true);
  });

  it("rejects multiple Ids on one structural element", () => {
    const source = [
      "Action: Create quick replies",
      "Id: conversation.create-quick-replies",
      "Id: conversation.other",
    ].join("\n");
    const { diagnostics } = validate(source);
    assert.equal(diagnostics.some((d) => d.code === "multiple-ids"), true);
  });

  it("warns on discouraged action-section ordering", () => {
    const source = [
      "Action: Demo",
      "Id: demo.action",
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

  it("warns on deprecated uppercase FLOW/SCREEN/ACTION/ID", () => {
    const source = [
      "FLOW: Sign in",
      "ID: authentication.sign-in",
      "SCREEN: Login",
      "ID: authentication.login",
      "ACTION: Send login code",
      "ID: authentication.send-login-code",
    ].join("\n");
    const { document, diagnostics } = validate(source);
    const deprecated = diagnostics.filter((d) => d.code === "deprecated-casing");
    assert.equal(deprecated.length, 6);
    assert.ok(deprecated.every((d) => d.severity === "warning"));
    assert.match(deprecated.find((d) => d.message.includes("ACTION")).message, /Use "Action"/);
    assert.equal(diagnostics.filter((d) => d.severity === "error").length, 0);
    assert.equal(document.elements.find((e) => e.type === "action").kind, "Action");
  });

  it("errors on lowercase structural directives with a suggestion", () => {
    const { diagnostics } = validate("flow: Sign in\n");
    const unknown = diagnostics.find((d) => d.code === "unknown-directive");
    assert.ok(unknown);
    assert.equal(unknown.severity, "error");
    assert.equal(unknown.message, 'Unknown directive "flow". Did you mean "Flow"?');
  });

  it("errors on incorrectly cased section directives", () => {
    const { diagnostics } = validate("Action: Demo\nId: demo.action\nreceives\n  Input\n");
    const unknown = diagnostics.find((d) => d.code === "unknown-directive");
    assert.ok(unknown);
    assert.equal(unknown.message, 'Unknown directive "receives". Did you mean "Receives"?');
  });

  it("errors on near-miss forms such as ACTIONs", () => {
    const { diagnostics } = validate("ACTIONs: Send login code\n");
    const unknown = diagnostics.find((d) => d.code === "unknown-directive");
    assert.ok(unknown);
    assert.match(unknown.message, /Did you mean "Action"/);
  });

  it("accepts the deprecated-uppercase fixture with warnings only", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "examples", "fixtures", "deprecated-uppercase.flowspec"),
      "utf8"
    );
    const { document, diagnostics } = validate(source);
    assert.equal(diagnostics.filter((d) => d.severity === "error").length, 0);
    assert.ok(diagnostics.filter((d) => d.code === "deprecated-casing").length >= 4);
    assert.equal(document.elements.find((e) => e.type === "flow").kind, "Flow");
    assert.equal(document.elements.find((e) => e.type === "flow").id, "conversation.answer-message");
  });
});
