# FlowSpec Editor

A focused native macOS editor for `.flowspec` files. It includes document-based open/save, folder workspaces, FlowSpec syntax highlighting, contextual directive completion, line numbers, two-space indentation controls, automatic indentation on Return, the native find bar, and automatic light/dark appearance support.

Directive suggestions appear as you type at the start of a line and follow FlowSpec's indentation-based ownership rules. For example, a line inside `Steps` offers flow-control directives rather than structural or section directives. Use the arrow keys to choose, then press `Tab` or `Return` to insert. Press `Escape` to close the list or `Control-Space` to open it on an empty line.

Use **File → Open Folder…** to open a folder of FlowSpec files in a workspace window. The sidebar includes `.flowspec` files from nested folders and ignores unrelated files. If a file declares `Entry` triggers, incoming-trigger chips appear under the filename so externally reachable flows are easy to scan. If the folder contains `index.flowspec`, it opens first. Unsaved workspace files receive a dot in the sidebar and the window uses the standard macOS edited indicator. Press `⌘S` or use the toolbar Save button to save the active file; pending edits remain available when switching between files.

`Go to` destinations are shown as links. Click the destination name to open its matching top-level Flow, Screen, or Action. Folder workspaces resolve names and `Id` values across all loaded FlowSpec files, using the same rules as the linter. Renaming a Flow, Screen, or Action name or `Id` also updates unique `Go to` references to that destination, including references in other workspace files.

Referenced Flow, Screen, and Action declarations show a `← Referenced by N` annotation. Click it, or place the cursor in that node, to open a backlink rail of incoming references. Each item opens the source file and selects the referencing directive. Use Back and Forward to return.

The editor bundles the canonical core directly from the repository's root `lib/` directory and uses it for linting, syntax highlighting, navigation, and the Improve authoring guide. A soft red dashed underline marks structure that needs attention; an amber dotted underline marks an authoring suggestion. Toggle the **Structure hints** drawer at the bottom, then hover underlined text to read its plain-language explanation in the drawer. The linter runs entirely on the Mac with no network service or AI involved.

## Open and run

1. Open `FlowSpecEditor.xcodeproj` in Xcode.
2. Select the `FlowSpecEditor` scheme and `My Mac` destination.
3. Press **Run** (`⌘R`).

The app targets macOS 14 or newer. Sparkle 2 provides in-app updates for Developer ID builds.

## Releasing

Updates are published as GitHub Releases on `mdings/FlowSpec`. Installed copies check `https://github.com/mdings/FlowSpec/releases/latest/download/appcast.xml`.

### One-time setup

1. Generate an EdDSA key pair (stored in your login keychain):

   ```bash
   ./scripts/release.sh keys
   ```

2. Paste the printed `SUPublicEDKey` into `FlowSpecEditor/Info.plist`, replacing `REPLACE_WITH_SPARKLE_PUBLIC_ED_KEY`.
3. Export the private key and add it as the GitHub secret `SPARKLE_PRIVATE_KEY`:

   ```bash
   ./.sparkle-tools/bin/generate_keys -x sparkle_private.key
   ```

   Then delete `sparkle_private.key`. Also add the same Apple signing/notarization secrets used by Cogent/Anything: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.

### Ship a build

From a clean `main` branch:

```bash
npm run release:patch   # or release:minor / release:major
```

That bumps `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in the Xcode project, commits, tags `editor-vX.Y.Z`, and pushes. Sparkle compares `CURRENT_PROJECT_VERSION` (`CFBundleVersion`), so the script increments it on every release.

The [Release Editor](../.github/workflows/release-editor.yml) workflow then archives a universal Release build, notarizes it, writes `appcast.xml`, and uploads both files to the GitHub Release.

Users install `FlowSpecEditor.zip` once. Later versions appear under **FlowSpec Editor → Check for Updates…**. Debug runs from Xcode do not check the feed.

To package locally instead of CI:

```bash
./scripts/release.sh package
```

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
