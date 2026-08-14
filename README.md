# FlowSpec

FlowSpec is a high-level, human-readable format for describing the intended business logic and behavioral structure of an application.

**FlowSpec defines what an application must do while leaving developers and LLMs free to decide how it is implemented.**

It is a behavioral specification — not a programming language, not an executable test framework, and not a replacement for Gherkin or Cucumber.

**FlowSpec models the logic. Gherkin or other testing tools can verify concrete examples of that logic.**

### Core authoring principle

> FlowSpec should omit information that can be safely inferred from its structural context.

> Do not introduce an Action merely to repeat the name of its owning Flow.

> If behavior only makes sense while a Screen is active, place it under that Screen.

> Indentation determines ownership. Adjacency never does.

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
- **Indentation determines ownership. Adjacency never does.** Blank lines are cosmetic.
- Directives are recognized only at the beginning of a line after optional indentation. Directive-like words inside ordinary prose are not directives.
- Colons after directives are optional; both `Flow Sign in` and `Flow: Sign in` parse identically.
- `Screen`, top-level `Action`, control-flow, and behavioral sections that belong to a Flow must be **indented under** that Flow. An unindented `Screen` after a `Flow` is not owned by the Flow (FS024).
- Sections must be indented beneath their owning `Flow`, `Screen`, `Action`, `Section`, or `Layout` (as allowed for each section type).
- `Id` is optional on `Flow`, `Screen`, and explicit `Action` only. `Section`, `Layout`, and implicit Actions cannot have an `Id`. When present, place `Id` immediately after the structural directive; `Id` may share the owner's indentation (special association rule) so following indented children still belong to the owner.
- `Receives`, `Rules`, `Uses`, `Steps`, and `Outcome` are optional on a `Flow` or `Action`. `Shows` is optional and may only be a direct child of `Screen`.
- A `Flow` may own behavioral sections directly. An explicit `Action` is only needed when behavior deserves an independent name or identity.
- Behavior that is only meaningful while a Screen is active should normally be a child of that Screen. Flow-level `When` remains valid for overall/system events.
- `When` remains part of the language; it is not required for local Screen interactions (prefer implicit Actions).
- Older uppercase forms `FLOW`, `SCREEN`, `ACTION`, and `ID` still parse for backwards compatibility but produce **FS016** warnings. Prefer Title Case.

### Ownership hierarchy

```text
Flow
├── Id (optional; may share Flow indent)
├── direct Flow behavior (Receives / Rules / Uses / Steps / Outcome)
├── Flow-level When / Once / If / … (overall / system events)
├── Screen
│   ├── Id (optional; may share Screen indent)
│   ├── Shows / Layout / Section
│   ├── When / Once / If / Otherwise (screen-local)
│   ├── implicit Actions
│   └── explicit Actions
└── top-level Action (Flow-scoped capability)
```

---

## 2. Directive reference

The compact [language reference](docs/language-reference.md) is generated from
[`lib/language.js`](lib/language.js), the same definition consumed by the parser,
linter, VS Code and terminal grammars, and Swift editor. Edit the definition and
run `npm run generate`; `npm test` rejects stale generated surfaces.

Supported directives (exact casing):

```text
Flow
Screen
Action
Section
Layout
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
| `Flow` | Names a complete user journey, capability, or process. May own behavioral sections directly. | `Flow: Bootstrap conversation` |
| `Screen` | Defines the screen, page, modal, or UI context. | `Screen: Conversation` |
| `Action` | Independently meaningful behavior inside or alongside a Flow. Under a `Screen` or `Section`, the keyword may be omitted for a direct named interaction. | `Action: Create quick replies` |
| `Section` | A meaningful region within a `Screen` (or nested `Section`). Not navigable; no `Id`; not a `Go to` target. | `Section: Sidebar` |
| `Layout` | Describes spatial relationships between direct child `Section`s of a `Screen` or `Section`. | `Layout` / `  Sidebar \| Content` |
| `Id` | Optional stable machine-readable reference for a `Flow`, `Screen`, or `Action`. | `Id: conversation.create-quick-replies` |

### Behavioral sections

These sections may be owned by a `Flow` or an `Action` where noted. `Shows` is Screen-only; `Rules` is also available on Layout.

| Directive | Description | Example |
| --------- | ----------- | ------- |
| `Receives` | Information the Flow or Action needs before it can run. | `Receives` / `  Session` |
| `Rules` | Constraints that must remain true within the owning context (`Flow`, `Action`, or `Layout`). | `Rules` / `  Bootstrap only once per session` |
| `Uses` | Optional services, models, tools, or runtime configuration used by the Flow or Action. | `Uses` / `  Provider OpenAI` |
| `Steps` | Required functional work, without technical or test details. | `Steps` / `  Load conversation history` |
| `Shows` | What becomes visible to the user. Must be a direct child of `Screen`. | `Shows` / `  Conversation error with retry` |
| `Outcome` | Observable or reusable result; other behavior can wait for it. | `Outcome` / `  Conversation is ready` |

### Flow-owned behavior

A Flow may describe its own behavior directly. Prefer this when an Action would only repeat the Flow’s meaning:

```flowspec
Flow Bootstrap conversation
Id conversation.bootstrap

  Receives
    Session

  Rules
    Bootstrap the conversation only once per session

  Steps
    Load the conversation history

  Outcome
    Conversation is ready
```

Indentation remains mandatory. This is invalid because `Receives` is not indented beneath the Flow:

```flowspec
Flow Bootstrap conversation

Receives
  Session
```

### When to use Action

Use an explicit `Action` when the behavior deserves an independent name or identity within the Flow — reusable behavior, `Go to` targets, system capabilities, or decomposition into named units:

```flowspec
Flow Create meditation

  Screen Choose voice
    ...

  Action Generate meditation
  Id meditation.generate
    Steps
      Compose the meditation audio
```

Same-named Flow + Action pairs remain valid for backwards compatibility, but lint **FS106** may suggest moving the behavior onto the Flow when the Action adds no useful decomposition.

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

#### Passing arguments with Go to

A `Go to` statement may own indented argument clauses. These clauses describe
the handoff to the destination:

- `With …` supplies context, input, or instructions.
- `Without …` explicitly omits context or input, even when it is available in the current scope.

```flowspec
Go to Generate assistant reply
  With campaign AI instructions from the campaign
  Without user input
```

Every line indented directly beneath `Go to` is part of that destination's
argument handoff. `With` and `Without` are nested argument directives, so they
are highlighted and meaningful only within the owning `Go to`; they are not
valid as standalone directives.
The handoff remains descriptive: FlowSpec records what is supplied or omitted
without prescribing the implementation's calling convention.

`Once`, `If`, `Otherwise`, and `If … fails` may appear directly inside a `Flow`, `Screen`, or `Action`, or inside `Steps`.

`Uses` may appear as a direct section inside a `Flow` or an `Action` (not inside a `Screen`, or nested under another section). It is descriptive only — not infrastructure-as-code.

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

### Screen owns screen-local behavior

Anything that is only meaningful while a Screen is active should normally be structurally owned by that Screen:

```flowspec
Flow Home
Id home.main

  Screen Home
  Id home.screen

    Shows
      Mood selector

    Select mood
      Store selected mood

    When the user changes mood
      Store selected mood
```

Prefer the concise implicit Action (`Select mood`) when the interaction is obvious. Use `When` under the Screen when the event itself adds meaningful context.

### Local vs global events

| Kind | Prefer | Example |
| ---- | ------ | ------- |
| Local interaction | Implicit Action under Screen | `Open Profile` / `  Go to profile.screen` |
| Meaningful screen-local event | `When` under Screen | `When the payment authorization expires` |
| Overall / system event | `When` under Flow | `When connectivity returns` |

Flow-level `When` remains valid. Lint **FS107** may warn when a Flow-level `When` looks like a screen-local UI interaction sitting beside a Screen (warning only).

### Screen interactions (implicit Actions)

Inside a `Screen` or `Section`, a direct named interaction line may omit the `Action` keyword. When that line has nested behavior (a section, control-flow, `Go to`, or `At the same time`), FlowSpec treats it as an Action and normalizes it to the same internal Action representation as an explicit `Action`.

```flowspec
Flow Voice

  Screen Choose voice

    Shows
      Voice options
      Voice name for the held voice
      Voice description for the held voice

    Select voice
      If the voice requires Premium
        Go to Premium paywall
```

is equivalent to writing `Action Select voice` / `Action Hold voice` under that Screen.

**Boundaries**

- Implicit Actions are allowed only as **direct children of a Screen or Section**.
- They must have **nested behavior** (not merely indented prose notes).
- They are **not** inferred inside a `Flow`, `Action`, `Steps`, `Rules`, `Shows`, `Outcome`, `Uses`, or other sections.
- Ordinary prose and section body lines are never promoted to Actions.
- Optional `Id` for an implicit Action must be indented under the interaction name.


### Section

A `Section` is a meaningful region within a `Screen`. It may nest inside another `Section` with no depth limit.

```flowspec
Screen Today

  Shows
    Navigation in Sidebar
    Tasks in Content

  Section Sidebar
  Section Content
```

Nested:

```flowspec
Screen Today

  Section Main

    Section Task list
      ...

    Section Inspector
      ...
```

**Rules**

- Ownership: direct child of `Screen` or `Section` only.
- May contain `Layout`, nested `Section`, implicit/explicit Actions, and supported Screen-level control-flow where already appropriate.
- Behavior is optional — a Section with nested Sections or Layout is valid.
- Implicit Actions inside a Section work the same as under a Screen.
- **No `Id`.** **Not a `Go to` target.** If a region needs independent navigation, model it as a `Screen`.

### Layout

`Layout` describes the spatial relationship between **direct child Sections** of its owning `Screen` or `Section`. It is human-readable and implementation-neutral — not CSS, grid, or flexbox.

```flowspec
Screen Today

  Layout
    Sidebar | Content | Inspector

  Section Sidebar
  Section Content
  Section Inspector
```

`|` communicates horizontal placement. Separate lines communicate rows / vertical stacking. Descriptive phrases such as `across top` are preserved as prose; they are not a formal grammar.

**Ownership**

- Direct child of `Screen` or `Section`.
- Exception: a `Layout` may appear directly inside a `When` whose parent is a `Layout` (alternate layout for that condition).
- At most one direct default `Layout` per Screen/Section (duplicate → **FS018**).
- Not allowed under `Action`, or under a `When` that is not owned by a `Layout` (**FS020**).

**Contents**

- Plain layout statements (content lines).
- `Rules` — layout constraints (`Sidebar can be collapsed`).
- `When` — condition that switches to a nested alternate `Layout`.

Blank lines never affect parsing. Nested Layout under a Layout-owned `When` is an **alternate layout state**, not a nested visual container.

**Name resolution**

Names in Layout statements resolve only against **direct child Sections** of the owning Screen/Section (longest prefix / exact match, including descriptive suffixes like `Header across top` → `Header`). Unresolved → **FS021** (warning). Ambiguous sibling Section names → **FS022** (warning). Nested descendant Sections are not searched.

`Layout` cannot have an `Id` and is not a `Go to` target.

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

### Prefer Flow-owned behavior over a same-named Action

When a Flow’s only content is an Action that repeats the Flow name, move the behavior onto the Flow:

```flowspec
Flow Bootstrap conversation

  Receives
    Session

  Steps
    Load conversation history
```

Keep an explicit Action when it is independently meaningful, referenced by `Go to`, or part of a larger multi-behavior Flow. Lint **FS106** may warn on redundant same-named wrappers (warning only).

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
Flow Start free meditation

  Screen Choose focus

    When the user selects a focus

      Action Select focus
```

Prefer:

```flowspec
Flow Start free meditation

  Screen Choose focus

    Select focus
      ...
```

Do not remove `When` from the language. `When` remains appropriate for system events, external events, lifecycle events, and triggers that are not obvious local Screen interactions:

```flowspec
Flow Enter app

  When the user becomes signed in
  When connectivity returns
  When generation completes
```

Lint **FS103** may warn on high-confidence duplicate `When` + `Action` phrasing (warning only). Lint **FS107** may warn when a Flow-level `When` looks screen-local.

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

When multiple sections and control-flow are present on a `Flow` or `Action`:

```flowspec
Flow: [Flow name]
Id: [stable identifier]

  Receives
    [Required input]

  Rules
    [Business constraints]

  Uses
    [Services, models, tools, or runtime configuration]

  Steps
    [Required functional work]

  If [branch]
    [Branch work]

  Outcome
    [Observable or reusable result]
```

The same order applies inside an explicit `Action`. Incorrect order produces **FS009** (structural warning). When `Outcome` is present but is not the final direct behavioral child, **FS017** warns. `Outcome` itself is never required.

---

## 5. Concise examples

### Local Screen interactions

```flowspec
Flow Start free meditation

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

### Keep When for non-local / Flow-level triggers

```flowspec
Flow Enter app

  Screen Splash

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
- Flow-owned behavior (no redundant Action): [`examples/fixtures/flow-owned-behavior.flowspec`](examples/fixtures/flow-owned-behavior.flowspec)
- Screen-local interactions (Home): [`examples/fixtures/home.flowspec`](examples/fixtures/home.flowspec)
- Screen `Layout` / `Section`: [`examples/fixtures/today-layout.flowspec`](examples/fixtures/today-layout.flowspec)

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

Valid FlowSpec that may be more verbose than necessary (FS101–FS107). Exit code `0` unless `--warnings-as-errors`. Never auto-fixed.

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
| FS007 | error | `Receives` / `Uses` / `Steps` / `Outcome` only as direct children of a `Flow` or `Action`; `Rules` inside a `Flow`, `Action`, or `Layout`; `Shows` only as a direct child of `Screen` |
| FS008 | error | Each behavioral section at most once per `Flow` or `Action`; `Shows` at most once per `Screen`; `Rules` at most once per `Layout` |
| FS011 | error | `At the same time` only inside `Steps` |
| FS012 | error | `Once` / `If` / `Otherwise` / `If … fails` may appear directly inside a `Flow`, `Screen`, or `Action`, or inside `Steps` — not inside `Receives`, `Rules`, `Uses`, `Shows`, or `Outcome` |
| FS013 | error | `Otherwise` must match a preceding `If` at the same indent in the same parent |

#### Structural warnings

| Code | Severity | Rule |
| ---- | -------- | ---- |
| FS009 | warning | Recommended section order on `Flow` or `Action`: Receives → Rules → Uses → Steps → control-flow → Outcome |
| FS010 | warning | `Action` should not be empty (`Id` alone does not count) |
| FS014 | warning | `Go to` target should resolve to a **top-level** `Flow`, `Screen`, or `Action` name or `Id` in any loaded file (not Actions nested under `When` / control-flow) |
| FS015 | warning | `Go to` target should not match more than one name/Id (including across files) |
| FS016 | warning | Unknown or incorrectly cased directive (with suggestion when possible) |
| FS017 | warning | When present, `Outcome` should be the final direct behavioral child of a `Flow` or `Action` |
| FS018 | error | At most one direct default `Layout` under a `Screen` or `Section` |
| FS019 | error | `Id` is not allowed on `Section`, `Layout`, or implicit Actions |
| FS020 | error | `Layout` only inside a `Screen` or `Section`, or inside a `When` owned by a `Layout` |
| FS021 | warning | Layout statement references a name with no matching direct child `Section` |
| FS022 | warning | Layout statement references an ambiguous sibling `Section` name |
| FS023 | error | `Section` only inside a `Screen` or another `Section` |
| FS024 | error | Only the `Flow` may appear at document root; `Screen`, `Action`, control-flow, and sections must be indented under the Flow |

#### Style warnings

| Code | Severity | Rule |
| ---- | -------- | ---- |
| FS101 | warning | `Outcome` may be redundant when it merely restates the owning `Flow` or `Action` name (obvious cases only) |
| FS102 | warning | `Receives` may be redundant when a `When` trigger already supplies the same singular input |
| FS103 | warning | `When` trigger and nested `Action` appear to describe the same interaction |
| FS104 | warning | Identical `Rules` lists repeated across sibling `Action`s in the same `Flow` or `Screen` |
| FS105 | warning | `Action` only wraps a single simple `Steps` child (optional `Id` allowed); consider inlining |
| FS106 | warning | Direct `Action` whose display name repeats its owning `Flow`, when the Flow has no other meaningful Screens/Actions/behavior |
| FS107 | warning | Flow-level `When` looks like a screen-local UI interaction; consider nesting it under the nearby Screen |

v1 does **not** support suppression comments or configuration files.

### Go to resolution

`Go to` may reference a display name or an `Id` of a **top-level** `Flow`, `Screen`, or `Action`:

- the file’s `Flow`
- a `Screen` that is a direct child of a `Flow`
- an `Action` that is a direct child of a `Flow` or `Screen` (including implicit Actions under a Screen)

Actions nested under `When`, `Once`, `If`, `Section`, or other containers are **not** valid `Go to` destinations. `Section` and `Layout` are never `Go to` destinations. Prefer lifting reusable destinations to Flow or Screen scope, or navigate to a Screen / top-level Action instead.

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
Receives  → What does this Flow or Action need?
Rules     → What must remain true?
Uses      → What capability or runtime dependency is used?
Steps     → What functionally happens?
Shows     → What does the user see on this Screen?
Outcome   → What is true or available afterwards?
```

The Flow/Action questions apply to both owners. `Shows` belongs only to `Screen`.
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
| [`lib/`](lib/) | Parser, linter (FS001–FS024, FS101–FS107), and CLI |
| [`docs/language-reference.md`](docs/language-reference.md) | Generated language requirements and directive reference |
| [`bin/flowspec.js`](bin/flowspec.js) | `flowspec` CLI entry |
| [`test/`](test/) | Parser, linter, CLI, and syntax tests |
| [`syntaxes/`](syntaxes/) | Portable `bat` / syntect FlowSpec syntax (`.sublime-syntax`) |
| [`scripts/install-bat-syntax.sh`](scripts/install-bat-syntax.sh) | Install FlowSpec highlighting for `bat` |
| [`vscode-extension/`](vscode-extension/) | Syntax highlighting + diagnostic integration |

---

## 11. Terminal syntax highlighting

FlowSpec can be syntax-highlighted in terminals with [`bat`](https://github.com/sharkdp/bat) (syntect). This is separate from the VS Code extension: it works in Warp’s terminal, Terminal.app, iTerm, SSH sessions, and other terminals. It does **not** add FlowSpec highlighting to Warp’s built-in code editor.

```bash
brew install bat
./scripts/install-bat-syntax.sh   # or: npm run install:bat
bat path/to/file.flowspec
```

Example fixture: [`examples/fixtures/terminal-highlighting.flowspec`](examples/fixtures/terminal-highlighting.flowspec).

### Manual install

If you prefer not to use the helper script:

```bash
mkdir -p "$(bat --config-dir)/syntaxes"
cp syntaxes/FlowSpec.sublime-syntax "$(bat --config-dir)/syntaxes/"
bat cache --build
```

The Sublime/syntect definition reuses the same directive regexes as the VS Code TextMate grammar (`vscode-extension/syntaxes/flowspec.tmLanguage.json`). Keep both in sync when directives change.

---

## 12. Current limitations

- FlowSpec v1 is a **descriptive** specification format only.
- No language server, formatter, autocomplete, or auto-fix.
- No automatic generation of Gherkin, unit tests, or executable suites.
- No automatic detection of behavioral drift or of "too technical" steps.
- No rule suppression comments or configurable rule sets in v1.
- No automatic combining of Actions or moving of shared Rules.
- `If` / `Otherwise` are not supported inside `Layout` in v1 (use `When` for alternate layouts).
- The VS Code TextMate grammar (and the portable `bat` syntax) highlight explicit directives reliably. **Implicit Actions** (bare named interaction lines under a `Screen`) are not given special scopes, because TextMate/syntect cannot reliably distinguish them from ordinary prose without brittle indent look-ahead. They still parse and lint as Actions.
- The VS Code extension debounces project-wide lint (all workspace `.flowspec` files) so `Go to` and `Id` checks resolve across files while editing.
- Terminal highlighting via `bat` does not enable FlowSpec in Warp’s native editor; use the VS Code extension (or compatible editors) for IDE highlighting.

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
