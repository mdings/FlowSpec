const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseTree, lintFlowSpecFile } = require("../lib");

function screenOf(source) {
  return parseTree(source).root.children[0].children.find((c) => c.type === "screen");
}

function hasCode(diagnostics, code) {
  return diagnostics.some((d) => d.code === code);
}

describe("Section structural directive", () => {
  it("parses Section directly inside Screen", () => {
    const source = ["Flow Demo", "  Screen Today", "    Section Sidebar", "      Shows", "        Navigation"].join("\n");
    const screen = screenOf(source);
    const section = screen.children.find((c) => c.type === "section");
    assert.ok(section);
    assert.equal(section.value, "Sidebar");
    assert.equal(section.children[0].type, "shows");
  });

  it("parses nested Section", () => {
    const source = ["Flow Demo", "  Screen Today", "    Section Main", "      Section Task list", "        Shows", "          Tasks", "      Section Inspector", "        Shows", "          Details"].join("\n");
    const main = screenOf(source).children.find((c) => c.type === "section");
    assert.equal(main.value, "Main");
    const nested = main.children.filter((c) => c.type === "section");
    assert.equal(nested.length, 2);
    assert.equal(nested[0].value, "Task list");
  });

  it("rejects Shows inside Section", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Section Sidebar", "      Shows", "        Inbox"].join("\n"),
      "a.flowspec"
    );
    assert.equal(hasCode(d, "FS007"), true);
  });

  it("promotes implicit Action inside Section", () => {
    const source = ["Flow Demo", "  Screen Today", "    Section Task list", "      Complete task", "        Steps", "          Mark task as completed"].join("\n");
    const section = screenOf(source).children.find((c) => c.type === "section");
    const action = section.children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(action.implicit, true);
    assert.equal(action.value, "Complete task");
  });

  it("allows explicit Action inside Section", () => {
    const source = ["Flow Demo", "  Screen Today", "    Section Task list", "      Action Complete task", "        Steps", "          Mark task as completed"].join("\n");
    const action = screenOf(source)
      .children.find((c) => c.type === "section")
      .children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(Boolean(action.implicit), false);
  });

  it("rejects Section with Shows", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Section Sidebar", "      Shows", "        Areas"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects Id inside Section", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Section Sidebar", "      Id today.sidebar", "      Shows", "        Areas"].join("\n"),
      "a.flowspec"
    );
    const err = d.find((x) => x.code === "FS019");
    assert.ok(err);
    assert.match(err.message, /Section/);
  });

  it("does not resolve Go to a Section name", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Section Sidebar", "      Shows", "        Areas", "  Action Jump", "    Steps", "      Go to Sidebar"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS014"));
  });

  it("rejects Section directly under Flow", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Section Sidebar", "    Shows", "      Areas"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS023"));
  });
});

describe("Layout structural directive", () => {
  it("parses Layout inside Screen with | -separated rows", () => {
    const source = ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content | Inspector", "    Section Sidebar", "    Section Content", "    Section Inspector"].join("\n");
    const screen = screenOf(source);
    const layout = screen.children.find((c) => c.type === "layout");
    assert.ok(layout);
    assert.equal(layout.children[0].type, "content");
    assert.equal(layout.children[0].value, "Sidebar | Content | Inspector");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS021"), false, JSON.stringify(d, null, 2));
  });

  it("parses Layout inside Section", () => {
    const source = ["Flow Demo", "  Screen Today", "    Section Main", "      Layout", "        Task list | Inspector", "      Section Task list", "      Section Inspector"].join("\n");
    const main = screenOf(source).children.find((c) => c.type === "section");
    assert.ok(main.children.find((c) => c.type === "layout"));
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS021"), false, JSON.stringify(d, null, 2));
  });

  it("rejects duplicate direct Layout", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content", "    Layout", "      Content", "    Section Sidebar", "    Section Content"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS018"));
  });

  it("preserves multiple layout rows and descriptive prose", () => {
    const source = ["Flow Demo", "  Screen Dashboard", "    Layout", "      Header across top", "      Navigation | Content", "      Status across bottom", "    Section Header", "    Section Navigation", "    Section Content", "    Section Status"].join("\n");
    const layout = screenOf(source).children.find((c) => c.type === "layout");
    assert.deepEqual(
      layout.children.filter((c) => c.type === "content").map((c) => c.value),
      ["Header across top", "Navigation | Content", "Status across bottom"]
    );
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS021"), false, JSON.stringify(d, null, 2));
  });

  it("allows Rules inside Layout", () => {
    const source = ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content", "      Rules", "        Sidebar can be collapsed", "    Section Sidebar", "    Section Content"].join("\n");
    const layout = screenOf(source).children.find((c) => c.type === "layout");
    assert.ok(layout.children.find((c) => c.type === "rules"));
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("allows When inside Layout with nested alternate Layout", () => {
    const source = ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content", "      When the user enters the mobile breakpoint", "        Layout", "          Sidebar", "          Content", "    Section Sidebar", "    Section Content"].join("\n");
    const layout = screenOf(source).children.find((c) => c.type === "layout");
    const when = layout.children.find((c) => c.type === "when");
    assert.ok(when);
    assert.equal(when.children[0].type, "layout");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS020"), false, JSON.stringify(d, null, 2));
  });

  it("rejects Layout inside unrelated When", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "  When something happens", "    Layout", "      Sidebar | Content", "    Section Sidebar", "    Section Content"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS020"));
  });

  it("rejects Layout inside Action", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Action Something", "    Layout", "      Sidebar | Content"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS020"));
  });

  it("rejects Id inside Layout", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Layout", "    Id today.layout", "      Sidebar | Content", "    Section Sidebar", "    Section Content"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS019"));
  });

  it("treats blank lines as meaningless for Layout parsing", () => {
    const withBlanks = ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content", "", "      Rules", "        Sidebar can be collapsed", "    Section Sidebar", "    Section Content"].join("\n");
    const withoutBlanks = ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content", "      Rules", "        Sidebar can be collapsed", "    Section Sidebar", "    Section Content"].join("\n");
    const a = screenOf(withBlanks).children.find((c) => c.type === "layout");
    const b = screenOf(withoutBlanks).children.find((c) => c.type === "layout");
    assert.equal(a.children.map((c) => c.type).join(","), b.children.map((c) => c.type).join(","));
    assert.equal(a.children[0].value, b.children[0].value);
  });

  it("warns on unresolved Layout Section reference", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content", "    Section Content"].join("\n"),
      "a.flowspec"
    );
    const warn = d.find((x) => x.code === "FS021");
    assert.ok(warn);
    assert.match(warn.message, /Sidebar/);
  });

  it("warns on ambiguous sibling Section reference", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Layout", "      Sidebar | Content", "    Section Sidebar", "    Section Sidebar", "    Section Content"].join("\n"),
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS022"));
  });

  it("does not resolve nested Section names from a parent Layout", () => {
    const d = lintFlowSpecFile(
      ["Flow Demo", "  Screen Today", "    Layout", "      Task list | Inspector", "    Section Main", "      Section Task list", "      Section Inspector"].join("\n"),
      "a.flowspec"
    );
    const unresolved = d.filter((x) => x.code === "FS021");
    assert.ok(unresolved.length >= 2, JSON.stringify(d, null, 2));
  });

  it("lints the today-layout fixture without errors", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "..", "examples", "fixtures", "today-layout.flowspec"),
      "utf8"
    );
    const d = lintFlowSpecFile(source, "examples/fixtures/today-layout.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
  });
});
