const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveGoToDefinitions,
  getGoToTargetRange,
  findGoToAtPosition,
} = require("../lib");
const { parseTree, walkNodes } = require("../lib/parse");

/**
 * Column on the target text for a Go to line (1-based, first character of target).
 * @param {string} source
 * @param {number} line 1-based
 */
function targetColumn(source, line) {
  const lines = source.split(/\r?\n/);
  const lineText = lines[line - 1];
  const { root } = parseTree(source, "tmp.flowspec");
  /** @type {object|null} */
  let goTo = null;
  walkNodes(root, (node) => {
    if (node.type === "goTo" && node.location.line === line) goTo = node;
  });
  assert.ok(goTo, `expected Go to on line ${line}`);
  const range = getGoToTargetRange(lineText, goTo.value);
  assert.ok(range, "expected target range");
  return range.startColumn;
}

/**
 * @param {ReturnType<typeof resolveGoToDefinitions>} result
 */
function defs(result) {
  assert.ok(result);
  return result.definitions;
}

describe("Go to definition resolution", () => {
  it("resolves an Action in the same file", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to Bootstrap conversation",
      "Action Bootstrap conversation",
      "  Steps",
      "    Prepare",
    ].join("\n");

    const result = resolveGoToDefinitions(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 4,
        column: targetColumn(source, 4),
      }
    );

    const matches = defs(result);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].kind, "Action");
    assert.equal(matches[0].name, "Bootstrap conversation");
    assert.equal(matches[0].filePath, "demo.flowspec");
    assert.equal(matches[0].line, 5);
    assert.deepEqual(result.originRange, {
      line: 4,
      startColumn: 11,
      endColumn: 33,
    });
  });

  it("resolves a Screen in another file", () => {
    const a = [
      "Flow Sign in",
      "Action Start",
      "  Steps",
      "    Go to Conversation",
    ].join("\n");
    const b = ["Flow Chat", "Screen Conversation"].join("\n");

    const matches = defs(
      resolveGoToDefinitions(
        [
          { source: a, filePath: "sign-in.flowspec" },
          { source: b, filePath: "conversation.flowspec" },
        ],
        {
          filePath: "sign-in.flowspec",
          line: 4,
          column: targetColumn(a, 4),
        }
      )
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].kind, "Screen");
    assert.equal(matches[0].name, "Conversation");
    assert.equal(matches[0].filePath, "conversation.flowspec");
    assert.equal(matches[0].line, 2);
  });

  it("resolves a Flow in another file", () => {
    const a = [
      "Flow First",
      "Action Start",
      "  Steps",
      "    Go to Second journey",
    ].join("\n");
    const b = "Flow Second journey\n";

    const matches = defs(
      resolveGoToDefinitions(
        [
          { source: a, filePath: "a.flowspec" },
          { source: b, filePath: "b.flowspec" },
        ],
        {
          filePath: "a.flowspec",
          line: 4,
          column: targetColumn(a, 4),
        }
      )
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].kind, "Flow");
    assert.equal(matches[0].name, "Second journey");
    assert.equal(matches[0].filePath, "b.flowspec");
    assert.equal(matches[0].line, 1);
  });

  it("resolves by Id", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to conversation.bootstrap",
      "Action Bootstrap conversation",
      "Id conversation.bootstrap",
      "  Steps",
      "    Prepare",
    ].join("\n");

    const matches = defs(
      resolveGoToDefinitions(
        [{ source, filePath: "demo.flowspec" }],
        {
          filePath: "demo.flowspec",
          line: 4,
          column: targetColumn(source, 4),
        }
      )
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].kind, "Action");
    assert.equal(matches[0].name, "Bootstrap conversation");
    assert.equal(matches[0].id, "conversation.bootstrap");
    assert.equal(matches[0].line, 5);
  });

  it("returns no definitions for unresolved targets", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to Missing target",
    ].join("\n");

    const result = resolveGoToDefinitions(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 4,
        column: targetColumn(source, 4),
      }
    );

    assert.ok(result);
    assert.deepEqual(result.definitions, []);
    assert.deepEqual(result.originRange, {
      line: 4,
      startColumn: 11,
      endColumn: 25,
    });
  });

  it("returns all matching targets when ambiguous", () => {
    const a = [
      "Flow A",
      "Screen Conversation",
      "Action Start",
      "  Steps",
      "    Go to Conversation",
    ].join("\n");
    const b = ["Flow B", "Screen Conversation"].join("\n");

    const matches = defs(
      resolveGoToDefinitions(
        [
          { source: a, filePath: "a.flowspec" },
          { source: b, filePath: "b.flowspec" },
        ],
        {
          filePath: "a.flowspec",
          line: 5,
          column: targetColumn(a, 5),
        }
      )
    );

    assert.equal(matches.length, 2);
    const files = matches.map((m) => m.filePath).sort();
    assert.deepEqual(files, ["a.flowspec", "b.flowspec"]);
    assert.ok(matches.every((m) => m.kind === "Screen" && m.name === "Conversation"));
  });

  it("does not resolve when the cursor is on the Go to keyword", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to Bootstrap conversation",
      "Action Bootstrap conversation",
      "  Steps",
      "    Prepare",
    ].join("\n");

    // Column of the 'G' in "Go to" (1-based): indent 4 spaces + 1
    const result = resolveGoToDefinitions(
      [{ source, filePath: "demo.flowspec" }],
      { filePath: "demo.flowspec", line: 4, column: 5 }
    );

    assert.equal(result, null);
  });

  it("originRange spans the full multi-word target", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to Bootstrap conversation",
      "Action Bootstrap conversation",
      "  Steps",
      "    Prepare",
    ].join("\n");

    // Click on the second word ("conversation")
    const result = resolveGoToDefinitions(
      [{ source, filePath: "demo.flowspec" }],
      { filePath: "demo.flowspec", line: 4, column: 22 }
    );

    assert.ok(result);
    assert.deepEqual(result.originRange, {
      line: 4,
      startColumn: 11,
      endColumn: 33,
    });
    assert.equal(result.definitions.length, 1);
  });

  it("getGoToTargetRange covers only the target text", () => {
    const range = getGoToTargetRange(
      "    Go to Bootstrap conversation",
      "Bootstrap conversation"
    );
    assert.deepEqual(range, { startColumn: 11, endColumn: 33 });
  });

  it("findGoToAtPosition ignores positions outside the target", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to Conversation",
      "Screen Conversation",
    ].join("\n");
    const { root, lines } = parseTree(source, "demo.flowspec");

    assert.equal(findGoToAtPosition(root, lines, 4, 5), null);
    const hit = findGoToAtPosition(root, lines, 4, 11);
    assert.ok(hit);
    assert.equal(hit.ref, "Conversation");
  });
});
