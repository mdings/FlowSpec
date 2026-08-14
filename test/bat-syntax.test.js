#!/usr/bin/env node
/**
 * Lightweight checks for the bat/syntect FlowSpec.sublime-syntax definition.
 * Asserts directive regexes stay aligned with the VS Code TextMate grammar.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const sublimePath = path.join(root, "syntaxes", "FlowSpec.sublime-syntax");
const tmPath = path.join(
  root,
  "vscode-extension",
  "syntaxes",
  "flowspec.tmLanguage.json"
);
const fixturePath = path.join(
  root,
  "examples",
  "fixtures",
  "terminal-highlighting.flowspec"
);

function extractQuotedMatch(src, contextName) {
  const ctx = new RegExp(
    `(?:^|\\n)\\s{2}${contextName}:\\n([\\s\\S]*?)(?=\\n\\s{2}\\S|\\n[^\\s]|$)`
  );
  const block = src.match(ctx);
  if (!block) return null;
  const m = block[1].match(/^\s+- match:\s+(?:'([^']*)'|"([^"]*)")/m);
  return m ? (m[1] ?? m[2]) : null;
}

describe("bat FlowSpec.sublime-syntax", () => {
  const sublime = fs.readFileSync(sublimePath, "utf8");
  const grammar = JSON.parse(fs.readFileSync(tmPath, "utf8"));
  const fixture = fs.readFileSync(fixturePath, "utf8");

  it("declares FlowSpec name, extension, and scope", () => {
    assert.match(sublime, /^name:\s*FlowSpec\s*$/m);
    assert.match(sublime, /file_extensions:[\s\S]*?- flowspec/);
    assert.match(sublime, /scope:\s*source\.flowspec/);
  });

  it("keeps directive regexes synchronized with the VS Code TextMate grammar", () => {
    const pairs = [
      ["top-level-directives", "begin", "top-level-directives"],
      ["id-directive", "begin", "id-directive"],
      ["section-directives", "match", "section-directives"],
      ["if-fails", "match", "if-fails"],
      ["at-the-same-time", "match", "at-the-same-time"],
      ["go-to", "begin", "go-to"],
      ["flow-control", "match", "flow-control"],
      ["comments", "match", "comments"],
      ["durations", "match", "durations"],
      ["numbers", "match", "numbers"],
    ];

    for (const [tmKey, tmField, sublimeCtx] of pairs) {
      const tmPattern = grammar.repository[tmKey][tmField];
      const subPattern = extractQuotedMatch(sublime, sublimeCtx);
      assert.equal(
        subPattern,
        tmPattern,
        `expected ${sublimeCtx} match to equal TextMate ${tmKey}.${tmField}`
      );
    }
  });

  it("includes optional layout pipe punctuation", () => {
    assert.match(sublime, /punctuation\.separator\.layout\.flowspec/);
  });

  it("fixture covers representative FlowSpec constructs", () => {
    const compile = (pattern) => new RegExp(pattern, "gm");
    const topLevel = compile(grammar.repository["top-level-directives"].begin);
    const section = compile(grammar.repository["section-directives"].match);
    const flowControl = compile(grammar.repository["flow-control"].match);
    const ifFails = compile(grammar.repository["if-fails"].match);
    const atSameTime = compile(grammar.repository["at-the-same-time"].match);
    const goTo = compile(grammar.repository["go-to"].begin);
    const idDirective = compile(grammar.repository["id-directive"].begin);
    const comment = compile(grammar.repository.comments.match);

    assert.ok((fixture.match(topLevel) || []).length >= 4);
    assert.ok((fixture.match(section) || []).length >= 3);
    assert.ok((fixture.match(flowControl) || []).length >= 3);
    assert.ok((fixture.match(ifFails) || []).some((m) => /fails/.test(m)));
    assert.ok((fixture.match(atSameTime) || []).length >= 1);
    assert.ok((fixture.match(goTo) || []).length >= 1);
    assert.ok((fixture.match(idDirective) || []).length >= 2);
    assert.ok((fixture.match(comment) || []).length >= 1);
    assert.match(fixture, /Sidebar \| Content \| Inspector/);
    assert.match(fixture, /^ {4}Select plan$/m);
  });

  it("does not treat mid-line prose as directives", () => {
    const flowControl = new RegExp(
      grammar.repository["flow-control"].match,
      "gm"
    );
    const section = new RegExp(
      grammar.repository["section-directives"].match,
      "gm"
    );
    assert.equal(
      flowControl.test("    Only show this when product results are available"),
      false
    );
    assert.equal(
      flowControl.test("    Do not run if the user is anonymous"),
      false
    );
    assert.equal(
      section.test("    Follow the rules in the brand guide"),
      false
    );
  });

  it("builds with bat and highlights .flowspec when bat is installed", function () {
    const version = spawnSync("bat", ["--version"], { encoding: "utf8" });
    if (version.status !== 0) {
      this.skip();
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flowspec-bat-"));
    const syntaxesDir = path.join(tmpDir, "syntaxes");
    const cacheDir = path.join(tmpDir, "cache");
    fs.mkdirSync(syntaxesDir);
    fs.copyFileSync(sublimePath, path.join(syntaxesDir, "FlowSpec.sublime-syntax"));

    try {
      const build = spawnSync(
        "bat",
        ["cache", "--build", "--source", tmpDir, "--target", cacheDir],
        { encoding: "utf8" }
      );
      assert.equal(build.status, 0, build.stderr || build.stdout);

      const list = spawnSync("bat", ["--list-languages"], {
        encoding: "utf8",
        env: { ...process.env, BAT_CACHE_PATH: cacheDir },
      });
      assert.equal(list.status, 0, list.stderr);
      assert.match(list.stdout, /FlowSpec/i);

      const render = spawnSync(
        "bat",
        ["--color=always", "--style=plain", "--theme=ansi", fixturePath],
        {
          encoding: "utf8",
          env: { ...process.env, BAT_CACHE_PATH: cacheDir, NO_COLOR: "" },
          maxBuffer: 2 * 1024 * 1024,
        }
      );
      assert.equal(render.status, 0, render.stderr);
      // Comments and directives should carry ANSI color sequences.
      assert.match(render.stdout, /\u001b\[\d+mFlow\u001b/);
      assert.match(render.stdout, /\u001b\[\d+mId\u001b/);
      assert.match(render.stdout, /\u001b\[\d+mGo to\u001b/);
      assert.match(render.stdout, /\u001b\[\d+m# /);
      // Implicit Action name stays uncolored as a bare line.
      assert.match(render.stdout, /\n {4}Select plan\n/);
      // Mid-line "when" / "if" / "rules" in prose should not be isolated as keywords.
      assert.doesNotMatch(
        render.stdout,
        /\u001b\[\d+mwhen\u001b/
      );
      assert.doesNotMatch(
        render.stdout,
        /Do not run \u001b\[\d+mif\u001b/
      );
      assert.doesNotMatch(
        render.stdout,
        /Follow the \u001b\[\d+mrules\u001b/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
