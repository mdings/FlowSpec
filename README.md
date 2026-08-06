# FlowSpec

FlowSpec is a high-level, human-readable format for describing the intended business logic and behavioral structure of an application.

**FlowSpec defines what an application must do while leaving developers and LLMs free to decide how it is implemented.**

It is a behavioral specification — not a programming language, not an executable test framework, and not a replacement for Gherkin or Cucumber.

**FlowSpec models the logic. Gherkin or other testing tools can verify concrete examples of that logic.**

## v1 directive set

### Structural directives

| Directive | Description | Example |
| --------- | ----------- | ------- |
| `FLOW` | Names a complete user journey or business flow. | `FLOW: Answer a user message` |
| `SCREEN` | Defines the screen, page, modal, or UI context. | `SCREEN: Conversation` |
| `ACTION` | Defines something the user or the system does. | `ACTION: Create quick replies` |
| `ID` | Optional stable machine-readable reference for a `FLOW`, `SCREEN`, or `ACTION`. | `ID: conversation.create-quick-replies` |

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
| `At the same time` | Actions that may begin in parallel. | `At the same time` |
| `Once` | Start only after an outcome or dependency is available. | `Once product results are available` |
| `If` | Conditional path. | `If the best result is a brand` |
| `Otherwise` | Alternate path when the preceding `If` is not true. | `Otherwise` |
| `If … fails` | Fallback when something cannot complete successfully. | `If product search fails` |
| `Go to` | Navigate to another screen or flow. | `Go to: Verify login code` |

Colons after directives are optional; prefer the colon form in documentation (`FLOW:`, `ID:`).

## `ACTION` vs `Steps`

- **`ACTION`** names a unit of behavior (what the user or system does) within a flow and screen.
- **`Steps`** lists the **required functional work that must happen inside that action**, without prescribing technical implementation or describing executable test steps.

Internally, parsers may represent this section as `steps`. The visible directive remains `Steps`.

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

## Stable IDs

`ID` is optional on `FLOW`, `SCREEN`, and `ACTION`. IDs:

- are unique within a FlowSpec file;
- stay independent from the display name;
- are stable machine-readable references (do not regenerate them when names change);
- use lowercase letters, numbers, hyphens, underscores, and periods.

Recommended format:

```text
^[a-z0-9][a-z0-9._-]*$
```

Example:

```flowspec
FLOW: Answer a user message
ID: conversation.answer-message

SCREEN: Conversation
ID: conversation.screen

ACTION: Create quick replies
ID: conversation.create-quick-replies
```

## Standard action structure

Recommended order when multiple sections are present:

```flowspec
ACTION: [Action name]
ID: [stable identifier]

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

Not every section is required. Missing sections are allowed. Incorrect order should produce a **warning**, not a hard parse failure.

## FlowSpec vs Gherkin

| | FlowSpec | Gherkin / similar |
| - | -------- | ----------------- |
| Role | Behavioral model of the product | Concrete, often executable examples |
| Style | Descriptive structure | Scenario / step definitions |
| `When` | Behavioral trigger | Executable scenario step |

**Not part of FlowSpec v1:** `Given`, `Then`, `Expect`, `Assert`, `Mock`, `Fixture`, `Scenario`, executable test data, test-runner integration, or step definitions.

```text
FlowSpec describes the behavioral model.
Gherkin or other test frameworks verify concrete examples of that model.
```

## Canonical example

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

    ACTION: Create assistant response
    ID: conversation.create-response

      Receives
        User message

      Steps
        Interpret the user’s request
        Create a relevant response

      Outcome
        Assistant response is available

  Once assistant response is available

    ACTION: Show assistant response
    ID: conversation.show-response

      Receives
        Assistant response

      Shows
        Assistant response in the conversation

      Outcome
        Assistant response is shown

  Once product results are available

    ACTION: Create quick replies
    ID: conversation.create-quick-replies

      Receives
        User message
        Product results

      Rules
        Show no more than 3 quick replies
        Quick replies must use available product information

      Steps
        Inspect the best product-search result

        If the best result is a brand
          Create product chips from that brand

        Otherwise
          Create relevant category chips

      Outcome
        Quick replies are available

  Once quick replies are available

    ACTION: Show quick replies
    ID: conversation.show-quick-replies

      Receives
        Quick replies

      Shows
        Quick replies below the assistant response

      Outcome
        Quick replies are shown

  If product search fails

    ACTION: Continue without quick replies
    ID: conversation.continue-without-quick-replies

      Shows
        Assistant response without quick replies

      Outcome
        Conversation remains usable
```

The same file lives at [`examples/answer-a-user-message.flowspec`](examples/answer-a-user-message.flowspec).

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
| [`lib/`](lib/) | Small reusable parse + validate helpers (IDs, section order) |
| [`test/`](test/) | Parser and validation tests |
| [`vscode-extension/`](vscode-extension/) | VS Code syntax-highlighting extension |

## Current limitations

- FlowSpec v1 is a **descriptive** specification format only.
- No language server, formatter, or IDE diagnostics beyond optional use of `lib/`.
- No automatic generation of Gherkin, unit tests, or executable suites.
- No automatic detection of behavioral drift or of “too technical” steps.
- Validation covers ID format/uniqueness/attachment and recommended section-order **warnings** only.

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
