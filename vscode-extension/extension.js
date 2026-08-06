const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const DEBOUNCE_MS = 300;

/**
 * Resolve the shared FlowSpec linter (workspace lib, or vendored copy for VSIX).
 */
function loadLinter() {
  const candidates = [
    path.join(__dirname, "vendor", "flowspec", "lint.js"),
    path.join(__dirname, "..", "lib", "lint.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }
  throw new Error("FlowSpec linter module not found");
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const { lintFlowSpecFile, lintFlowSpecProject } = loadLinter();
  const collection = vscode.languages.createDiagnosticCollection("flowspec");
  context.subscriptions.push(collection);

  /** @type {Map<string, NodeJS.Timeout>} */
  const timers = new Map();

  /**
   * @param {vscode.TextDocument} document
   * @param {{ project?: boolean }} [options]
   */
  function scheduleLint(document, options = {}) {
    if (document.languageId !== "flowspec" && !document.fileName.endsWith(".flowspec")) {
      return;
    }
    const key = document.uri.toString();
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        if (options.project) {
          lintProject(document, collection, lintFlowSpecProject);
        } else {
          lintDocument(document, collection, lintFlowSpecFile);
        }
      }, DEBOUNCE_MS)
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => scheduleLint(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleLint(e.document)),
    vscode.workspace.onDidSaveTextDocument((doc) =>
      scheduleLint(doc, { project: true })
    ),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
      const key = doc.uri.toString();
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.delete(key);
    })
  );

  for (const doc of vscode.workspace.textDocuments) {
    scheduleLint(doc);
  }
}

/**
 * @param {vscode.TextDocument} document
 * @param {vscode.DiagnosticCollection} collection
 * @param {(source: string, filePath: string) => object[]} lintFlowSpecFile
 */
function lintDocument(document, collection, lintFlowSpecFile) {
  const filePath = document.uri.fsPath;
  const diagnostics = lintFlowSpecFile(document.getText(), filePath);
  collection.set(document.uri, toVsCodeDiagnostics(diagnostics));
}

/**
 * @param {vscode.TextDocument} document
 * @param {vscode.DiagnosticCollection} collection
 * @param {(files: object[]) => object[]} lintFlowSpecProject
 */
async function lintProject(document, collection, lintFlowSpecProject) {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  /** @type {Array<{ source: string, filePath: string }>} */
  const files = [];

  if (folder) {
    const pattern = new vscode.RelativePattern(folder, "**/*.flowspec");
    const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
    for (const uri of uris) {
      try {
        const text = await vscode.workspace.openTextDocument(uri);
        files.push({ source: text.getText(), filePath: uri.fsPath });
      } catch {
        // ignore unreadable files
      }
    }
  } else {
    files.push({
      source: document.getText(),
      filePath: document.uri.fsPath,
    });
  }

  const diagnostics = lintFlowSpecProject(files);
  /** @type {Map<string, vscode.Diagnostic[]>} */
  const byFile = new Map();
  for (const d of diagnostics) {
    const list = byFile.get(d.filePath) || [];
    list.push(toVsCodeDiagnostic(d));
    byFile.set(d.filePath, list);
  }

  // Clear previous project diagnostics for known files, then set
  for (const [filePath, diags] of byFile) {
    collection.set(vscode.Uri.file(filePath), diags);
  }
}

/**
 * @param {object[]} diagnostics
 * @returns {vscode.Diagnostic[]}
 */
function toVsCodeDiagnostics(diagnostics) {
  return diagnostics.map(toVsCodeDiagnostic);
}

/**
 * @param {object} d
 * @returns {vscode.Diagnostic}
 */
function toVsCodeDiagnostic(d) {
  const line = Math.max(0, (d.line || 1) - 1);
  const column = Math.max(0, (d.column || 1) - 1);
  const endLine = d.endLine != null ? Math.max(0, d.endLine - 1) : line;
  const endColumn =
    d.endColumn != null ? Math.max(0, d.endColumn - 1) : column + 1;
  const range = new vscode.Range(line, column, endLine, endColumn);
  const severity =
    d.severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning;
  const diagnostic = new vscode.Diagnostic(range, d.message, severity);
  diagnostic.code = d.code;
  diagnostic.source = "flowspec";
  return diagnostic;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
