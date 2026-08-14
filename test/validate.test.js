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
    assert.equal(
      diagnostics.filter((d) => d.severity === "error").length,
      0
    );
    assert.equal(document.elements[0].id, "conversation.answer-message");
    assert.equal(document.elements[0].kind, "Flow");
  });

  it("rejects invalid uppercase Id values", () => {
    const { diagnostics } = validate("Flow X\n  Action: X\n  Id: Conversation.Create\n");
    assert.equal(diagnostics.some((d) => d.code === "FS005"), true);
    assert.equal(ID_PATTERN.test("Conversation.Create"), false);
  });

  it("rejects Ids containing spaces", () => {
    const { diagnostics } = validate("Flow X\n  Action: X\n  Id: create quick replies\n");
    assert.equal(diagnostics.some((d) => d.code === "FS005"), true);
  });

  it("rejects duplicate Ids", () => {
    const source = ["Flow Demo", "  Action: One", "  Id: shared.id", "  Action: Two", "  Id: shared.id"].join("\n");
    const { diagnostics } = validate(source);
    assert.equal(diagnostics.some((d) => d.code === "FS006"), true);
  });

  it("rejects orphaned Ids", () => {
    const { diagnostics } = validate("Flow X\nId: orphan.id\n  Screen Y\n");
    // Id after Flow is valid actually! Need truly orphaned:
    const orphaned = validate("Id: orphan.id\n");
    assert.equal(orphaned.diagnostics.some((d) => d.code === "FS004"), true);
  });

  it("rejects multiple Ids on one structural element", () => {
    const source = ["Flow Demo", "  Action: Create quick replies", "  Id: conversation.create-quick-replies", "  Id: conversation.other"].join("\n");
    const { diagnostics } = validate(source);
    assert.equal(diagnostics.some((d) => d.code === "FS004"), true);
  });

  it("warns on discouraged action-section ordering", () => {
    const source = ["Flow Demo", "  Action: Demo", "  Id: demo.action", "    Outcome", "      Done", "    Receives", "      Input"].join("\n");
    const { diagnostics } = validate(source);
    const order = diagnostics.filter((d) => d.code === "FS009");
    assert.ok(order.length >= 1);
    assert.equal(order[0].severity, "warning");
  });

  it("warns on deprecated uppercase FLOW/SCREEN/ACTION/ID", () => {
    const source = ["FLOW: Sign in", "ID: authentication.sign-in", "  SCREEN: Login", "  ID: authentication.login", "  ACTION: Send login code", "  ID: authentication.send-login-code"].join("\n");
    const { document, diagnostics } = validate(source);
    const casing = diagnostics.filter((d) => d.code === "FS016");
    assert.ok(casing.length >= 6);
    assert.ok(casing.every((d) => d.severity === "warning"));
    assert.equal(diagnostics.filter((d) => d.severity === "error").length, 0);
    assert.equal(document.elements.find((e) => e.type === "action").kind, "Action");
  });

  it("warns on lowercase structural directives with a suggestion", () => {
    const { diagnostics } = validate("flow: Sign in\n");
    const unknown = diagnostics.find((d) => d.code === "FS016");
    assert.ok(unknown);
    assert.equal(unknown.severity, "warning");
    assert.match(unknown.message, /Did you mean "Flow"/);
  });

  it("warns on incorrectly cased section directives", () => {
    const { diagnostics } = validate(
      "Flow Demo\n  Action: Demo\n  Id: demo.action\n  receives\n    Input\n"
    );
    const unknown = diagnostics.find((d) => d.code === "FS016");
    assert.ok(unknown);
    assert.match(unknown.message, /Did you mean "Receives"/);
  });

  it("warns on near-miss forms such as ACTIONs", () => {
    const { diagnostics } = validate("Flow Demo\n  ACTIONs: Send login code\n");
    const unknown = diagnostics.find((d) => d.code === "FS016");
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
    assert.ok(diagnostics.filter((d) => d.code === "FS016").length >= 4);
    assert.equal(document.elements.find((e) => e.type === "flow").kind, "Flow");
    assert.equal(document.elements.find((e) => e.type === "flow").id, "deprecated.answer-message");
  });
});
