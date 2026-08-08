# FlowSpec

FlowSpec is a high-level, human-readable format for describing the intended business logic and behavioral structure of an application.

**FlowSpec defines what an application must do while leaving developers and LLMs free to decide how it is implemented.**

It is a behavioral specification — not a programming language, not an executable test framework, and not a replacement for Gherkin or Cucumber.

**FlowSpec models the logic. Gherkin or other testing tools can verify concrete examples of that logic.**

### Core authoring principle

> FlowSpec should omit information that can be safely inferred from its structural context.

Keep three layers distinct:

| Layer | Role |
| ----- | ---- |
| **Language rules** | What is valid FlowSpec (parser + structural errors) |
| **Authoring guidelines** | How to write concise, scannable specs |
| **Lint suggestions** | Optional warnings for verbose-but-valid patterns |

FlowSpec uses Title Case for all directives to keep the language visually consistent and human-readable. Hierarchy is expressed through indentation, whitespace, and syntax highlighting rather than uppercase keywords.

---

## 1. Language rules

- A file must start with a single top-level `Flow` (blank lines and `#` comments may precede it).
- Hierarchy is indentation-based. Mixed tabs and spaces are rejected.
- Directives are recognized only at the beginning of a line after optional indentation. Directive-like words inside ordinary prose are not directives.
- Colons after directives are optional; both `Flow Sign in` and `Flow: Sign in` parse identically.
- Sections must be indented beneath their owning `Screen` or `Action`. Adjacency does not imply ownership.
- `Id` is optional on `Flow`, `Screen`, and `Action`. When present, place it immediately after the structural directive (for implicit Actions, indent `Id` under the interaction name).
- `Receives`, `Rules`, `Uses`, `Steps`, and `Outcome` are optional. Missing sections are allowed.
- `When` remains part of the language; it is not required for local Screen interactions.
- Older uppercase forms `FLOW`, `SCREEN`, `ACTION`, and `ID` still parse for backwards compatibility but produce **FS016** warnings. Prefer Title Case.

---

## 2. Directive reference

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
| `Action` | Defines something the user or the system does. Under a `Screen`, the keyword may be omitted for a direct named interaction. | `Action: Create quick replies` |
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

`Uses` may appear only as a direct section inside an `Action` (not inside a `Flow`, `Screen`, or nested under another section). It is descriptive only — not infrastructure-as-code.

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

---

## 3. Screen interactions vs explicit Actions

### Screen interactions (implicit Actions)

Inside a `Screen`, a direct named interaction line may omit the `Action` keyword. When that line has nested behavior (a section, control-flow, `Go to`, or `At the same time`), FlowSpec treats it as an Action and normalizes it to the same internal Action representation as an explicit `Action`.

```flowspec
Screen Choose voice

  Select voice
    If the voice requires Premium
      Go to Premium paywall

  Hold voice
    Shows
      Voice name
      Voice description
```

is equivalent to writing `Action Select voice` / `Action Hold voice` under that Screen.

**Boundaries**

- Implicit Actions are allowed only as **direct children of a Screen**.
- They must have **nested behavior** (not merely indented prose notes).
- They are **not** inferred inside a `Flow`, `Action`, `Steps`, `Rules`, `Shows`, `Outcome`, `Uses`, or other sections.
- Ordinary prose and section body lines are never promoted to Actions.
- Optional `Id` for an implicit Action must be indented under the interaction name.

### Explicit Actions

Use explicit `Action` for:

- reusable behavior;
- system-level behavior;
- behavior referenced through `Go to`;
- behavior that is meaningful independently of one Screen.

```flowspec
Action Generate meditation
```

Explicit `Action` remains fully supported inside Screens too.

---

## 4. Authoring guidelines

These guidelines improve scanability. They are not syntax requirements. Conservative lint suggestions may point at high-confidence cases; they never block parsing and are never auto-fixed.

### Outcome is optional

Use `Outcome` when the resulting state is meaningful to the wider flow, can be depended on later, or is not already obvious from the Action and its Steps.

Discourage redundant Outcomes such as:

```flowspec
Action Select focus

  Outcome
    Focus is selected
```

Prefer omitting the Outcome when the Action already makes that state obvious. Lint **FS101** may warn on obvious restatements (warning only).

### Receives is optional

Omit `Receives` when the input is already obvious from the interaction context.

```flowspec
Screen Choose voice

  Select voice
    ...
```

usually does not need:

```flowspec
Receives
  Voice
```

unless documenting that input adds useful information. Lint **FS102** may warn when a `When` trigger already supplies the same singular input (warning only).

### Prefer Screen interactions over redundant When + Action

This pattern is valid but often unnecessarily verbose for local UI:

```flowspec
When the user selects a focus

  Action Select focus
```

Prefer:

```flowspec
Screen Choose focus

  Select focus
    ...
```

Do not remove `When` from the language. `When` remains appropriate for system events, external events, lifecycle events, and triggers that are not obvious local Screen interactions:

```flowspec
When the user becomes signed in
When connectivity returns
When generation completes
```

Lint **FS103** may warn on high-confidence duplicate `When` + `Action` phrasing (warning only).

### Prefer one Action for variants of the same decision

When multiple Actions are variants of the same user decision, prefer one Action with `If` / `Otherwise` when that is clearer:

```flowspec
Select voice

  If the voice requires Premium and the user has no Premium
    Go to Premium paywall

  Otherwise
    Store selected voice
    Go to Choose duration
```

Prefer that over separate Actions such as "Select free voice", "Gate Premium voice", and "Select Premium voice". This is an authoring guideline only — there is no automatic linter rule for combining Actions.

### Shared Rules should not be duplicated unnecessarily

If multiple sibling behaviors repeat the same Rules, prefer defining or restructuring the shared behavior once when that improves clarity. Lint **FS104** may warn when identical Rules lists repeat across sibling Actions (warning only). FlowSpec does not move or rewrite Rules automatically.

### Discourage single-step wrapper Actions

An Action whose only purpose is wrapping one simple Step or `Go to` may be unnecessary unless the Action is independently meaningful:

```flowspec
Action Gate Premium voice

  Steps
    Go to Premium paywall
```

may be simplified to a direct conditional transition. Lint **FS105** may warn (warning only).

### `Action` vs `Steps`

- **`Action`** names a unit of behavior (what the user or system does).
- **`Steps`** lists required functional work inside that action, without prescribing technical implementation or executable test steps.

Under a Screen interaction, functional work may also appear as direct indented lines when that stays clear (see the concise examples). Prefer `Steps` when grouping work helps readability.

FlowSpec documents "too technical" / "too test-oriented" wording as a convention only; it does not detect it automatically.

### Recommended section order

When multiple sections and action-level control-flow are present:

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

Incorrect order produces **FS009** (structural warning). When `Outcome` is present but is not the final direct child, **FS017** warns. `Outcome` itself is never required.

---

## 5. Concise examples

### Local Screen interactions

```flowspec
Screen Choose focus

  Shows
    Focus options

  Select focus
    Rules
      Focus must be one of Breathing, Visualization, Affirmation, Balanced

    Store selected focus
    Go to Choose voice
```

instead of a verbose `When` + `Action` + redundant `Receives` / `Outcome` wrapper.

### Decision variants in one Action

```flowspec
Screen Choose voice

  Select voice
    If the voice requires Premium and the user has no Premium
      Go to Premium paywall

    Otherwise
      Store selected voice
      Go to Choose duration
```

### Keep When for non-local triggers

```flowspec
When the user becomes signed in

  Action Enter conversation
    ...
```

### Keep Outcome when later work depends on it

```flowspec
Action Create quick replies
  ...
  Outcome
    Quick replies are available

Once quick replies are available
  ...
```

Canonical samples:

- Concise Screen interactions: [`examples/fixtures/choose-focus.flowspec`](examples/fixtures/choose-focus.flowspec)
- Coordinated `When` / `Once` flow: [`examples/answer-a-user-message.flowspec`](examples/answer-a-user-message.flowspec)
- Lifecycle `When` + explicit Actions: [`examples/fixtures/enter-jack-hunt.flowspec`](examples/fixtures/enter-jack-hunt.flowspec)
- AI `Uses` example: [`examples/fixtures/bootstrap-conversation.flowspec`](examples/fixtures/bootstrap-conversation.flowspec)

---

## 6. Linting behavior

FlowSpec v1 includes a structural linter reusable from the CLI, tests, the VS Code extension, and CI.

Style warnings never block parsing. By default they do not fail the CLI either (unless `--warnings-as-errors`). There is no auto-fix and no LLM-based analysis.

### Diagnostic categories

#### Structural errors

Invalid FlowSpec. Exit code `1`.

#### Structural warnings

Valid FlowSpec that is structurally discouraged (ordering, empty Actions, unresolved / ambiguous `Go to`, casing). Exit code `0` unless `--warnings-as-errors`.

#### Style warnings

Valid FlowSpec that may be more verbose than necessary (FS101–FS105). Exit code `0` unless `--warnings-as-errors`. Never auto-fixed.

### Run the linter

```bash
npm run flowspec -- lint "examples/**/*.flowspec"
# or
node bin/flowspec.js lint "examples/**/*.flowspec"
# or, after npm link / install
flowspec lint "flowspec/**/*.flowspec"
```

| Flag | Behavior |
| ---- | -------- |
| `--format json` | Machine-readable JSON for CI |
| `--warnings-as-errors` | Exit `1` when warnings are present |

Exit codes:

- `1` when one or more **errors** exist (or when `--warnings-as-errors` and warnings exist)
- `0` when there are only warnings or no diagnostics

### Restriction table

#### Structural errors

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
| FS011 | error | `At the same time` only inside `Steps` |
| FS012 | error | `Once` / `If` / `Otherwise` / `If … fails` may appear directly inside a `Flow`, `Screen`, or `Action`, or inside `Steps` — not inside `Receives`, `Rules`, `Uses`, `Shows`, or `Outcome` |
| FS013 | error | `Otherwise` must match a preceding `If` at the same indent in the same parent |

#### Structural warnings

| Code | Severity | Rule |
| ---- | -------- | ---- |
| FS009 | warning | Recommended section order: Receives → Rules → Uses → Steps → control-flow → Shows → Outcome |
| FS010 | warning | `Action` should not be empty (`Id` alone does not count) |
| FS014 | warning | `Go to` target should resolve to a **top-level** `Flow`, `Screen`, or `Action` name or `Id` in any loaded file (not Actions nested under `When` / control-flow) |
| FS015 | warning | `Go to` target should not match more than one name/Id (including across files) |
| FS016 | warning | Unknown or incorrectly cased directive (with suggestion when possible) |
| FS017 | warning | When present, `Outcome` should be the final direct child of an `Action` |

#### Style warnings

| Code | Severity | Rule |
| ---- | -------- | ---- |
| FS101 | warning | `Outcome` may be redundant when it merely restates the `Action` name (obvious cases only) |
| FS102 | warning | `Receives` may be redundant when a `When` trigger already supplies the same singular input |
| FS103 | warning | `When` trigger and nested `Action` appear to describe the same interaction |
| FS104 | warning | Identical `Rules` lists repeated across sibling `Action`s in the same `Flow` or `Screen` |
| FS105 | warning | `Action` only wraps a single simple `Steps` child (optional `Id` allowed); consider inlining |

v1 does **not** support suppression comments or configuration files.

### Go to resolution

`Go to` may reference a display name or an `Id` of a **top-level** `Flow`, `Screen`, or `Action`:

- the file’s `Flow`
- a `Screen` that is a direct child of a `Flow`
- an `Action` that is a direct child of a `Flow` or `Screen` (including implicit Actions under a Screen)

Actions nested under `When`, `Once`, `If`, or other control-flow are **not** valid `Go to` destinations. Prefer lifting reusable destinations to Flow or Screen scope, or navigate to a Screen / top-level Action instead.

The target may be defined in the **same file or any other loaded `.flowspec` file**. Project-level linting (`lintFlowSpecProject`, the CLI with a multi-file glob, and the VS Code extension in a workspace) resolves targets across files, detects duplicate Ids (FS006), unresolved references (FS014), and ambiguous names (FS015). Use an `Id` when display names collide across files.

### CI example

```yaml
- name: Lint FlowSpec
  run: npm run flowspec -- lint "examples/**/*.flowspec"
```

### Programmatic API

```js
const {
  lintFlowSpecFile,
  lintFlowSpecProject,
} = require("flowspec"); // or ./lib

lintFlowSpecFile(source, filePath);
lintFlowSpecProject([{ source, filePath }]);
```

---

## 7. Stable Ids

`Id` is optional on `Flow`, `Screen`, and `Action`. Ids:

- are unique across the loaded FlowSpec project;
- stay independent from the display name;
- are stable machine-readable references (do not regenerate them when names change);
- use lowercase letters, numbers, hyphens, underscores, and periods.

Recommended format:

```text
^[a-z0-9][a-z0-9._-]*$
```

```flowspec
Action Send login code
Id authentication.send-login-code
```

---

## 8. Meaning of the core sections

```text
Receives  → What does this action need?
Rules     → What must remain true?
Uses      → What capability or runtime dependency is used?
Steps     → What functionally happens?
Shows     → What does the user see?
Outcome   → What is true or available afterwards?
```

---

## 9. FlowSpec vs Gherkin

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

---

## 10. Repository layout

| Path | Contents |
| ---- | -------- |
| [`examples/`](examples/) | Canonical FlowSpec samples |
| [`lib/`](lib/) | Parser, linter (FS001–FS017, FS101–FS105), and CLI |
| [`bin/flowspec.js`](bin/flowspec.js) | `flowspec` CLI entry |
| [`test/`](test/) | Parser, linter, and CLI tests |
| [`vscode-extension/`](vscode-extension/) | Syntax highlighting + diagnostic integration |

---

## 11. Current limitations

- FlowSpec v1 is a **descriptive** specification format only.
- No language server, formatter, autocomplete, or auto-fix.
- No automatic generation of Gherkin, unit tests, or executable suites.
- No automatic detection of behavioral drift or of "too technical" steps.
- No rule suppression comments or configurable rule sets in v1.
- No automatic combining of Actions or moving of shared Rules.
- The VS Code TextMate grammar highlights explicit directives reliably. **Implicit Actions** (bare named interaction lines under a `Screen`) are not given special scopes, because TextMate cannot reliably distinguish them from ordinary prose without brittle indent look-ahead. They still parse and lint as Actions.
- The VS Code extension debounces project-wide lint (all workspace `.flowspec` files) so `Go to` and `Id` checks resolve across files while editing.

---

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
