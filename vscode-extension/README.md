# FlowSpec for Visual Studio Code

Syntax highlighting for [FlowSpec](../README.md) — a human-readable behavioral specification format.

This extension provides TextMate-based highlighting for `.flowspec` files. It does **not** include a language server, autocomplete, formatting, or IDE diagnostics. A small reusable parser/validator lives in the repo root [`lib/`](../lib/) for tooling and tests.

## Features

- Language ID: `flowspec`
- File extension: `.flowspec`
- Language name: **FlowSpec**
- Line comments with `#`
- Highlighting for structural directives, `ID`, sections, flow-control phrases, titles, identifiers, numbers, durations, and quoted strings

## Supported directives (v1)

### Structural

| Directive | Example |
| --------- | ------- |
| `FLOW` | `FLOW: Answer a user message` |
| `SCREEN` | `SCREEN: Conversation` |
| `ACTION` | `ACTION: Create quick replies` |
| `ID` | `ID: conversation.create-quick-replies` |

### Sections

| Directive | Role |
| --------- | ---- |
| `Receives` | Inputs an action needs |
| `Rules` | Business constraints |
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
FLOW: Answer a user message
ID: conversation.answer-message

SCREEN: Conversation
ID: conversation.screen

When the user sends a message

  At the same time

    ACTION: Find relevant products
    ID: conversation.find-products

      Receives
        User message

      Steps
        Find products relevant to the user message
        Rank the matching products

      Outcome
        Product results are available

  Once product results are available

    ACTION: Create quick replies
    ID: conversation.create-quick-replies

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
4. Confirm highlighting on `examples/example.flowspec`, including `ID` values and mid-line prose that must not highlight.

## Package as a `.vsix`

```bash
npm install
npm run package
```

Install via **Install from VSIX…** or:

```bash
code --install-extension flowspec-0.1.0.vsix
```

## Highlighting scopes

| Kind | TextMate scope |
| ---- | -------------- |
| Structural directives | `keyword.control.directive.flowspec` |
| `ID` | `keyword.other.metadata.flowspec` |
| ID values | `entity.name.identifier.flowspec` |
| Section directives | `keyword.control.section.flowspec` |
| Flow-control phrases | `keyword.control.flow.flowspec` |
| Titles after `FLOW` / `SCREEN` / `ACTION` / `Go to` | `entity.name.flowspec` |
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
