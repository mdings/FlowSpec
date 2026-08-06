/**
 * FlowSpec CLI — lint command.
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  lintFlowSpecProject,
  countDiagnostics,
} = require("./lint");

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
async function run(argv = process.argv.slice(2)) {
  const { command, patterns, format, warningsAsErrors } = parseArgs(argv);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command !== "lint") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }

  if (patterns.length === 0) {
    console.error("No files specified.");
    printHelp();
    return 1;
  }

  const filePaths = await expandPatterns(patterns);
  if (filePaths.length === 0) {
    console.error("No .flowspec files matched.");
    return 1;
  }

  const files = filePaths.map((filePath) => ({
    filePath: normalizePath(filePath),
    source: fs.readFileSync(filePath, "utf8"),
  }));

  const diagnostics = lintFlowSpecProject(files);
  const { errors, warnings } = countDiagnostics(diagnostics);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          errors,
          warnings,
          diagnostics,
        },
        null,
        2
      )
    );
  } else {
    for (const d of diagnostics) {
      printHumanDiagnostic(d);
      console.log("");
    }
    console.log(`${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`);
  }

  if (errors > 0) return 1;
  if (warningsAsErrors && warnings > 0) return 1;
  return 0;
}

function parseArgs(argv) {
  let command = null;
  /** @type {string[]} */
  const patterns = [];
  let format = "human";
  let warningsAsErrors = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!command && !arg.startsWith("-")) {
      command = arg;
      continue;
    }
    if (arg === "--format") {
      format = argv[++i] || "human";
      continue;
    }
    if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
      continue;
    }
    if (arg === "--warnings-as-errors") {
      warningsAsErrors = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      command = "help";
      continue;
    }
    patterns.push(arg);
  }

  return { command, patterns, format, warningsAsErrors };
}

function printHelp() {
  console.log(`Usage:
  flowspec lint <files-or-globs...>
  flowspec lint --format json <files-or-globs...>
  flowspec lint --warnings-as-errors <files-or-globs...>

Examples:
  flowspec lint "flowspec/**/*.flowspec"
  flowspec lint examples/answer-a-user-message.flowspec
`);
}

/**
 * @param {import("./diagnostics").FlowSpecDiagnostic} d
 */
function printHumanDiagnostic(d) {
  console.log(
    `${d.filePath}:${d.line}:${d.column} ${d.severity} ${d.code}`
  );
  console.log(d.message);
  if (d.suggestion) {
    console.log(`Suggestion: ${d.suggestion}`);
  }
}

function normalizePath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join("/") || path.basename(filePath);
}

/**
 * Expand file paths and simple globs (** / *.flowspec).
 * @param {string[]} patterns
 * @returns {Promise<string[]>}
 */
async function expandPatterns(patterns) {
  /** @type {Set<string>} */
  const out = new Set();

  for (const pattern of patterns) {
    if (pattern.includes("*") || pattern.includes("?")) {
      const matches = await globFiles(pattern);
      for (const m of matches) out.add(path.resolve(m));
    } else {
      const resolved = path.resolve(pattern);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        for (const m of walkFlowSpecFiles(resolved)) out.add(m);
      } else if (fs.existsSync(resolved)) {
        out.add(resolved);
      }
    }
  }

  return [...out].sort();
}

/**
 * Minimal glob supporting ** and * segments.
 * @param {string} pattern
 */
async function globFiles(pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const results = [];
  collectGlob(process.cwd(), parts, 0, results);
  return results;
}

function collectGlob(baseDir, parts, index, results) {
  if (index >= parts.length) {
    if (fs.existsSync(baseDir) && fs.statSync(baseDir).isFile()) {
      results.push(baseDir);
    }
    return;
  }

  const part = parts[index];
  if (!part.includes("*") && !part.includes("?")) {
    const next = path.join(baseDir, part);
    if (!fs.existsSync(next)) return;
    collectGlob(next, parts, index + 1, results);
    return;
  }

  if (part === "**") {
    // match zero or more directories
    collectGlob(baseDir, parts, index + 1, results);
    if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      collectGlob(path.join(baseDir, entry.name), parts, index, results);
    }
    return;
  }

  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return;
  const re = globPartToRegExp(part);
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!re.test(entry.name)) continue;
    collectGlob(path.join(baseDir, entry.name), parts, index + 1, results);
  }
}

function globPartToRegExp(part) {
  let src = "^";
  for (const ch of part) {
    if (ch === "*") src += ".*";
    else if (ch === "?") src += ".";
    else if (/[.+^${}()|[\]\\]/.test(ch)) src += `\\${ch}`;
    else src += ch;
  }
  src += "$";
  return new RegExp(src);
}

function walkFlowSpecFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFlowSpecFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".flowspec")) out.push(full);
  }
  return out;
}

module.exports = {
  run,
  expandPatterns,
  parseArgs,
};

if (require.main === module) {
  run().then((code) => process.exit(code));
}
