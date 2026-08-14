const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cliPath = path.join(__dirname, "..", "bin", "flowspec.js");

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("flowspec lint CLI", () => {
  /** @type {string} */
  let tmp;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flowspec-cli-"));
    fs.writeFileSync(
      path.join(tmp, "ok.flowspec"),
      "Flow Ok\n  Action Do\n    Steps\n      Work\n"
    );
    fs.writeFileSync(path.join(tmp, "bad.flowspec"), "Screen Only\n");
    fs.writeFileSync(
      path.join(tmp, "warn.flowspec"),
      "Flow Warn\n  Action Empty\n"
    );
    fs.mkdirSync(path.join(tmp, "nested"));
    fs.writeFileSync(
      path.join(tmp, "nested", "child.flowspec"),
      "Flow Child\n  Action Do\n    Steps\n      Work\n"
    );
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("exits 0 for a clean file", () => {
    const result = runCli(["lint", "ok.flowspec"], tmp);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  });

  it("exits 1 when errors exist", () => {
    const result = runCli(["lint", "bad.flowspec"], tmp);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FS001/);
  });

  it("exits 0 when only warnings exist", () => {
    const result = runCli(["lint", "warn.flowspec"], tmp);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /FS010/);
  });

  it("supports --warnings-as-errors", () => {
    const result = runCli(
      ["lint", "--warnings-as-errors", "warn.flowspec"],
      tmp
    );
    assert.equal(result.status, 1);
  });

  it("supports --format json", () => {
    const result = runCli(["lint", "--format", "json", "bad.flowspec"], tmp);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.ok(payload.errors >= 1);
    assert.ok(Array.isArray(payload.diagnostics));
    assert.ok(payload.diagnostics.some((d) => d.code === "FS001"));
  });

  it("supports glob input", () => {
    const result = runCli(["lint", "nested/**/*.flowspec"], tmp);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  });
});
