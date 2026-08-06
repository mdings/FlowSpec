const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { lintFlowSpecFile, lintFlowSpecProject, parse } = require("../lib");

const enterJackHunt = fs.readFileSync(
  path.join(__dirname, "..", "examples", "fixtures", "enter-jack-hunt.flowspec"),
  "utf8"
);

function codes(diagnostics) {
  return diagnostics.map((d) => d.code);
}

function hasCode(diagnostics, code) {
  return diagnostics.some((d) => d.code === code);
}

describe("FS001 File must start with Flow", () => {
  it("accepts a valid file beginning with Flow", () => {
    const d = lintFlowSpecFile("Flow Sign in\n", "a.flowspec");
    assert.equal(hasCode(d, "FS001"), false);
  });

  it("allows blank lines and comments before Flow", () => {
    const source = "# Authentication flow\n\nFlow Sign in\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS001"), false);
  });

  it("rejects a file beginning with Screen", () => {
    const d = lintFlowSpecFile("Screen Login\n", "a.flowspec");
    assert.ok(hasCode(d, "FS001"));
    assert.equal(d.find((x) => x.code === "FS001").severity, "error");
  });
});

describe("FS002 One top-level Flow per file", () => {
  it("rejects multiple top-level flows", () => {
    const source = "Flow One\nFlow Two\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS002"));
  });
});

describe("optional colons", () => {
  it("parses Flow with and without colon identically", () => {
    const a = parse("Flow Sign in\n");
    const b = parse("Flow: Sign in\n");
    assert.equal(a.elements[0].name, "Sign in");
    assert.equal(b.elements[0].name, "Sign in");
  });
});

describe("FS004 / FS005 Id rules", () => {
  it("accepts valid optional Ids", () => {
    const source = "Flow Sign in\nId authentication.sign-in\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS004"), false);
    assert.equal(hasCode(d, "FS005"), false);
  });

  it("rejects invalid Id format", () => {
    const d = lintFlowSpecFile(
      "Flow Sign in\nId Authentication.SignIn\n",
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS005"));
  });

  it("rejects orphaned Id", () => {
    const source = "Flow Sign in\nRules\n  Email must be valid\nId authentication.send-login-code\n";
    // Rules outside action is also FS007; Id after Rules is orphaned FS004
    const d = lintFlowSpecFile(
      "Flow X\nAction Send login code\nRules\n  Email must be valid\n\nId authentication.send-login-code\n",
      "a.flowspec"
    );
    // Id after Rules under Action — Rules is a child of Action, Id sibling after Rules
    // associateIds: previous sibling is Rules section, not structural → orphaned FS004
    assert.ok(hasCode(d, "FS004"));
  });

  it("rejects Id after Rules block as orphaned", () => {
    const source = [
      "Flow Demo",
      "Action Send login code",
      "  Rules",
      "    Email must be valid",
      "Id authentication.send-login-code",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS004"));
  });
});

describe("FS006 Duplicate Id", () => {
  it("rejects duplicate Ids in one file", () => {
    const source = [
      "Flow Demo",
      "Action One",
      "Id shared.id",
      "Action Two",
      "Id shared.id",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS006"));
  });

  it("rejects duplicate Ids across files", () => {
    const d = lintFlowSpecProject([
      {
        filePath: "a.flowspec",
        source: "Flow A\nId shared.id\n",
      },
      {
        filePath: "b.flowspec",
        source: "Flow B\nId shared.id\n",
      },
    ]);
    assert.ok(hasCode(d, "FS006"));
    const dup = d.find((x) => x.code === "FS006");
    assert.ok(dup.relatedLocations?.length);
  });
});

describe("FS007 / FS008 / FS009 action sections", () => {
  it("allows all action sections to be optional", () => {
    const source = [
      "Flow Demo",
      "Action Load cart",
      "  Steps",
      "    Retrieve the cart",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false);
    assert.equal(hasCode(d, "FS008"), false);
  });

  it("rejects a section outside an action", () => {
    const source = "Flow Demo\nScreen Login\nShows\n  Login button\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects a duplicate section", () => {
    const source = [
      "Flow Demo",
      "Action Create response",
      "  Steps",
      "    Interpret the message",
      "  Steps",
      "    Generate the response",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS008"));
  });

  it("warns on incorrect section order", () => {
    const source = [
      "Flow Demo",
      "Action Load cart",
      "  Outcome",
      "    Cart is available",
      "  Steps",
      "    Retrieve the cart",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const order = d.find((x) => x.code === "FS009");
    assert.ok(order);
    assert.equal(order.severity, "warning");
  });
});

describe("FS010 Empty Action", () => {
  it("warns on empty action", () => {
    const d = lintFlowSpecFile("Flow Demo\nAction Load cart\n", "a.flowspec");
    const empty = d.find((x) => x.code === "FS010");
    assert.ok(empty);
    assert.equal(empty.severity, "warning");
  });

  it("does not treat Id alone as meaningful content", () => {
    const d = lintFlowSpecFile(
      "Flow Demo\nAction Load cart\nId cart.load\n",
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS010"));
  });
});

describe("FS011 At the same time placement", () => {
  it("accepts At the same time inside Steps", () => {
    const source = [
      "Flow Demo",
      "Action Prepare conversation",
      "  Steps",
      "    At the same time",
      "      Load the cart",
      "      Register the device",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS011"), false);
  });

  it("rejects At the same time outside Steps", () => {
    const source = [
      "Flow Demo",
      "Screen Conversation",
      "At the same time",
      "  Load the cart",
      "  Register the device",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS011"));
  });
});

describe("FS012 Control-flow placement", () => {
  it("accepts Once directly inside a flow", () => {
    const source = [
      "Flow Demo",
      "Once product results are available",
      "  Action Show results",
      "    Steps",
      "      Show products",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS012"), false);
  });

  it("accepts If directly inside a screen", () => {
    const source = [
      "Flow Demo",
      "Screen Login",
      "If the user is signed in",
      "  Go to Conversation",
      "Action Conversation",
      "  Steps",
      "    Continue",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS012"), false);
  });

  it("rejects control flow inside Rules", () => {
    const source = [
      "Flow Demo",
      "Action Demo",
      "  Rules",
      "    If the user is anonymous",
      "      Block access",
    ].join("\n");
    // "If the user is anonymous" as content under Rules — should NOT be parsed as If
    // because... wait, classifyLine will match FLOW_CONTROL_RE for "If ..."
    // And If will be a child of Rules if indented more than Rules.
    // Actually: Rules at indent 2, If at indent 4 → If is child of Rules → FS012
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS012"));
  });
});

describe("FS013 Otherwise matching", () => {
  it("accepts matched If and Otherwise", () => {
    const source = [
      "Flow Demo",
      "Action Verify",
      "  Steps",
      "    If the code is valid",
      "      Go to Conversation",
      "    Otherwise",
      "      Show an invalid code error",
      "Action Conversation",
      "  Steps",
      "    Continue",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS013"), false);
  });

  it("rejects orphaned Otherwise", () => {
    const source = [
      "Flow Demo",
      "Action Verify",
      "  Steps",
      "    Otherwise",
      "      Show an error",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS013"));
  });
});

describe("FS014 / FS015 Go to resolution", () => {
  it("resolves Go to by name", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to Conversation",
      "Screen Conversation",
      "Action Conversation helper",
      "  Steps",
      "    Continue",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS014"), false);
    assert.equal(hasCode(d, "FS015"), false);
  });

  it("resolves Go to by ID", () => {
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
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS014"), false);
  });

  it("warns on unresolved Go to", () => {
    const source = [
      "Flow Demo",
      "Action Start",
      "  Steps",
      "    Go to Missing target",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const unresolved = d.find((x) => x.code === "FS014");
    assert.ok(unresolved);
    assert.equal(unresolved.severity, "warning");
    assert.match(unresolved.message, /Unresolved Go to target "Missing target"/);
  });

  it("warns on ambiguous Go to", () => {
    const source = [
      "Flow Demo",
      "Screen Conversation",
      "Action Conversation",
      "  Steps",
      "    Continue",
      "Action Start",
      "  Steps",
      "    Go to Conversation",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS015"));
  });
});

describe("FS016 directive casing and prose", () => {
  it("does not flag directive words inside prose", () => {
    const source = [
      "Flow Demo",
      "Action Demo",
      "Id demo.action",
      "  Rules",
      "    Only show this when product results are available",
      "    Do not run if the user is anonymous",
      "    Follow the rules in the brand guide",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS016"), false);
  });

  it("warns on incorrect directive casing", () => {
    const d = lintFlowSpecFile("flow Sign in\n", "a.flowspec");
    const unknown = d.find((x) => x.code === "FS016");
    assert.ok(unknown);
    assert.equal(unknown.severity, "warning");
    assert.match(unknown.message, /Did you mean "Flow"/);
  });

  it("ignores comments containing directives", () => {
    const source = "# Flow should be ignored\n# Action ignored\nFlow Sign in\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS016"), false);
    assert.equal(hasCode(d, "FS001"), false);
  });
});

describe("canonical multi-file fixture", () => {
  it("lints enter-jack-hunt without errors or unresolved references", () => {
    const d = lintFlowSpecFile(enterJackHunt, "examples/fixtures/enter-jack-hunt.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    assert.equal(hasCode(d, "FS014"), false, JSON.stringify(d, null, 2));
    assert.equal(hasCode(d, "FS015"), false, JSON.stringify(d, null, 2));
  });
});
