const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { lintFlowSpecFile, lintFlowSpecProject, parse } = require("../lib");

const enterJackHunt = fs.readFileSync(
  path.join(__dirname, "..", "examples", "fixtures", "enter-jack-hunt.flowspec"),
  "utf8"
);

const socialLoginApple = fs.readFileSync(
  path.join(__dirname, "..", "examples", "fixtures", "social-login-apple.flowspec"),
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
    const source = "Flow One\n  Flow Two\n";
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
    const source = "Flow Sign in\n  Rules\n    Email must be valid\n  Id authentication.send-login-code\n";
    // Rules outside action is also FS007; Id after Rules is orphaned FS004
    const d = lintFlowSpecFile(
      "Flow X\n  Action Send login code\n  Rules\n    Email must be valid\n\n  Id authentication.send-login-code\n",
      "a.flowspec"
    );
    // Id after Rules under Action — Rules is a child of Action, Id sibling after Rules
    // associateIds: previous sibling is Rules section, not structural → orphaned FS004
    assert.ok(hasCode(d, "FS004"));
  });

  it("rejects Id after Rules block as orphaned", () => {
    const source = ["Flow Demo", "  Action Send login code", "    Rules", "      Email must be valid", "  Id authentication.send-login-code"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS004"));
  });
});

describe("FS006 Duplicate Id", () => {
  it("rejects duplicate Ids in one file", () => {
    const source = ["Flow Demo", "  Action One", "  Id shared.id", "  Action Two", "  Id shared.id"].join("\n");
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

describe("FS007 / FS008 / FS009 behavioral sections", () => {
  it("allows all action sections to be optional", () => {
    const source = ["Flow Demo", "  Action Load cart", "    Steps", "      Retrieve the cart"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false);
    assert.equal(hasCode(d, "FS008"), false);
  });

  it("does not attach same-indent Shows to a preceding Screen (Flow owns the sibling)", () => {
    const source = [
      "Flow Email login",
      "",
      "  Screen Enter email",
      "  Shows",
      "    Email address input",
      "    Continue button",
    ].join("\n");
    const { parseTree } = require("../lib/parse");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const screen = flow.children.find((c) => c.type === "screen");
    const shows = flow.children.find((c) => c.type === "shows");
    assert.ok(screen);
    assert.ok(shows);
    assert.equal(shows.parent.type, "flow");
    assert.equal(
      screen.children.some((c) => c.type === "shows"),
      false
    );
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("allows indented Shows inside a Screen", () => {
    const source = ["Flow Email login", "", "  Screen Enter email", "", "    Shows", "      Email address input", "      Continue button"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("allows Shows inside an Action", () => {
    const source = ["Flow Demo", "  Action Show login options", "    Shows", "      Login button"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false);
  });

  it("does not attach same-indent Shows to a preceding Action", () => {
    const source = [
      "Flow Demo",
      "  Action Show login options",
      "  Shows",
      "    Login button",
      "    Continue with Apple",
    ].join("\n");
    const { parseTree } = require("../lib/parse");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const action = flow.children.find((c) => c.type === "action");
    const shows = flow.children.find((c) => c.type === "shows");
    assert.ok(action);
    assert.ok(shows);
    assert.equal(shows.parent.type, "flow");
    assert.equal(action.children.some((c) => c.type === "shows"), false);
  });

  it("does not attach same-indent Rules to a preceding Action", () => {
    const source = [
      "Flow Email login",
      "",
      "  Action Send login code",
      "  Rules",
      "    Email address must be valid",
    ].join("\n");
    const { parseTree } = require("../lib/parse");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    const action = flow.children.find((c) => c.type === "action");
    const rules = flow.children.find((c) => c.type === "rules");
    assert.ok(action);
    assert.ok(rules);
    assert.equal(rules.parent.type, "flow");
    assert.equal(action.children.some((c) => c.type === "rules"), false);
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("allows indented Rules inside an Action", () => {
    const source = ["Flow Email login", "", "  Action Send login code", "", "    Rules", "      Email address must be valid"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("allows Shows nested under control-flow inside an Action", () => {
    const source = ["Flow Demo", "  Action Complete sign-in", "    If authentication succeeds", "      Shows", "        Signed-in home", "      Go to Conversation"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("rejects document-level Shows (must be indented under the Flow)", () => {
    const source = "Flow Demo\nShows\n  Login button\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS024"), JSON.stringify(d, null, 2));
    assert.match(d.find((x) => x.code === "FS024").message, /Shows/);
  });

  it("rejects document-level Receives after an unindented Screen", () => {
    const source = "Flow Demo\nScreen Login\nReceives\n  User\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS024"), JSON.stringify(d, null, 2));
    assert.ok(d.some((x) => x.code === "FS024" && /Screen/.test(x.message)));
    assert.ok(d.some((x) => x.code === "FS024" && /Receives/.test(x.message)));
  });

  it("rejects a duplicate section", () => {
    const source = ["Flow Demo", "  Action Create response", "    Steps", "      Interpret the message", "    Steps", "      Generate the response"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS008"));
  });

  it("rejects duplicate Shows on a Screen", () => {
    const source = ["Flow Demo", "  Screen Login", "    Shows", "      Login button", "    Shows", "      Other button"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS008"));
  });

  it("allows Screen Shows plus nested Action Shows", () => {
    const source = ["Flow Demo", "  Screen Login", "    Shows", "      Login options", "    Action Show login error", "      Shows", "        Error message"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
    assert.equal(hasCode(d, "FS008"), false, JSON.stringify(d, null, 2));
  });

  it("warns on incorrect section order", () => {
    const source = ["Flow Demo", "  Action Load cart", "    Outcome", "      Cart is available", "    Steps", "      Retrieve the cart"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const order = d.find((x) => x.code === "FS009");
    assert.ok(order);
    assert.equal(order.severity, "warning");
  });
});

describe("Uses section", () => {
  it("parses and accepts Uses inside an Action", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Uses", "      Provider OpenAI", "      Model GPT-5", "      Reasoning effort high", "    Steps", "      Generate the assistant response", "    Outcome", "      Assistant response is available"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
    assert.equal(hasCode(d, "FS008"), false);
    assert.equal(hasCode(d, "FS009"), false);
    const doc = parse(source);
    const action = doc.elements.find((e) => e.type === "action");
    const uses = action.sections.find((s) => s.name === "Uses");
    assert.ok(uses);
    assert.equal(uses.items.length, 3);
    assert.equal(uses.key, "uses");
  });

  it("allows Action with only Uses and Steps", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Uses", "      Model GPT-5", "    Steps", "      Generate the response", "    Outcome", "      Response is available"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
  });

  it("allows Action without Uses", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Steps", "      Generate the response"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false);
  });

  it("rejects duplicate Uses", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Uses", "      Provider OpenAI", "    Uses", "      Model GPT-5", "    Steps", "      Generate the response"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const dup = d.find((x) => x.code === "FS008");
    assert.ok(dup);
    assert.match(dup.message, /Duplicate "Uses"/);
    assert.match(dup.message, /Combine execution dependencies/);
  });

  it("accepts Uses before Steps without ordering warning", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Uses", "      Model GPT-5", "    Steps", "      Generate the response"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS009"), false);
  });

  it("warns when Uses appears after Steps", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Steps", "      Generate the response", "    Uses", "      Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const order = d.find((x) => x.code === "FS009");
    assert.ok(order);
    assert.match(order.message, /Uses/);
  });

  it("warns when Outcome is not final even with Uses present", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Uses", "      Model GPT-5", "    Outcome", "      Response is available", "    Steps", "      Generate the response"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS017"));
    assert.ok(hasCode(d, "FS009"));
  });

  it("allows Uses directly inside Flow when indented", () => {
    const source = ["Flow Conversation", "    Uses", "      Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("rejects Uses directly inside Screen", () => {
    const source = ["Flow Demo", "  Screen Conversation", "    Uses", "      Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects Uses nested inside Receives", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Receives", "      Uses", "        Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects Uses nested inside Rules", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Rules", "      Uses", "        Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects Uses nested inside Steps", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Steps", "      Uses", "        Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects Uses nested inside Shows", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Shows", "      Uses", "        Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects Uses nested inside Outcome", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Outcome", "      Uses", "        Model GPT-5"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS007"));
  });

  it("rejects document-level Uses after an Action", () => {
    const source = "Flow Demo\nAction Generate response\nUses\n  Model GPT-5\n";
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS024"), JSON.stringify(d, null, 2));
  });

  it("does not treat prose 'uses' as a Uses section", () => {
    const source = ["Flow Demo", "  Action Generate response", "    Rules", "      The response uses available product context", "    Steps", "      Generate the response"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false);
    const doc = parse(source);
    const action = doc.elements.find((e) => e.type === "action");
    assert.equal(
      action.sections.some((s) => s.name === "Uses"),
      false
    );
  });
});

describe("FS010 Empty Action", () => {
  it("warns on empty action", () => {
    const d = lintFlowSpecFile("Flow Demo\n  Action Load cart\n", "a.flowspec");
    const empty = d.find((x) => x.code === "FS010");
    assert.ok(empty);
    assert.equal(empty.severity, "warning");
  });

  it("does not treat Id alone as meaningful content", () => {
    const d = lintFlowSpecFile(
      "Flow Demo\n  Action Load cart\n  Id cart.load\n",
      "a.flowspec"
    );
    assert.ok(hasCode(d, "FS010"));
  });
});

describe("FS011 At the same time placement", () => {
  it("accepts At the same time inside Steps", () => {
    const source = ["Flow Demo", "  Action Prepare conversation", "    Steps", "      At the same time", "        Load the cart", "        Register the device"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS011"), false);
  });

  it("rejects At the same time outside Steps", () => {
    const source = ["Flow Demo", "  Screen Conversation", "  At the same time", "    Load the cart", "    Register the device"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS011"));
  });
});

describe("FS012 Control-flow placement", () => {
  it("accepts Once directly inside a flow", () => {
    const source = ["Flow Demo", "  Once product results are available", "    Action Show results", "      Steps", "        Show products"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS012"), false);
  });

  it("accepts If directly inside a screen", () => {
    const source = ["Flow Demo", "  Screen Login", "  If the user is signed in", "    Go to Conversation", "  Action Conversation", "    Steps", "      Continue"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS012"), false);
  });

  it("accepts If directly inside an Action", () => {
    const source = ["Flow Demo", "  Action Verify login", "    If the code is valid", "      Go to Conversation", "  Action Conversation", "    Steps", "      Continue"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS012"), false, JSON.stringify(d, null, 2));
  });

  it("accepts If ... fails directly inside an Action", () => {
    const source = ["Flow Demo", "  Action Social login with Apple", "    Steps", "      Authenticate the user", "    If authentication fails", "      Show a sign-in error"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS012"), false, JSON.stringify(d, null, 2));
  });

  it("accepts Once directly inside an Action", () => {
    const source = ["Flow Demo", "  Action Bootstrap", "    Once the session is ready", "      Start the conversation"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS012"), false, JSON.stringify(d, null, 2));
  });

  it("rejects control flow inside Receives", () => {
    const source = ["Flow Demo", "  Action Demo", "    Receives", "      If the user is anonymous", "        Block access"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS012"));
  });

  it("rejects control flow inside Rules", () => {
    const source = ["Flow Demo", "  Action Demo", "    Rules", "      If the user is anonymous", "        Block access"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS012"));
  });

  it("rejects control flow inside Shows", () => {
    const source = ["Flow Demo", "  Action Demo", "    Shows", "      If the cart is empty", "        Empty cart message"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS012"));
  });

  it("rejects control flow inside Outcome", () => {
    const source = ["Flow Demo", "  Action Verify login", "    Outcome", "      If the code is valid", "        User is signed in"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS012"));
  });
});

describe("FS013 Otherwise matching", () => {
  it("accepts matched If and Otherwise", () => {
    const source = ["Flow Demo", "  Action Verify", "    Steps", "      If the code is valid", "        Go to Conversation", "      Otherwise", "        Show an invalid code error", "  Action Conversation", "    Steps", "      Continue"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS013"), false);
  });

  it("accepts matching If and Otherwise directly inside an Action", () => {
    const source = ["Flow Demo", "  Action Verify login", "    If the code is valid", "      Go to Conversation", "    Otherwise", "      Show an invalid code error", "    Outcome", "      Login attempt is handled", "  Action Conversation", "    Steps", "      Continue"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS013"), false, JSON.stringify(d, null, 2));
    assert.equal(hasCode(d, "FS012"), false);
    assert.equal(hasCode(d, "FS017"), false);
  });

  it("rejects orphaned Otherwise", () => {
    const source = ["Flow Demo", "  Action Verify", "    Steps", "      Otherwise", "        Show an error"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS013"));
  });
});

describe("FS017 Outcome is final", () => {
  it("accepts Outcome as the final direct child", () => {
    const source = ["Flow Demo", "  Action Social login with Apple", "    Steps", "      Authenticate the user", "    If authentication fails", "      Show a sign-in error", "    Outcome", "      User is signed in"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS017"), false, JSON.stringify(d, null, 2));
  });

  it("warns when If ... fails appears after Outcome", () => {
    const source = ["Flow Demo", "  Action Social login with Apple", "    Outcome", "      User is signed in", "    If authentication fails", "      Show a sign-in error"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS017");
    assert.ok(warn);
    assert.equal(warn.severity, "warning");
    assert.match(warn.message, /Outcome should be the final section/);
    assert.match(warn.message, /If authentication fails/);
  });

  it("warns when Shows appears after Outcome", () => {
    const source = ["Flow Demo", "  Action Demo", "    Outcome", "      Done", "    Shows", "      Result"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS017");
    assert.ok(warn);
    assert.match(warn.message, /Move "Shows"/);
  });

  it("does not warn for nested content within Outcome", () => {
    const source = ["Flow Demo", "  Action Demo", "    Outcome", "      User is signed in", "      Cart remains available"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS017"), false, JSON.stringify(d, null, 2));
  });

  it("allows actions without an Outcome", () => {
    const source = ["Flow Demo", "  Action Social login with Apple", "    Steps", "      Authenticate the user", "    If authentication fails", "      Show a sign-in error"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS017"), false);
    assert.equal(hasCode(d, "FS012"), false);
  });
});

describe("FS101 Redundant Outcome", () => {
  it("warns when Outcome restates the Action name", () => {
    const source = ["Flow Demo", "  Action Select focus", "    Outcome", "      Focus is selected"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS101");
    assert.ok(warn);
    assert.equal(warn.severity, "warning");
    assert.match(warn.message, /Outcome may be redundant/);
    assert.match(warn.message, /Select focus/);
  });

  it("does not warn for a non-redundant Outcome", () => {
    const source = ["Flow Demo", "  Action Social login with Apple", "    Outcome", "      User is signed in"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS101"), false, JSON.stringify(d, null, 2));
  });
});

describe("FS102 Redundant Receives", () => {
  it("warns when Receives repeats an input already in the When trigger", () => {
    const source = ["Flow Demo", "  When the user selects a voice", "    Action Select voice", "      Receives", "        Voice"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS102");
    assert.ok(warn);
    assert.equal(warn.severity, "warning");
    assert.match(warn.message, /Receives Voice/);
    assert.match(warn.message, /already provides the voice/);
  });

  it("does not warn for unrelated Receives", () => {
    const source = ["Flow Demo", "  When the user becomes signed in", "    Action Enter conversation", "      Receives", "        Signed-in user"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS102"), false, JSON.stringify(d, null, 2));
  });
});

describe("FS103 Trigger repeats Action", () => {
  it("warns when When and Action describe the same interaction", () => {
    const source = ["Flow Demo", "  When the user selects a focus", "    Action Select focus", "      Outcome", "        Focus mode is active"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS103");
    assert.ok(warn);
    assert.equal(warn.severity, "warning");
    assert.match(warn.message, /same interaction/);
  });

  it("does not warn for unrelated When and Action", () => {
    const source = ["Flow Demo", "  When the user sends a message", "    Action Find relevant products", "      Steps", "        Search the catalog"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS103"), false, JSON.stringify(d, null, 2));
  });
});

describe("FS104 Repeated Rules", () => {
  it("warns when identical Rules appear across sibling Actions", () => {
    const source = ["Flow Demo", "  Action Start free meditation", "    Rules", "      User must be signed in", "      Creation is rate limited", "    Outcome", "      Meditation started", "  Action Start Premium meditation", "    Rules", "      User must be signed in", "      Creation is rate limited", "    Outcome", "      Meditation started"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS104");
    assert.ok(warn);
    assert.equal(warn.severity, "warning");
    assert.match(warn.message, /Rules are repeated across sibling Actions/);
  });

  it("does not warn for similar but non-identical Rules", () => {
    const source = ["Flow Demo", "  Action Start free meditation", "    Rules", "      User must be signed in", "      Creation is rate limited", "    Outcome", "      Meditation started", "  Action Start Premium meditation", "    Rules", "      User must be signed in", "      Premium entitlement is required", "    Outcome", "      Meditation started"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS104"), false, JSON.stringify(d, null, 2));
  });
});

describe("FS105 Single-step wrapper", () => {
  it("warns when an Action only wraps a single Step", () => {
    const source = ["Flow Demo", "  Action Gate Premium voice", "    Steps", "      Go to Premium paywall"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS105");
    assert.ok(warn);
    assert.equal(warn.severity, "warning");
    assert.match(warn.message, /only wraps a single Step/);
  });

  it("does not warn when an Action has one Step plus Outcome", () => {
    const source = ["Flow Demo", "  Action Bootstrap conversation", "    Steps", "      Prepare the initial conversation", "    Outcome", "      Conversation is ready"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS105"), false, JSON.stringify(d, null, 2));
  });
});

describe("implicit Actions under Screen", () => {
  it("allows Action sections under an implicit Screen interaction", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Select voice", "      Receives", "        Voice", "      If the voice requires Premium", "        Go to Premium paywall", "      Outcome", "        Voice is ready"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    assert.equal(hasCode(d, "FS007"), false);
  });

  it("resolves Go to an implicit Action by name", () => {
    const source = ["Flow Voice", "  Screen Choose voice", "    Select voice", "      Outcome", "        Voice is ready", "  Action Continue", "    Steps", "      Go to Select voice"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS014"), false, JSON.stringify(d, null, 2));
    assert.equal(hasCode(d, "FS015"), false);
  });

  it("lints the concise choose-focus fixture without errors or style noise", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "examples", "fixtures", "choose-focus.flowspec"),
      "utf8"
    );
    const d = lintFlowSpecFile(source, "examples/fixtures/choose-focus.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    for (const code of ["FS101", "FS102", "FS103", "FS104", "FS105", "FS106"]) {
      assert.equal(hasCode(d, code), false, code);
    }
  });
});

describe("Apple social-login example", () => {
  it("lints the complete Apple social-login action without errors", () => {
    const source = ["Flow Sign in", "", "  Action Social login with Apple", "", "    Steps", "      Open native Apple sign-in", "      Authenticate the user", "", "      If authentication succeeds", "        Store the user's name when provided", "        Store the user's email address when provided", "        Go to Conversation", "", "    If authentication fails", "      Show a sign-in error", "      Go to Login options", "", "    Outcome", "      User is signed in", "", "  Screen Conversation", "  Screen Login options"].join("\n");
    const d = lintFlowSpecFile(source, "social-login.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    assert.equal(hasCode(d, "FS012"), false);
    assert.equal(hasCode(d, "FS017"), false);
    assert.equal(hasCode(d, "FS014"), false);
  });

  it("rejects At the same time directly inside an Action", () => {
    const source = ["Flow Demo", "  Action Prepare", "    At the same time", "      Load the cart", "      Register the device"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS011"));
  });
});

describe("FS014 / FS015 Go to resolution", () => {
  it("resolves Go to by name", () => {
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to Conversation", "  Screen Conversation", "  Action Conversation helper", "    Steps", "      Continue"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS014"), false);
    assert.equal(hasCode(d, "FS015"), false);
  });

  it("resolves Go to by ID", () => {
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to conversation.bootstrap", "  Action Bootstrap conversation", "  Id conversation.bootstrap", "    Steps", "      Prepare"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS014"), false);
  });

  it("warns on unresolved Go to", () => {
    const source = ["Flow Demo", "  Action Start", "    Steps", "      Go to Missing target"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const unresolved = d.find((x) => x.code === "FS014");
    assert.ok(unresolved);
    assert.equal(unresolved.severity, "warning");
    assert.match(unresolved.message, /Unresolved Go to target "Missing target"/);
    assert.match(unresolved.message, /any loaded FlowSpec file/);
  });

  it("warns on ambiguous Go to", () => {
    const source = ["Flow Demo", "  Screen Conversation", "  Action Conversation", "    Steps", "      Continue", "  Action Start", "    Steps", "      Go to Conversation"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS015"));
  });

  it("resolves Go to a Screen defined in another file", () => {
    const d = lintFlowSpecProject([
      {
        filePath: "sign-in.flowspec",
        source: ["Flow Sign in", "  Action Continue", "    Steps", "      Go to Conversation"].join("\n"),
      },
      {
        filePath: "conversation.flowspec",
        source: ["Flow Chat", "  Screen Conversation"].join("\n"),
      },
    ]);
    assert.equal(hasCode(d, "FS014"), false, JSON.stringify(d, null, 2));
    assert.equal(hasCode(d, "FS015"), false, JSON.stringify(d, null, 2));
  });

  it("resolves Go to an Action Id defined in another file", () => {
    const d = lintFlowSpecProject([
      {
        filePath: "splash.flowspec",
        source: ["Flow Enter app", "  Action Enter conversation", "    Steps", "      Go to conversation.bootstrap"].join("\n"),
      },
      {
        filePath: "conversation.flowspec",
        source: ["Flow Chat", "  Action Bootstrap conversation", "  Id conversation.bootstrap", "    Steps", "      Prepare the conversation"].join("\n"),
      },
    ]);
    assert.equal(hasCode(d, "FS014"), false, JSON.stringify(d, null, 2));
  });

  it("resolves Go to a Flow defined in another file", () => {
    const d = lintFlowSpecProject([
      {
        filePath: "a.flowspec",
        source: ["Flow First", "  Action Handoff", "    Steps", "      Go to Second journey"].join("\n"),
      },
      {
        filePath: "b.flowspec",
        source: "Flow Second journey\n",
      },
    ]);
    assert.equal(hasCode(d, "FS014"), false, JSON.stringify(d, null, 2));
  });

  it("warns when the same display name exists in two files", () => {
    const d = lintFlowSpecProject([
      {
        filePath: "a.flowspec",
        source: ["Flow A", "  Screen Conversation", "  Action Start", "    Steps", "      Go to Conversation"].join("\n"),
      },
      {
        filePath: "b.flowspec",
        source: "Flow B\n  Screen Conversation\n",
      },
    ]);
    const ambiguous = d.find((x) => x.code === "FS015");
    assert.ok(ambiguous);
    assert.match(ambiguous.message, /a\.flowspec/);
    assert.match(ambiguous.message, /b\.flowspec/);
  });

  it("does not resolve Go to an Action nested under When", () => {
    const source = ["Flow Demo", "  When the Premium paywall opens", "    Action Load subscription offerings", "    Id premium.load-offerings", "      Steps", "        Load offerings", "  Action Continue", "    Steps", "      Go to Load subscription offerings", "      Go to premium.load-offerings"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const unresolved = d.filter((x) => x.code === "FS014");
    assert.equal(unresolved.length, 2, JSON.stringify(d, null, 2));
    assert.ok(
      unresolved.some((x) => /Load subscription offerings/.test(x.message))
    );
    assert.ok(unresolved.some((x) => /premium\.load-offerings/.test(x.message)));
    assert.match(unresolved[0].message, /top-level Flow, Screen, or Action/);
  });

  it("still resolves Go to an Action that is a direct child of a Screen", () => {
    const source = ["Flow Demo", "  Screen Premium paywall", "    Action Load subscription offerings", "    Id premium.load-offerings", "      Steps", "        Load offerings", "  Action Continue", "    Steps", "      Go to Load subscription offerings", "      Go to premium.load-offerings"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS014"), false, JSON.stringify(d, null, 2));
  });

  it("still indexes Ids on nested Actions for FS006 uniqueness", () => {
    const source = ["Flow Demo", "  When the Premium paywall opens", "    Action Load subscription offerings", "    Id premium.load-offerings", "      Steps", "        Load offerings", "  Action Other", "  Id premium.load-offerings", "    Steps", "      Continue"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS006"));
  });
});

describe("FS016 directive casing and prose", () => {
  it("does not flag directive words inside prose", () => {
    const source = ["Flow Demo", "  Action Demo", "  Id demo.action", "    Rules", "      Only show this when product results are available", "      Do not run if the user is anonymous", "      Follow the rules in the brand guide"].join("\n");
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

  it("lints social-login-apple without errors (action-level If ... fails)", () => {
    const d = lintFlowSpecFile(
      socialLoginApple,
      "examples/fixtures/social-login-apple.flowspec"
    );
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    assert.equal(hasCode(d, "FS012"), false);
    assert.equal(hasCode(d, "FS017"), false);
    assert.equal(hasCode(d, "FS014"), false);
  });

  it("lints bootstrap-conversation Uses example without errors", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "examples", "fixtures", "bootstrap-conversation.flowspec"),
      "utf8"
    );
    const d = lintFlowSpecFile(
      source,
      "examples/fixtures/bootstrap-conversation.flowspec"
    );
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    assert.equal(hasCode(d, "FS009"), false);
    assert.equal(hasCode(d, "FS017"), false);
  });

  it("lints choose-focus concise Screen interactions without errors", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "examples", "fixtures", "choose-focus.flowspec"),
      "utf8"
    );
    const d = lintFlowSpecFile(source, "examples/fixtures/choose-focus.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    for (const code of ["FS101", "FS102", "FS103", "FS104", "FS105", "FS106"]) {
      assert.equal(hasCode(d, code), false, code);
    }
  });
});

describe("Flow-owned behavior", () => {
  it("allows each behavioral section directly under Flow", () => {
    const cases = [
      ["Receives", "  Receives\n    Input"],
      ["Rules", "  Rules\n    Something must be true"],
      ["Uses", "  Uses\n    Provider OpenAI"],
      ["Steps", "  Steps\n    Do something"],
      ["Shows", "  Shows\n    Progress"],
      ["Outcome", "  Outcome\n    Something is ready"],
    ];
    for (const [label, body] of cases) {
      const d = lintFlowSpecFile(`Flow Example\n${body}\n`, "a.flowspec");
      assert.equal(
        hasCode(d, "FS007"),
        false,
        `${label}: ${JSON.stringify(d, null, 2)}`
      );
    }
  });

  it("allows a combined Flow with Id and full behavior", () => {
    const source = ["Flow Bootstrap conversation", "Id conversation.bootstrap", "", "    Receives", "      Session", "", "    Rules", "      Bootstrap the conversation only once per session", "", "    Uses", "      Provider OpenAI", "", "    Steps", "      At the same time", "        Load the user profile", "        Load the conversation history for the session", "", "      Once the conversation history is loaded", "        If the conversation history is empty", "          Go to Start conversation", "        Otherwise", "          Go to Restore conversation", "", "    If bootstrap fails", "      Shows", "        Conversation error with retry", "", "    Shows", "      Initial status", "", "    Outcome", "      Conversation is ready to start or continue", "", "  Screen Start conversation", "  Screen Restore conversation"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
  });

  it("lints the flow-owned-behavior fixture without errors", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "examples", "fixtures", "flow-owned-behavior.flowspec"),
      "utf8"
    );
    const d = lintFlowSpecFile(
      source,
      "examples/fixtures/flow-owned-behavior.flowspec"
    );
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
  });

  it("rejects document-level Flow sections (adjacency is not ownership)", () => {
    const source = ["Flow Example", "", "Receives", "  Input"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS024"), JSON.stringify(d, null, 2));
    assert.match(
      d.find((x) => x.code === "FS024").message,
      /Receives/
    );
  });

  it("rejects duplicate Flow-owned sections", () => {
    const source = ["Flow Example", "    Steps", "      Do something", "    Steps", "      Do more"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS008"));
  });

  it("keeps At the same time valid only inside Steps on a Flow", () => {
    const invalid = ["Flow Example", "    At the same time", "      Load profile", "      Load history"].join("\n");
    const invalidDiag = lintFlowSpecFile(invalid, "a.flowspec");
    assert.ok(hasCode(invalidDiag, "FS011"));

    const valid = ["Flow Example", "    Steps", "      At the same time", "        Load profile", "        Load history"].join("\n");
    const validDiag = lintFlowSpecFile(valid, "a.flowspec");
    assert.equal(hasCode(validDiag, "FS011"), false);
  });

  it("still allows explicit Action decomposition under Flow", () => {
    const source = ["Flow Example", "", "    Action Do something", "      Steps", "        Work"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS007"), false, JSON.stringify(d, null, 2));
  });

  it("warns when Flow-owned Outcome is not final", () => {
    const source = ["Flow Example", "    Outcome", "      Ready", "    Steps", "      Work"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.ok(hasCode(d, "FS017"));
    assert.ok(hasCode(d, "FS009"));
  });

  it("parses Flow-owned sections onto the Flow AST node", () => {
    const { parseTree } = require("../lib/parse");
    const source = ["Flow Example", "    Receives", "      Input", "    Steps", "      Work", "    Action Nested", "      Steps", "        Nested work"].join("\n");
    const { root } = parseTree(source);
    const flow = root.children.find((c) => c.type === "flow");
    assert.ok(flow);
    assert.equal(
      flow.children.some((c) => c.type === "receives"),
      true
    );
    assert.equal(
      flow.children.some((c) => c.type === "steps"),
      true
    );
    const action = flow.children.find((c) => c.type === "action");
    assert.ok(action);
    assert.equal(action.children.some((c) => c.type === "steps"), true);
    assert.equal(action.children.some((c) => c.type === "receives"), false);
  });
});

describe("FS106 Redundant same-named Action", () => {
  it("warns when a Flow only wraps a same-named Action", () => {
    const source = ["Flow Bootstrap conversation", "", "    Action Bootstrap conversation", "      Steps", "        Load history"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS106");
    assert.ok(warn, JSON.stringify(d, null, 2));
    assert.match(warn.message, /repeats its owning Flow name/);
  });

  it("does not warn when names differ", () => {
    const source = ["Flow Bootstrap conversation", "", "    Action Generate initial assistant response", "      Steps", "        Generate the response"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS106"), false, JSON.stringify(d, null, 2));
  });

  it("does not warn when the Flow also has a Screen", () => {
    const source = ["Flow Bootstrap conversation", "", "    Screen Conversation", "", "    Action Bootstrap conversation", "      Steps", "        Load history"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS106"), false, JSON.stringify(d, null, 2));
  });

  it("does not warn when the Flow has multiple Actions", () => {
    const source = ["Flow Bootstrap conversation", "", "    Action Bootstrap conversation", "      Steps", "        Load history", "", "    Action Notify analytics", "      Steps", "        Send event"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS106"), false, JSON.stringify(d, null, 2));
  });

  it("does not warn when the Flow already has direct behavior", () => {
    const source = ["Flow Bootstrap conversation", "", "    Rules", "      Bootstrap only once", "", "    Action Bootstrap conversation", "      Steps", "        Load history"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS106"), false, JSON.stringify(d, null, 2));
  });
});

describe("FS024 document-level ownership", () => {
  it("rejects an unindented Screen after Flow", () => {
    const source = ["Flow Home", "", "Screen Home"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const err = d.find((x) => x.code === "FS024");
    assert.ok(err, JSON.stringify(d, null, 2));
    assert.match(err.message, /Screen "Home"/);
  });

  it("accepts an indented Screen under Flow", () => {
    const source = ["Flow Home", "", "  Screen Home"].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS024"), false, JSON.stringify(d, null, 2));
  });
});

describe("FS107 Possible screen-local trigger", () => {
  it("warns when a likely screen-local When is a Flow sibling after a Screen", () => {
    const source = [
      "Flow Home",
      "",
      "  Screen Home",
      "    Shows",
      "      Mood selector",
      "",
      "  When the user changes mood",
      "    Store selected mood",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    const warn = d.find((x) => x.code === "FS107");
    assert.ok(warn, JSON.stringify(d, null, 2));
    assert.match(warn.message, /Screen "Home"/);
  });

  it("does not warn for global Flow-level When events", () => {
    const source = [
      "Flow Home",
      "",
      "  Screen Home",
      "    Shows",
      "      Status",
      "",
      "  When connectivity returns",
      "    Retry pending work",
      "",
      "  When the user becomes signed in",
      "    Go to Home",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS107"), false, JSON.stringify(d, null, 2));
  });

  it("does not warn when the When is nested under the Screen", () => {
    const source = [
      "Flow Home",
      "",
      "  Screen Home",
      "    When the user changes mood",
      "      Store selected mood",
    ].join("\n");
    const d = lintFlowSpecFile(source, "a.flowspec");
    assert.equal(hasCode(d, "FS107"), false, JSON.stringify(d, null, 2));
  });

  it("lints the home fixture without errors or FS107", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "examples", "fixtures", "home.flowspec"),
      "utf8"
    );
    const d = lintFlowSpecFile(source, "examples/fixtures/home.flowspec");
    assert.equal(
      d.filter((x) => x.severity === "error").length,
      0,
      JSON.stringify(d, null, 2)
    );
    assert.equal(hasCode(d, "FS107"), false);
  });
});
