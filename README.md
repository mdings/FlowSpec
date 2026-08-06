# FlowSpec

## What is FlowSpec?

FlowSpec is a human-readable framework for describing business logic to LLMs.

We already have wireframes for UX, mockups for visual design, and test-driven development for code. What is still missing is a simple, standardized way to define how an application should behave.

As vibe coding becomes more common, it becomes harder to maintain a clear mental model of an app’s logic. Business rules end up scattered across prompts, Markdown files, tests, and implementation details—or trapped inside the context of a single LLM session.

FlowSpec provides a single, structured source of truth for that behavior. It defines what the application must do, while leaving the LLM free to decide how to implement it.

Because the specification is structured, it can also be used to detect behavioral drift before deployment—for example when changing prompts, switching models, adding new tools, or modifying the underlying tech stack.

**Let LLMs decide how to build. Keep control over what the product does.**

| Directive          | Description                                                                                                            | Example                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `FLOW`             | Names a complete user journey or business flow. A flow usually contains one or more screens and actions.               | `FLOW: Answer a user message`                                                         |
| `SCREEN`           | Defines the screen, page, modal, or UI context in which behavior takes place.                                          | `SCREEN: Conversation`                                                                |
| `ACTION`           | Defines something the user or the system does. An action can contain inputs, rules, steps, UI effects, and an outcome. | `ACTION: Create quick replies`                                                        |
| `Receives`         | Lists the information an action needs before it can run.                                                               | `Receives`<br>`  User message`<br>`  Product results`                                 |
| `Rules`            | Defines business constraints that must always remain true. Rules describe boundaries, not implementation details.      | `Rules`<br>`  Show no more than 3 quick replies`                                      |
| `Steps`            | Defines the required functional work and sequence within an action, without prescribing the technical implementation.  | `Steps`<br>`  Inspect the best search result`<br>`  Create relevant chips`            |
| `Shows`            | Describes what becomes visible to the user as a result of an action.                                                   | `Shows`<br>`  Quick replies below the assistant response`                             |
| `Outcome`          | Defines the observable or reusable result of an action. Other actions can wait for this outcome.                       | `Outcome`<br>`  Quick replies are available`                                          |
| `Go to`            | Navigates the user to another screen or flow.                                                                          | `Go to: Verify login code`                                                            |
| `When`             | Defines the event or trigger that starts behavior.                                                                     | `When the user sends a message`                                                       |
| `At the same time` | Groups actions that may begin in parallel and do not need to wait for each other.                                      | `At the same time`<br>`  Find relevant products`<br>`  Create the assistant response` |
| `Once`             | Starts behavior only after a specific outcome or dependency is available.                                              | `Once product results are available`<br>`  Create quick replies`                      |
| `If`               | Defines behavior that only occurs when a condition is true.                                                            | `If the best result is a brand`<br>`  Create product chips from that brand`           |
| `Otherwise`        | Defines the alternative path when the preceding `If` condition is not true.                                            | `Otherwise`<br>`  Create relevant category chips`                                     |
| `If … fails`       | Defines the fallback or error path when an action cannot complete successfully.                                        | `If product search fails`<br>`  Show the assistant response without quick replies`    |

## Standard action structure

Use the same section order wherever possible:

```
ACTION: [Action name]

Receives
  [Required input]

Rules
  [Business constraints]

Steps
  [Required functional steps]

Shows
  [Visible UI result]

Outcome
  [Observable or reusable result]
```

Not every action needs every section. Omit sections that do not apply, but keep the remaining sections in this order.

## Complete example

```
FLOW: Answer a user message

SCREEN: Conversation

When the user sends a message

  At the same time

    ACTION: Find relevant products

      Receives
        User message

      Steps
        Search for products using the user message
        Rank the matching products

      Outcome
        Product results are available

    ACTION: Create assistant response

      Receives
        User message

      Steps
        Interpret the user’s request
        Generate a relevant response

      Outcome
        Assistant response is available

  Once assistant response is available

    ACTION: Show assistant response

      Receives
        Assistant response

      Shows
        Assistant response in the conversation

      Outcome
        Assistant response is shown

  Once product results are available

    ACTION: Create quick replies

      Receives
        User message
        Product results

      Rules
        Show no more than 3 quick replies
        Quick replies must use available product information

      Steps
        Inspect the best search result

        If the best result is a brand
          Create product chips from that brand

        Otherwise
          Create relevant category chips

      Outcome
        Quick replies are available

  Once quick replies are available

    ACTION: Show quick replies

      Receives
        Quick replies

      Shows
        Quick replies below the assistant response

      Outcome
        Quick replies are shown

  If product search fails

    ACTION: Continue without quick replies

      Shows
        Assistant response without quick replies

      Outcome
        Conversation remains usable
```

## Meaning of the core sections

```
Receives  → What does this action need?
Rules     → What must always remain true?
Steps     → What must functionally happen?
Shows     → What does the user see?
Outcome   → What is true or available afterwards?
```

## Frequently asked questions

### Is FlowSpec a programming language?

No. FlowSpec describes **what an application must do**, not how it should be implemented. Developers and LLMs remain free to choose the architecture, frameworks, services, and implementation details.

### Is FlowSpec a replacement for tests?

No. FlowSpec defines expected business behavior and can be used to generate or guide tests. Existing unit, integration, and end-to-end tests remain important for verifying the implementation.

### How is FlowSpec different from Gherkin or BDD?

Gherkin is primarily designed around executable test scenarios using `Given`, `When`, and `Then`. FlowSpec is intended to be a broader, more easily scannable source of truth for complete user journeys, business rules, dependencies, parallel behavior, and expected outcomes.

### How is FlowSpec different from a product requirements document?

A product requirements document often combines goals, context, design decisions, and requirements in prose. FlowSpec focuses specifically on application behavior and expresses it through a small, standardized vocabulary that both people and LLMs can interpret consistently.

### Does FlowSpec prescribe the technical architecture?

No. A specification might state that a login code must expire after ten minutes, but it does not prescribe which database, authentication provider, framework, or backend function should be used.

### Why is standardization important for LLMs?

Natural-language prompts leave room for interpretation. A standardized structure helps an LLM distinguish between inputs, mandatory rules, required steps, dependencies, visible effects, and expected outcomes. This reduces assumptions and produces more consistent implementations across prompts, tools, and models.

### Can an LLM generate a FlowSpec?

Yes, but the resulting specification should be reviewed and approved by a person. The purpose of FlowSpec is to keep product behavior under human control rather than allowing an LLM to silently invent business logic.

### Can FlowSpec be used with existing applications?

Yes. An existing user journey can be documented as a FlowSpec and then compared with the current implementation. This can also reveal undocumented behavior and rules that currently exist only in the codebase.

### What is behavioral drift?

Behavioral drift occurs when the implementation no longer matches the approved FlowSpec. This can include missing behavior, changed ordering, weakened rules, altered navigation, or new business logic that was never documented.

### Can FlowSpec block a deployment?

Potentially. A CI pipeline could compare code changes and executable tests against the relevant FlowSpecs. When critical drift is detected, the pipeline can report the difference and prevent deployment until it is resolved.

### Does FlowSpec require a specific LLM or coding tool?

No. It should work as a model-independent contract that can be used with tools such as Cursor, Codex, Claude Code, GitHub Copilot, or other current and future development agents.

### Where should FlowSpec files live?

The simplest approach is to keep them alongside the code in the repository. This makes them versionable, reviewable through pull requests, and available to both development tools and CI pipelines.

### Who is FlowSpec for?

FlowSpec is intended for founders, product managers, designers, developers, and AI-assisted teams that want the speed of vibe coding without losing control over product behavior.

### What is the current scope?

The first version focuses on describing flows, screens, actions, inputs, rules, steps, outcomes, navigation, conditions, dependencies, parallel behavior, and failure paths. It intentionally avoids defining technical implementation details.
