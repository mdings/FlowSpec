# FlowSpec for Visual Studio Code

Syntax highlighting and lint diagnostics for [FlowSpec](../README.md) — a human-readable behavioral specification format.

This extension provides TextMate-based highlighting for `.flowspec` files and publishes diagnostics from the shared FlowSpec v1 linter. It does **not** include a language server, autocomplete, or formatting.

## Features

- Language ID: `flowspec`
- File extension: `.flowspec`
- Line comments with `#`
- Highlighting for Title Case directives, `Id`, sections, flow-control phrases, numbers, durations, and quoted strings
- Lint on open and change (debounced)
- Project-wide duplicate `Id` / `Go to` checks across all workspace `.flowspec` files while editing
- Deprecated uppercase `FLOW` / `SCREEN` / `ACTION` / `ID` still highlight for older files

## Linting

Diagnostics use the shared core in [`../lib`](../lib) (rules FS001–FS016). See the root [README](../README.md#linter) for the full restriction table and CLI usage.

On package, `npm run sync-lib` copies the core into `vendor/flowspec` so the VSIX is self-contained.

## Supported directives (v1)

Exact Title Case forms:

```text
Flow
Screen
Action
Id
Receives
Rules
Uses
Steps
Shows
Outcome
When
Once
If
Otherwise
At the same time
If ... fails
Go to
```

### Structural

| Directive | Example |
| --------- | ------- |
| `Flow` | `Flow: Answer a user message` |
| `Screen` | `Screen: Conversation` |
| `Action` | `Action: Create quick replies` |
| `Id` | `Id: conversation.create-quick-replies` |

### Sections

| Directive | Role |
| --------- | ---- |
| `Receives` | Inputs an action needs |
| `Rules` | Business constraints |
| `Uses` | Optional services, models, tools, or runtime configuration used by an Action |
| `Steps` | Required functional work (not technical or test steps) |
| `Shows` | What becomes visible |
| `Outcome` | Observable result of an action |

### Flow control

| Phrase | Role |
| ------ | ---- |
| `When` | Behavioral trigger (not Gherkin’s executable `When`) |
| `Once` | Wait for an outcome |
| `If` | Conditional path |
| `Otherwise` | Alternate path |
| `At the same time` | Parallel actions |
| `If … fails` | Error / fallback path |
| `Go to` | Navigate to another screen or flow |

Directives are highlighted only at the beginning of a line (after optional indentation). Words such as `when` inside ordinary prose stay normal text.

## Syntax example

```flowspec
Flow: Answer a user message
Id: conversation.answer-message

Screen: Conversation
Id: conversation.screen

When the user sends a message

  At the same time

    Action: Find relevant products
    Id: conversation.find-products

      Receives
        User message

      Steps
        Find products relevant to the user message
        Rank the matching products

      Outcome
        Product results are available

  Once product results are available

    Action: Create quick replies
    Id: conversation.create-quick-replies

      Rules
        Show no more than 3 quick replies

      Steps
        If the best result is a brand
          Create product chips from that brand
        Otherwise
          Create relevant category chips

      Outcome
        Quick replies are available
```

## Run locally (Extension Development Host)

1. Open this `vscode-extension` folder in VS Code or Cursor.
2. `npm install` (needed for packaging).
3. Press **F5** (configuration **Extension**).
4. Confirm highlighting on `examples/example.flowspec`, including `Id` values and mid-line prose that must not highlight.

## Package as a `.vsix`

```bash
npm install
npm run package
```

This produces `flowspec-0.1.2.vsix` (version comes from `package.json`).

Install via **Install from VSIX…** or:

```bash
code --install-extension flowspec-0.1.2.vsix
```

Then run **Developer: Reload Window**. Reinstalling the same version often leaves the previous build loaded — bump `version` in `package.json` when packaging updates.

## Highlighting scopes

| Kind | TextMate scope |
| ---- | -------------- |
| Structural directives | `keyword.control.directive.flowspec` |
| `Id` | `keyword.other.metadata.flowspec` |
| Id values | `entity.name.identifier.flowspec` |
| Section directives | `keyword.control.section.flowspec` |
| Flow-control phrases | `keyword.control.flow.flowspec` |
| Titles after `Flow` / `Screen` / `Action` / `Go to` | `entity.name.flowspec` |
| Numbers | `constant.numeric.flowspec` |
| Durations | `constant.numeric.duration.flowspec` |
| Quoted strings | `string.quoted.*.flowspec` |
| Comments | `comment.line.number-sign.flowspec` |

## Limitations

- Syntax highlighting only in the editor (no LSP diagnostics from this extension).
- No Gherkin generation or test-runner integration.
- Duration highlighting covers common English units (`second(s)`, `minute(s)`, `hour(s)`, `day(s)`).

## Language reference

See [../README.md](../README.md) for the full FlowSpec v1 language description.
