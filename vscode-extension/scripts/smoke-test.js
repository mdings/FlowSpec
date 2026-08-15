#!/usr/bin/env node
/**
 * Lightweight smoke test for the FlowSpec TextMate grammar.
 */
const fs = require("fs");
const path = require("path");

const grammarPath = path.join(__dirname, "..", "syntaxes", "flowspec.tmLanguage.json");
const grammar = JSON.parse(fs.readFileSync(grammarPath, "utf8"));

function compilePattern(tmPattern) {
  return new RegExp(tmPattern, "gm");
}

const checks = [];

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const sample = fs.readFileSync(
  path.join(__dirname, "..", "examples", "example.flowspec"),
  "utf8"
);

const topLevel = compilePattern(grammar.repository["top-level-directives"].begin);
const idDirective = compilePattern(grammar.repository["id-directive"].begin);
const section = compilePattern(grammar.repository["section-directives"].match);
const ifFails = compilePattern(grammar.repository["if-fails"].match);
const atSameTime = compilePattern(grammar.repository["at-the-same-time"].match);
const goTo = compilePattern(grammar.repository["go-to"].begin);
const goToId = compilePattern(grammar.repository["go-to-id"].begin);
const goToArgument = compilePattern(grammar.repository["go-to-arguments"].match);
const flowControl = compilePattern(grammar.repository["flow-control"].match);
const comment = compilePattern(grammar.repository.comments.match);
const duration = compilePattern(grammar.repository.durations.match);
const number = compilePattern(grammar.repository.numbers.match);
const idValue = compilePattern(
  grammar.repository["id-directive"].patterns.find((p) => p.match).match
);

assert("grammar includes Title Case Flow|Screen|Action|Section|Layout", /Section\|SECTION\|Layout\|LAYOUT/.test(grammar.repository["top-level-directives"].begin));
assert("grammar includes Title Case Id", /\(Id\|ID\)/.test(grammar.repository["id-directive"].begin));
assert("grammar includes Title Case Entry", /Entry/.test(grammar.repository["entry-directive"].begin));

const topMatches = sample.match(topLevel) || [];
assert("matches Flow/Screen/Action at line start", topMatches.length >= 8);
assert("matches Title Case Flow lines", topMatches.some((m) => /\bFlow\b/.test(m)));

const idMatches = sample.match(idDirective) || [];
assert("matches Id directives", idMatches.length >= 6);
assert("matches Title Case Id lines", idMatches.some((m) => /\bId\b/.test(m)));

assert(
  "matches Id identifier values",
  (sample.match(idValue) || []).some((m) => m.includes("conversation."))
);

assert("matches section directives", (sample.match(section) || []).length >= 10);
assert("matches If … fails", (sample.match(ifFails) || []).some((m) => /fails/.test(m)));
assert("matches At the same time", (sample.match(atSameTime) || []).length >= 1);
assert("matches When/Once/If/Otherwise", (sample.match(flowControl) || []).length >= 4);
assert("matches comments", (sample.match(comment) || []).length >= 1);
assert("matches durations", (sample.match(duration) || []).length >= 3);
assert("matches numbers", (sample.match(number) || []).length >= 1);

assert(
  "does not match mid-line 'when'",
  !compilePattern(grammar.repository["flow-control"].match).test(
    "  Only show this when product results are available"
  )
);
assert(
  "does not match mid-line 'if'",
  !compilePattern(grammar.repository["flow-control"].match).test(
    "  Do not run if the user is anonymous"
  )
);
assert(
  "does not match mid-line 'rules'",
  !compilePattern(grammar.repository["section-directives"].match).test(
    "  Follow the rules in the brand guide"
  )
);
assert(
  "matches Uses section directive",
  /Uses/.test(grammar.repository["section-directives"].match) &&
    compilePattern(grammar.repository["section-directives"].match).test("  Uses")
);
assert(
  "does not match mid-line prose 'uses'",
  !compilePattern(grammar.repository["section-directives"].match).test(
    "  The response uses available product context"
  )
);
assert(
  "does not match mid-line 'Uses' in content",
  !compilePattern(grammar.repository["section-directives"].match).test(
    "  Document what Uses means in prose"
  )
);
assert(
  "does not match mid-line 'Id'",
  !compilePattern(grammar.repository["id-directive"].begin).test(
    "  reference the Id conversation.find-products later"
  )
);
assert(
  "matches Entry at line start after indentation",
  compilePattern(grammar.repository["entry-directive"].begin).test("  Entry App launch")
);
assert(
  "does not match mid-line 'entry'",
  !compilePattern(grammar.repository["entry-directive"].begin).test(
    "  Record the catalog entry for the user"
  )
);
assert("Go to begin pattern is line-anchored", goTo.source.startsWith("^"));
assert("matches With and Without argument directives", (
  new RegExp(goToArgument.source).test("        With campaign context") &&
  new RegExp(goToArgument.source).test("        Without user input")
));
assert("Go to arguments are scoped only inside Go to", (
  grammar.repository["go-to"].patterns.some((pattern) => pattern.include === "#go-to-arguments") &&
  !grammar.patterns.some((pattern) => pattern.include === "#go-to-arguments")
));

assert("Go to highlights Id-shaped targets", grammar.repository["go-to-id"].beginCaptures[3].name === "entity.name.identifier.flowspec");
assert(
  "Go to Id pattern matches namespaced Ids",
  new RegExp(goToId.source).test("Go to conversation.bootstrap") &&
    new RegExp(goToId.source).test("Go to jack-hunt.conversation")
);
assert(
  "Go to Id pattern does not match Title Case display names",
  !new RegExp(goToId.source).test("Go to Conversation")
);

const singleQuoteBegin = grammar.repository.strings.patterns.find(
  (p) => p.name === "string.quoted.single.flowspec"
).begin;
assert(
  "single-quote strings ignore mid-word apostrophes",
  singleQuoteBegin.includes("?<!")
);
assert(
  "possessive user's does not open a single-quoted string",
  !new RegExp(singleQuoteBegin).test("user's")
);
assert(
  "standalone 'quoted' still opens a single-quoted string",
  new RegExp(singleQuoteBegin).test("use 'quoted' text")
);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}: ${c.name}`);
}

if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} checks passed.`);
