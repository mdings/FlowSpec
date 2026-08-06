# FlowSpec

FlowSpec is a high-level, human-readable format for describing the intended business logic and behavioral structure of an application.

**FlowSpec defines what an application must do while leaving developers and LLMs free to decide how it is implemented.**

It is a behavioral specification — not a programming language, not an executable test framework, and not a replacement for Gherkin or Cucumber.

**FlowSpec models the logic. Gherkin or other testing tools can verify concrete examples of that logic.**

FlowSpec uses Title Case for all directives to keep the language visually consistent and human-readable. Hierarchy is expressed through indentation, whitespace, and syntax highlighting rather than uppercase keywords.

## v1 directive set

Supported directives (exact casing):

```text
Flow
Screen
Action
Id
Receives
Rules
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

### Structural directives

| Directive | Description | Example |
| --------- | ----------- | ------- |
| `Flow` | Names a complete user journey or business flow. | `Flow: Answer a user message` |
| `Screen` | Defines the screen, page, modal, or UI context. | `Screen: Conversation` |
| `Action` | Defines something the user or the system does. | `Action: Create quick replies` |
| `Id` | Optional stable machine-readable reference for a `Flow`, `Screen`, or `Action`. | `Id: conversation.create-quick-replies` |

### Action sections

| Directive | Description | Example |
| --------- | ----------- | ------- |
| `Receives` | Information an action needs before it can run. | `Receives` / `  User message` |
| `Rules` | Business constraints that must remain true. | `Rules` / `  Show no more than 3 quick replies` |
| `Steps` | Required functional work inside an action, without technical or test details. | `Steps` / `  Find matching products` |
| `Shows` | What becomes visible to the user. | `Shows` / `  Quick replies below the assistant response` |
| `Outcome` | Observable or reusable result; other actions can wait for it. | `Outcome` / `  Quick replies are available` |

### Flow-control directives

| Directive | Description | Example |
| --------- | ----------- | ------- |
| `When` | Behavioral trigger that starts activity (not Gherkin’s executable `When`). | `When the user sends a message` |
| `At the same time` | Parallel work inside `Steps`. | `At the same time` |
| `Once` | Start only after an outcome or dependency is available. | `Once product results are available` |
| `If` | Conditional path. | `If the best result is a brand` |
| `Otherwise` | Alternate path when the preceding `If` is not true. | `Otherwise` |
| `If … fails` | Fallback when something cannot complete successfully. | `If product search fails` |
| `Go to` | Navigate to another screen, flow, or action. | `Go to: Verify login code` |

Colons after directives are optional; prefer the colon form in documentation (`Flow:`, `Id:`).

```flowspec
Flow Sign in
Flow: Sign in
```

Both forms parse identically.

The older uppercase forms `FLOW`, `SCREEN`, `ACTION`, and `ID` still parse for backwards compatibility but produce **FS016** warnings. Prefer Title Case in all new files. Directives are not fully case-insensitive: forms such as `flow` or `receives` are rejected with a suggestion.

Directives are recognized only at the beginning of a line after optional indentation. Directive-like words inside ordinary prose are not treated as directives.

## Linter

FlowSpec v1 includes a structural linter reusable from the CLI, tests, the VS Code extension, and CI.

### Run the linter

```bash
npm run flowspec -- lint "examples/**/*.flowspec"
# or
node bin/flowspec.js lint "examples/**/*.flowspec"
# or, after npm link / install
flowspec lint "flowspec/**/*.flowspec"
```

Explicit files:

```bash
flowspec lint examples/answer-a-user-message.flowspec examples/fixtures/enter-jack-hunt.flowspec
```

### CLI options

| Flag | Behavior |
| ---- | -------- |
| `--format json` | Machine-readable JSON for CI |
| `--warnings-as-errors` | Exit `1` when warnings are present |

Exit codes:

- `1` when one or more **errors** exist (or when `--warnings-as-errors` and warnings exist)
- `0` when there are only warnings or no diagnostics

Human-readable output:

```text
flowspec/authentication.flowspec:18:3 warning FS014
Unresolved Go to target "Conversation".
Expected a Flow, Screen, or Action with this name or Id.

1 error, 2 warnings
```

JSON output:

```json
{
  "errors": 1,
  "warnings": 2,
  "diagnostics": []
}
```

### Restriction table

| Code | Severity | Rule |
| ---- | -------- | ---- |
| FS001 | error | File must start with `Flow` (blank lines and `#` comments allowed before it) |
| FS002 | error | One top-level `Flow` per file; nested `Flow` is invalid |
| FS003 | error | Indentation must form a valid tree; mixed tabs/spaces are rejected |
| FS004 | error | `Id` may only belong to the directly preceding `Flow`, `Screen`, or `Action` |
| FS005 | error | `Id` must match `^[a-z0-9][a-z0-9._-]*$` |
| FS006 | error | `Id` must be unique across all loaded FlowSpec files |
| FS007 | error | `Receives` / `Rules` / `Steps` / `Shows` / `Outcome` only inside an `Action` |
| FS008 | error | Each action section at most once per `Action` |
| FS009 | warning | Recommended section order: Receives → Rules → Steps → Shows → Outcome |
| FS010 | warning | `Action` should not be empty (`Id` alone does not count) |
| FS011 | error | `At the same time` only inside `Steps` |
| FS012 | error | `Once` / `If` / `Otherwise` / `If … fails` only in `Steps`, or directly under `Screen` / `Flow` |
| FS013 | error | `Otherwise` must match a preceding `If` at the same indent in the same parent |
| FS014 | warning | `Go to` target should resolve to a `Flow`, `Screen`, or `Action` name or `Id` |
| FS015 | warning | `Go to` target should not match more than one name/Id |
| FS016 | warning | Unknown or incorrectly cased directive (with suggestion when possible) |

v1 does **not** support suppression comments or configuration files.

### Optional colons and Ids

Colons are always optional on directives. `Id` is optional on `Flow`, `Screen`, and `Action`. When present, place it immediately after the structural directive:

```flowspec
Action Send login code
Id authentication.send-login-code
```

### Go to resolution

`Go to` may reference a display name or an `Id`:

```flowspec
Go to Conversation
Go to conversation.bootstrap
```

Project-level linting (`lintFlowSpecProject` / CLI with multiple files) resolves targets across files, detects duplicates (FS006), unresolved references (FS014), and ambiguous names (FS015). Use an `Id` when display names collide.

### CI example

```yaml
- name: Lint FlowSpec
  run: npm run flowspec -- lint "examples/**/*.flowspec"
```

Adapt the glob to your repository (for example `flowspec/**/*.flowspec`).

### Programmatic API

```js
const {
  lintFlowSpecFile,
  lintFlowSpecProject,
} = require("flowspec"); // or ./lib

lintFlowSpecFile(source, filePath);
lintFlowSpecProject([{ source, filePath }]);
```

## `Action` vs `Steps`

- **`Action`** names a unit of behavior (what the user or system does) within a flow and screen.
- **`Steps`** lists the **required functional work that must happen inside that action**, without prescribing technical implementation or describing executable test steps.

### Good `Steps`

```flowspec
Steps
  Find matching products
  Rank the product results
  Create relevant quick replies
```

### Too technical

```flowspec
Steps
  Query the Pinecone index
  Parse the JSON response
  Store the result in React state
```

### Too test-oriented

```flowspec
Steps
  Click the submit button
  Assert that the user is redirected
```

FlowSpec documents the convention only; it does not attempt to detect “too technical” wording automatically.

## Stable Ids

`Id` is optional on `Flow`, `Screen`, and `Action`. Ids:

- are unique across the loaded FlowSpec project;
- stay independent from the display name;
- are stable machine-readable references (do not regenerate them when names change);
- use lowercase letters, numbers, hyphens, underscores, and periods.

Recommended format:

```text
^[a-z0-9][a-z0-9._-]*$
```

## Standard action structure

Recommended order when multiple action sections are present:

```flowspec
Action: [Action name]
Id: [stable identifier]

Receives
  [Required input]

Rules
  [Business constraints]

Steps
  [Required functional work]

Shows
  [Visible user-facing effect]

Outcome
  [Observable or reusable result]
```

Not every section is required. Missing sections are allowed. Incorrect order produces **FS009** (warning), not a hard parse failure.

## FlowSpec vs Gherkin

| | FlowSpec | Gherkin / similar |
| - | -------- | ----------------- |
| Role | Behavioral model of the product | Concrete, often executable examples |
| Style | Descriptive structure | Scenario / step definitions |
| `When` | Behavioral trigger | Executable scenario step |

**Not part of FlowSpec v1:** `Given`, `Then`, `Expect`, `Assert`, `Mock`, `Fixture`, `Scenario`, executable test data, test-runner integration, step definitions, rule suppression, or configurable rule sets.

```text
FlowSpec describes the behavioral model.
Gherkin or other test frameworks verify concrete examples of that model.
```

## Canonical example

See [`examples/answer-a-user-message.flowspec`](examples/answer-a-user-message.flowspec) and the lint-clean entry fixture [`examples/fixtures/enter-jack-hunt.flowspec`](examples/fixtures/enter-jack-hunt.flowspec).

## Meaning of the core sections

```text
Receives  → What does this action need?
Rules     → What must always remain true?
Steps     → What required functional work must happen?
Shows     → What does the user see?
Outcome   → What is true or available afterwards?
```

## Repository layout

| Path | Contents |
| ---- | -------- |
| [`examples/`](examples/) | Canonical FlowSpec samples |
| [`lib/`](lib/) | Parser, linter (FS001–FS016), and CLI |
| [`bin/flowspec.js`](bin/flowspec.js) | `flowspec` CLI entry |
| [`test/`](test/) | Parser, linter, and CLI tests |
| [`vscode-extension/`](vscode-extension/) | Syntax highlighting + diagnostic integration |

## Current limitations

- FlowSpec v1 is a **descriptive** specification format only.
- No language server, formatter, autocomplete, or auto-fix.
- No automatic generation of Gherkin, unit tests, or executable suites.
- No automatic detection of behavioral drift or of “too technical” steps.
- No rule suppression comments or configurable rule sets in v1.
- The VS Code extension debounces per-document lint on edit; project-wide ID/`Go to` checks run on save.

## FAQ

### Is FlowSpec a programming language?

No. It describes **what** an application must do, not **how** to implement it.

### Is FlowSpec a replacement for tests?

No. Use FlowSpec for the behavioral model; use Gherkin or other frameworks for concrete verification.

### Does FlowSpec prescribe architecture?

No. It must not prescribe databases, frameworks, APIs, or infrastructure.

### Where should `.flowspec` files live?

Alongside the code in the repository so they stay versionable and reviewable.

### Who is FlowSpec for?

Founders, product managers, designers, developers, and AI-assisted teams that want clear behavioral control without turning the spec into an executable test DSL.
