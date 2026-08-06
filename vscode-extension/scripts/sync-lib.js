#!/usr/bin/env node
/**
 * Copy the shared FlowSpec lib into vscode-extension/vendor for VSIX packaging.
 */
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "..", "lib");
const destDir = path.join(__dirname, "..", "vendor", "flowspec");

fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });

for (const name of fs.readdirSync(srcDir)) {
  if (!name.endsWith(".js")) continue;
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
}

console.log(`Synced FlowSpec lib → ${destDir}`);
