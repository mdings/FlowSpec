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
const flowControl = compilePattern(grammar.repository["flow-control"].match);
const comment = compilePattern(grammar.repository.comments.match);
const duration = compilePattern(grammar.repository.durations.match);
const number = compilePattern(grammar.repository.numbers.match);
const idValue = compilePattern(
  grammar.repository["id-directive"].patterns.find((p) => p.match).match
);

const topMatches = sample.match(topLevel) || [];
assert("matches FLOW/SCREEN/ACTION at line start", topMatches.length >= 8);

const idMatches = sample.match(idDirective) || [];
assert("matches ID directives", idMatches.length >= 6);

assert(
  "matches ID identifier values",
  (sample.match(idValue) || []).some((m) => m.includes("conversation."))
);

const sectionMatches = sample.match(section) || [];
assert("matches section directives", sectionMatches.length >= 10);

assert(
  "matches If … fails",
  (sample.match(ifFails) || []).some((m) => /fails/.test(m))
);

assert(
  "matches At the same time",
  (sample.match(atSameTime) || []).length >= 1
);

assert(
  "matches When/Once/If/Otherwise",
  (sample.match(flowControl) || []).length >= 4
);

assert("matches comments", (sample.match(comment) || []).length >= 1);
assert("matches durations", (sample.match(duration) || []).length >= 3);
assert("matches numbers", (sample.match(number) || []).length >= 1);

const ruleLine = "  Only show this when product results are available";
assert("does not match mid-line 'when'", !compilePattern(grammar.repository["flow-control"].match).test(ruleLine));

const ifLine = "  Do not run if the user is anonymous";
assert("does not match mid-line 'if'", !compilePattern(grammar.repository["flow-control"].match).test(ifLine));

const rulesInText = "  Follow the rules in the brand guide";
assert("does not match mid-line 'rules'", !compilePattern(grammar.repository["section-directives"].match).test(rulesInText));

const midId = "  reference the ID conversation.find-products later";
assert("does not match mid-line 'ID'", !compilePattern(grammar.repository["id-directive"].begin).test(midId));

assert("Go to begin pattern is line-anchored", goTo.source.startsWith("^"));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}: ${c.name}`);
}

if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} checks passed.`);
