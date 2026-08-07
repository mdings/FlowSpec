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
| `Uses` | Optional services, models, tools, or runtime configuration used by an Action. | `Uses` / `  Provider OpenAI` |
| `Steps` | Required functional work inside an action, without technical or test details. | `Steps` / `  Find matching products` |
| `Shows` | What becomes visible to the user (allowed on `Screen` or `Action`). | `Shows` / `  Quick replies below the assistant response` |
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

`Once`, `If`, `Otherwise`, and `If … fails` may appear directly inside a `Flow`, `Screen`, or `Action`, or inside `Steps`.

When present, `Outcome` should be the final direct child of an `Action`, because it summarizes the resulting state after the action and its branches have been described.

`Uses` documents optional execution dependencies, services, models, tools, or runtime configuration used to perform an Action. It is descriptive only — not infrastructure-as-code. Child lines stay human-readable; v1 does not prescribe a key/value schema.

```flowspec
Action Generate assistant response

  Receives
    User message
    Conversation context

  Rules
    Use the combined dimension prompt as instruction context

  Uses
    Provider OpenAI
    Model GPT-5
    Reasoning effort high

  Steps
    Generate the assistant response

  Outcome
    Assistant response is available
```

`Uses` may appear only as a direct section inside an `Action` (not inside a `Flow`, `Screen`, or nested under another section).

Sections must be indented beneath their owning Screen or Action. Adjacency does not imply ownership.

```flowspec
Screen Enter email

  Shows
    Email address input
```

Invalid (same-indent sibling — `Shows` is not owned by the Screen):

```flowspec
Screen Enter email
Shows
  Email address input
```

Recommended action shape with action-level failure handling:

```flowspec
Action Social login with Apple

  Steps
    Open native Apple sign-in
    Authenticate the user

    If authentication succeeds
      Store the user's name when provided
      Store the user's email address when provided
      Go to Conversation

  If authentication fails
    Show a sign-in error
    Go to Login options

  Outcome
    User is signed in
```

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
| FS007 | error | `Receives` / `Rules` / `Uses` / `Steps` / `Outcome` only as direct children of an `Action`; `Shows` only inside a `Screen` or an `Action` (indent-based ownership — adjacency does not count) |
| FS008 | error | Each section at most once per `Action` (or once per `Screen` for `Shows`) |
| FS009 | warning | Recommended section order: Receives → Rules → Uses → Steps → control-flow → Shows → Outcome |
| FS010 | warning | `Action` should not be empty (`Id` alone does not count) |
| FS011 | error | `At the same time` only inside `Steps` |
| FS012 | error | `Once` / `If` / `Otherwise` / `If … fails` may appear directly inside a `Flow`, `Screen`, or `Action`, or inside `Steps` — not inside `Receives`, `Rules`, `Uses`, `Shows`, or `Outcome` |
| FS013 | error | `Otherwise` must match a preceding `If` at the same indent in the same parent |
| FS014 | warning | `Go to` target should resolve to a `Flow`, `Screen`, or `Action` name or `Id` in any loaded file |
| FS015 | warning | `Go to` target should not match more than one name/Id (including across files) |
| FS016 | warning | Unknown or incorrectly cased directive (with suggestion when possible) |
| FS017 | warning | When present, `Outcome` should be the final direct child of an `Action` |

v1 does **not** support suppression comments or configuration files.

### Optional colons and Ids

Colons are always optional on directives. `Id` is optional on `Flow`, `Screen`, and `Action`. When present, place it immediately after the structural directive:

```flowspec
Action Send login code
Id authentication.send-login-code
```

### Go to resolution

`Go to` may reference a display name or an `Id` of a `Flow`, `Screen`, or `Action`.

The target may be defined in the **same file or any other loaded `.flowspec` file**:

```flowspec
# sign-in.flowspec
Flow Sign in

Action Continue
  Steps
    Go to Conversation
    Go to conversation.bootstrap
```

```flowspec
# conversation.flowspec
Flow Chat

Screen Conversation

Action Bootstrap conversation
Id conversation.bootstrap
  Steps
    Prepare the conversation
```

Project-level linting (`lintFlowSpecProject`, the CLI with a multi-file glob, and the VS Code extension in a workspace) resolves targets across files, detects duplicate Ids (FS006), unresolved references (FS014), and ambiguous names (FS015). Use an `Id` when display names collide across files.

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

Recommended order when multiple sections and action-level control-flow are present:

```flowspec
Action: [Action name]
Id: [stable identifier]

Receives
  [Required input]

Rules
  [Business constraints]

Uses
  [Services, models, tools, or runtime configuration]

Steps
  [Required functional work]

If [action-level branch]
  [Branch work]

Shows
  [Visible user-facing effect]

Outcome
  [Observable or reusable result]
```

Not every section is required. Missing sections are allowed. Incorrect section order produces **FS009** (warning). When `Outcome` is present but is not the final direct child, **FS017** warns. `Outcome` itself is never required.

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

See [`examples/answer-a-user-message.flowspec`](examples/answer-a-user-message.flowspec), the lint-clean entry fixture [`examples/fixtures/enter-jack-hunt.flowspec`](examples/fixtures/enter-jack-hunt.flowspec), and the AI `Uses` example [`examples/fixtures/bootstrap-conversation.flowspec`](examples/fixtures/bootstrap-conversation.flowspec).

## Meaning of the core sections

```text
Receives  → What does this action need?
Rules     → What must remain true?
Uses      → What capability or runtime dependency is used?
Steps     → What functionally happens?
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
- The VS Code extension debounces project-wide lint (all workspace `.flowspec` files) so `Go to` and `Id` checks resolve across files while editing.

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
