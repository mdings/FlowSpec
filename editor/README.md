# FlowSpec Editor

A focused native macOS editor for `.flowspec` files. It includes document-based open/save, folder workspaces, FlowSpec syntax highlighting, contextual directive completion, line numbers, two-space indentation controls, automatic indentation on Return, the native find bar, and automatic light/dark appearance support.

Directive suggestions appear as you type at the start of a line and follow FlowSpec's indentation-based ownership rules. For example, a line inside `Steps` offers flow-control directives rather than structural or section directives. Use the arrow keys to choose, then press `Tab` or `Return` to insert. Press `Escape` to close the list or `Control-Space` to open it on an empty line.

Use **File → Open Folder…** to open a folder of FlowSpec files in a workspace window. The sidebar includes `.flowspec` files from nested folders and ignores unrelated files. If a file declares `Entry` triggers, those names appear under the filename so externally reachable flows are visible in the list. If the folder contains `index.flowspec`, it opens first. Unsaved workspace files receive a dot in the sidebar and the window uses the standard macOS edited indicator. Press `⌘S` or use the toolbar Save button to save the active file; pending edits remain available when switching between files.

`Go to` destinations are shown as links. Click the destination name to open its matching top-level Flow, Screen, or Action. Folder workspaces resolve names and `Id` values across all loaded FlowSpec files, using the same rules as the linter. Renaming a Flow, Screen, or Action name or `Id` also updates unique `Go to` references to that destination, including references in other workspace files.

Referenced Flow, Screen, and Action declarations show a `← Referenced by N` annotation. Click it, or place the cursor in that node, to open a backlink rail of incoming references. Each item opens the source file and selects the referencing directive. Use Back and Forward to return.

The editor bundles the canonical core directly from the repository's root `lib/` directory and uses it for linting, syntax highlighting, navigation, and the Improve authoring guide. A soft red dashed underline marks structure that needs attention; an amber dotted underline marks an authoring suggestion. Toggle the **Structure hints** drawer at the bottom, then hover underlined text to read its plain-language explanation in the drawer. The linter runs entirely on the Mac with no network service or AI involved.

## Open and run

1. Open `FlowSpecEditor.xcodeproj` in Xcode.
2. Select the `FlowSpecEditor` scheme and `My Mac` destination.
3. Press **Run** (`⌘R`).

The app targets macOS 14 or newer and uses no external dependencies.

## Editor shortcuts

- `Tab`: indent the current line or selected lines by two spaces
- `Shift-Tab`: outdent the current line or selected lines
- `Return`: continue the current line's indentation
- `Control-Space`: show directives valid at the cursor
- `⌘F`: open the native find bar
- `⌥⌘F`: open find and replace
- `⌘O`, `⌘S`, `⇧⌘S`: standard macOS open/save commands
- `⇧⌘O`: open a folder of FlowSpec files

Syntax highlighting recognizes current FlowSpec directives with or without a colon. Indentation is intentionally preserved as the language's structural ownership mechanism.
