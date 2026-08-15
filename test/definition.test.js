const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveGoToDefinitions,
  getGoToTargetRange,
  getStructuralNameRange,
  findGoToAtPosition,
  referencedGoToDestinations,
  renameGoToReferences,
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
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to Bootstrap conversation", "  Action Bootstrap conversation", "    Steps", "      Prepare"].join("\n");

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
      startColumn: 13,
      endColumn: 35,
    });
  });

  it("resolves a Screen in another file", () => {
    const a = ["Flow Sign in", "  Action Start", "    Steps", "      Go to Conversation"].join("\n");
    const b = ["Flow Chat", "  Screen Conversation"].join("\n");

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
    const a = ["Flow First", "  Action Start", "    Steps", "      Go to Second journey"].join("\n");
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
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to conversation.bootstrap", "  Action Bootstrap conversation", "  Id conversation.bootstrap", "    Steps", "      Prepare"].join("\n");

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
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to Missing target"].join("\n");

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
      startColumn: 13,
      endColumn: 27,
    });
  });

  it("does not resolve an Action nested under When", () => {
    const source = ["Flow Demo", "  When the Premium paywall opens", "    Action Load subscription offerings", "    Id premium.load-offerings", "      Steps", "        Load offerings", "  Action Continue", "    Steps", "      Go to Load subscription offerings"].join("\n");

    const result = resolveGoToDefinitions(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 9,
        column: targetColumn(source, 9),
      }
    );

    assert.ok(result);
    assert.deepEqual(result.definitions, []);
  });

  it("returns all matching targets when ambiguous", () => {
    const a = ["Flow A", "  Screen Conversation", "  Action Start", "    Steps", "      Go to Conversation"].join("\n");
    const b = ["Flow B", "  Screen Conversation"].join("\n");

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
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to Bootstrap conversation", "  Action Bootstrap conversation", "    Steps", "      Prepare"].join("\n");

    // Column of the 'G' in "Go to" (1-based): indent 4 spaces + 1
    const result = resolveGoToDefinitions(
      [{ source, filePath: "demo.flowspec" }],
      { filePath: "demo.flowspec", line: 4, column: 5 }
    );

    assert.equal(result, null);
  });

  it("originRange spans the full multi-word target", () => {
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to Bootstrap conversation", "  Action Bootstrap conversation", "    Steps", "      Prepare"].join("\n");

    // Click on the second word ("conversation")
    const result = resolveGoToDefinitions(
      [{ source, filePath: "demo.flowspec" }],
      { filePath: "demo.flowspec", line: 4, column: 22 }
    );

    assert.ok(result);
    assert.deepEqual(result.originRange, {
      line: 4,
      startColumn: 13,
      endColumn: 35,
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
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to Conversation", "  Screen Conversation"].join("\n");
    const { root, lines } = parseTree(source, "demo.flowspec");

    assert.equal(findGoToAtPosition(root, lines, 4, 5), null);
    const hit = findGoToAtPosition(root, lines, 4, 13);
    assert.ok(hit);
    assert.equal(hit.ref, "Conversation");
  });
});

describe("referenced Go to destinations", () => {
  it("marks Flow, Screen, and Action lines that a Go to resolves to", () => {
    const source = [
      "Flow Demo",
      "  Screen Conversation",
      "    Action Send",
      "      Steps",
      "        Go to Conversation",
      "  Action Unused",
      "    Steps",
      "      Prepare",
    ].join("\n");

    const destinations = referencedGoToDestinations(
      [{ source, filePath: "demo.flowspec" }],
      "demo.flowspec"
    );

    assert.equal(destinations.length, 1);
    assert.equal(destinations[0].line, 2);
    assert.deepEqual(destinations[0].references, [
      {
        filePath: "demo.flowspec",
        line: 5,
        statement: "Go to Conversation",
        ref: "Conversation",
        container: "Send",
      },
    ]);
  });

  it("includes destinations referenced from another file", () => {
    const a = ["Flow Sign in", "  Action Start", "    Steps", "      Go to Conversation"].join("\n");
    const b = ["Flow Chat", "  Screen Conversation"].join("\n");
    const files = [
      { source: a, filePath: "sign-in.flowspec" },
      { source: b, filePath: "conversation.flowspec" },
    ];

    const destinations = referencedGoToDestinations(files, "conversation.flowspec");
    assert.equal(destinations.length, 1);
    assert.equal(destinations[0].line, 2);
    assert.deepEqual(destinations[0].references, [
      {
        filePath: "sign-in.flowspec",
        line: 4,
        statement: "Go to Conversation",
        ref: "Conversation",
        container: "Start",
      },
    ]);
    assert.deepEqual(referencedGoToDestinations(files, "sign-in.flowspec"), []);
  });

  it("dedupes a destination targeted by multiple Go to statements", () => {
    const source = [
      "Flow Demo",
      "  Screen Conversation",
      "    Action Send",
      "      Steps",
      "        Go to Conversation",
      "    Action Later",
      "      Steps",
      "        Go to Conversation",
    ].join("\n");

    const destinations = referencedGoToDestinations(
      [{ source, filePath: "demo.flowspec" }],
      "demo.flowspec"
    );

    assert.equal(destinations.length, 1);
    assert.equal(destinations[0].line, 2);
    assert.deepEqual(
      destinations[0].references.map((reference) => reference.line),
      [5, 8]
    );
  });
});

/**
 * 1-based name range for a structural directive on `line`.
 * @param {string} source
 * @param {number} line
 * @param {string} filePath
 */
function nameRange(source, line, filePath = "demo.flowspec") {
  const { root, lines } = parseTree(source, filePath);
  /** @type {object|null} */
  let node = null;
  walkNodes(root, (candidate) => {
    if (
      candidate.location?.line === line &&
      (candidate.type === "flow" ||
        candidate.type === "screen" ||
        candidate.type === "action")
    ) {
      node = candidate;
    }
  });
  assert.ok(node, `expected structural node on line ${line}`);
  const range = getStructuralNameRange(lines[line - 1], node);
  assert.ok(range, "expected name range");
  return range;
}

describe("rename Go to references", () => {
  it("renames unique Screen name references in the same file", () => {
    const source = [
      "Flow Demo",
      "  Screen Conversation",
      "    Action Send",
      "      Steps",
      "        Go to Conversation",
    ].join("\n");
    const range = nameRange(source, 2);

    const result = renameGoToReferences(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 2,
        startColumn: range.startColumn,
        endColumn: range.endColumn,
        replacementText: "Chat",
      }
    );

    assert.equal(result.field, "name");
    assert.equal(result.oldValue, "Conversation");
    assert.equal(result.newValue, "Chat");
    assert.deepEqual(result.edits, [
      {
        filePath: "demo.flowspec",
        line: 5,
        startColumn: 15,
        endColumn: 27,
        newText: "Chat",
      },
    ]);
  });

  it("renames an Id reference without touching name references", () => {
    const source = [
      "Flow Demo",
      "  Screen Conversation",
      "  Id chat.conversation",
      "    Action Send",
      "      Steps",
      "        Go to chat.conversation",
      "    Action Later",
      "      Steps",
      "        Go to Conversation",
    ].join("\n");

    const result = renameGoToReferences(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 3,
        startColumn: 6,
        endColumn: 23,
        replacementText: "chat.main",
      }
    );

    assert.equal(result.field, "id");
    assert.equal(result.oldValue, "chat.conversation");
    assert.equal(result.newValue, "chat.main");
    assert.equal(result.edits.length, 1);
    assert.equal(result.edits[0].line, 6);
    assert.equal(result.edits[0].newText, "chat.main");
  });

  it("renames references in another file", () => {
    const a = ["Flow Sign in", "  Action Start", "    Steps", "      Go to Conversation"].join("\n");
    const b = ["Flow Chat", "  Screen Conversation"].join("\n");
    const range = nameRange(b, 2, "conversation.flowspec");

    const result = renameGoToReferences(
      [
        { source: a, filePath: "sign-in.flowspec" },
        { source: b, filePath: "conversation.flowspec" },
      ],
      {
        filePath: "conversation.flowspec",
        line: 2,
        startColumn: range.startColumn,
        endColumn: range.endColumn,
        replacementText: "Inbox",
      }
    );

    assert.equal(result.edits.length, 1);
    assert.equal(result.edits[0].filePath, "sign-in.flowspec");
    assert.equal(result.edits[0].newText, "Inbox");
  });

  it("does not rename ambiguous name references", () => {
    const a = ["Flow A", "  Screen Conversation", "  Action Start", "    Steps", "      Go to Conversation"].join("\n");
    const b = ["Flow B", "  Screen Conversation"].join("\n");
    const range = nameRange(a, 2, "a.flowspec");

    const result = renameGoToReferences(
      [
        { source: a, filePath: "a.flowspec" },
        { source: b, filePath: "b.flowspec" },
      ],
      {
        filePath: "a.flowspec",
        line: 2,
        startColumn: range.startColumn,
        endColumn: range.endColumn,
        replacementText: "Inbox",
      }
    );

    assert.equal(result, null);
  });

  it("does not rename when the edit is on the directive keyword", () => {
    const source = [
      "Flow Demo",
      "  Screen Conversation",
      "    Action Send",
      "      Steps",
      "        Go to Conversation",
    ].join("\n");

    const result = renameGoToReferences(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 2,
        startColumn: 3,
        endColumn: 9,
        replacementText: "View",
      }
    );

    assert.equal(result, null);
  });

  it("renames an implicit Screen Action by name", () => {
    const source = [
      "Flow Voice",
      "  Screen Choose voice",
      "    Select voice",
      "      Receives",
      "        Voice",
      "      Outcome",
      "        Voice is ready",
      "    Action Next",
      "      Steps",
      "        Go to Select voice",
    ].join("\n");
    const range = nameRange(source, 3);

    const result = renameGoToReferences(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 3,
        startColumn: range.startColumn,
        endColumn: range.endColumn,
        replacementText: "Pick voice",
      }
    );

    assert.equal(result.oldValue, "Select voice");
    assert.equal(result.newValue, "Pick voice");
    assert.equal(result.edits.length, 1);
    assert.equal(result.edits[0].line, 10);
  });

  it("extends a name from a caret at the end of the field", () => {
    const source = [
      "Flow Demo",
      "  Screen Conversation",
      "    Action Send",
      "      Steps",
      "        Go to Conversation",
    ].join("\n");
    const range = nameRange(source, 2);

    const result = renameGoToReferences(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 2,
        startColumn: range.endColumn,
        endColumn: range.endColumn,
        replacementText: "s",
      }
    );

    assert.equal(result.newValue, "Conversations");
    assert.equal(result.edits[0].newText, "Conversations");
  });

  it("renames unique Flow and Action name references", () => {
    const source = [
      "Flow Demo",
      "  Action Start",
      "    Steps",
      "      Go to Demo",
      "      Go to Finish",
      "  Action Finish",
      "    Steps",
      "      Done",
    ].join("\n");
    const flowRange = nameRange(source, 1);
    const actionRange = nameRange(source, 6);

    const flowResult = renameGoToReferences(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 1,
        startColumn: flowRange.startColumn,
        endColumn: flowRange.endColumn,
        replacementText: "Onboarding",
      }
    );
    assert.equal(flowResult.oldValue, "Demo");
    assert.equal(flowResult.edits.length, 1);
    assert.equal(flowResult.edits[0].line, 4);
    assert.equal(flowResult.edits[0].newText, "Onboarding");

    const actionResult = renameGoToReferences(
      [{ source, filePath: "demo.flowspec" }],
      {
        filePath: "demo.flowspec",
        line: 6,
        startColumn: actionRange.startColumn,
        endColumn: actionRange.endColumn,
        replacementText: "Complete",
      }
    );
    assert.equal(actionResult.oldValue, "Finish");
    assert.equal(actionResult.edits.length, 1);
    assert.equal(actionResult.edits[0].line, 5);
    assert.equal(actionResult.edits[0].newText, "Complete");
  });

  it("returns null when the destination has no unique references", () => {
    const source = ["Flow Demo", "  Screen Conversation"].join("\n");
    const range = nameRange(source, 2);
    assert.equal(
      renameGoToReferences(
        [{ source, filePath: "demo.flowspec" }],
        {
          filePath: "demo.flowspec",
          line: 2,
          startColumn: range.startColumn,
          endColumn: range.endColumn,
          replacementText: "Chat",
        }
      ),
      null
    );
  });
});
