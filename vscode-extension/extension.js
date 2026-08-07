const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const DEBOUNCE_MS = 300;

/**
 * Clear Node's require cache for a module directory so Extension Development Host
 * reloads pick up edited lib files without a full process restart.
 * @param {string} dir
 */
function clearModuleCache(dir) {
  const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key === dir || key.startsWith(prefix)) {
      delete require.cache[key];
    }
  }
}

/**
 * Resolve the shared FlowSpec library.
 * Prefer the repo `lib/` during Extension Development Host; use vendored copy in VSIX.
 */
function loadLib() {
  const candidates = [
    path.join(__dirname, "..", "lib", "index.js"),
    path.join(__dirname, "vendor", "flowspec", "index.js"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    clearModuleCache(path.dirname(candidate));
    return require(candidate);
  }
  throw new Error("FlowSpec library module not found");
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const {
    lintFlowSpecFile,
    lintFlowSpecProject,
    resolveGoToDefinitions,
  } = loadLib();
  const collection = vscode.languages.createDiagnosticCollection("flowspec");
  context.subscriptions.push(collection);

  /** @type {Map<string, NodeJS.Timeout>} */
  const timers = new Map();

  /**
   * Always prefer project-wide lint when a workspace folder is available so
   * Go to / Id checks resolve across `.flowspec` files while editing.
   * @param {vscode.TextDocument} document
   */
  function scheduleLint(document) {
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
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (folder) {
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
    vscode.workspace.onDidSaveTextDocument((doc) => scheduleLint(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
      const key = doc.uri.toString();
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.delete(key);
    }),
    vscode.languages.registerDefinitionProvider(
      { language: "flowspec" },
      {
        provideDefinition(document, position) {
          return provideGoToDefinition(document, position, resolveGoToDefinitions);
        },
      }
    )
  );

  for (const doc of vscode.workspace.textDocuments) {
    scheduleLint(doc);
  }
}

/**
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @param {typeof import("../lib/goto").resolveGoToDefinitions} resolveGoToDefinitions
 * @returns {Promise<vscode.LocationLink[] | null>}
 */
async function provideGoToDefinition(document, position, resolveGoToDefinitions) {
  const files = await collectWorkspaceFlowSpecFiles(document);
  const result = resolveGoToDefinitions(files, {
    filePath: document.uri.fsPath,
    line: position.line + 1,
    column: position.character + 1,
  });

  if (!result || result.definitions.length === 0) return null;

  const originSelectionRange = new vscode.Range(
    result.originRange.line - 1,
    result.originRange.startColumn - 1,
    result.originRange.line - 1,
    result.originRange.endColumn - 1
  );

  return result.definitions.map((target) => {
    const startLine = Math.max(0, (target.line || 1) - 1);
    const startColumn = Math.max(0, (target.column || 1) - 1);
    const endLine =
      target.endLine != null ? Math.max(0, target.endLine - 1) : startLine;
    const endColumn =
      target.endColumn != null
        ? Math.max(0, target.endColumn - 1)
        : startColumn + 1;
    const targetRange = new vscode.Range(
      startLine,
      startColumn,
      endLine,
      endColumn
    );
    return {
      originSelectionRange,
      targetUri: vscode.Uri.file(target.filePath),
      targetRange,
      targetSelectionRange: targetRange,
    };
  });
}

/**
 * Collect all `.flowspec` sources in the workspace folder (or just the document).
 * @param {vscode.TextDocument} document
 * @returns {Promise<Array<{ source: string, filePath: string }>>}
 */
async function collectWorkspaceFlowSpecFiles(document) {
  /** @type {Array<{ source: string, filePath: string }>} */
  const files = [];
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);

  if (folder) {
    const pattern = new vscode.RelativePattern(folder, "**/*.flowspec");
    const found = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
    /** @type {Map<string, string>} */
    const byPath = new Map();
    for (const uri of found) {
      try {
        const text = await vscode.workspace.openTextDocument(uri);
        byPath.set(uri.fsPath, text.getText());
      } catch {
        // ignore unreadable files
      }
    }
    // Prefer the in-memory buffer for the active document.
    byPath.set(document.uri.fsPath, document.getText());
    for (const [filePath, source] of byPath) {
      files.push({ source, filePath });
    }
  } else {
    files.push({
      source: document.getText(),
      filePath: document.uri.fsPath,
    });
  }

  return files;
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
  /** @type {vscode.Uri[]} */
  const uris = [];

  if (folder) {
    const pattern = new vscode.RelativePattern(folder, "**/*.flowspec");
    const found = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
    uris.push(...found);
    for (const uri of found) {
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
    uris.push(document.uri);
  }

  const diagnostics = lintFlowSpecProject(files);
  /** @type {Map<string, vscode.Diagnostic[]>} */
  const byFile = new Map();
  for (const uri of uris) {
    byFile.set(uri.fsPath, []);
  }
  for (const d of diagnostics) {
    const list = byFile.get(d.filePath) || [];
    list.push(toVsCodeDiagnostic(d));
    byFile.set(d.filePath, list);
  }

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
