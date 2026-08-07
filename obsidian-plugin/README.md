# FlowSpec Graph for Obsidian

Read-only Obsidian plugin that discovers `.flowspec` files in a vault and visualizes relationships between **Flow**, **Screen**, and **Action** definitions.

v1 is intentionally minimal: no editing, no AI, and no integration with Obsidian's native graph.

## Features

- Discover all `.flowspec` files in the current vault
- Parse `Flow`, `Screen`, `Action`, `Id`, and `Go to`
- Build an in-memory relationship graph
- Command: **FlowSpec: Open graph**
- Distinct node styles for Flow / Screen / Action
- Click a node to open the source `.flowspec` file at that definition
- Unresolved `Go to` targets shown as dashed red edges / diamond nodes
- Auto-refresh when `.flowspec` files are added, removed, renamed, or changed

## Graph library

[Cytoscape.js](https://js.cytoscape.org/) — a mature graph library that bundles cleanly into Obsidian plugins and supports force layouts, styled node types, and click handlers without a custom canvas renderer.

## Install and test locally

### 1. Build the plugin

```bash
cd obsidian-plugin
npm install
npm run build
```

This produces `main.js` next to `manifest.json` and `styles.css`.

### 2. Install into an Obsidian vault

1. Create or open a vault (you can use `example-vault/` as a starting point).
2. Copy the plugin folder into the vault:

```bash
mkdir -p /path/to/vault/.obsidian/plugins/flowspec-graph
cp manifest.json main.js styles.css /path/to/vault/.obsidian/plugins/flowspec-graph/
```

Or symlink the whole `obsidian-plugin` directory:

```bash
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/flowspec-graph
```

3. In Obsidian: **Settings → Community plugins → Turn on community plugins**.
4. Enable **FlowSpec**.
5. Run **FlowSpec: Open graph** from the command palette (or use the ribbon fork icon).

### 3. Try the example vault files

Copy `example-vault/flows/*.flowspec` into your vault (or open `example-vault` itself as a vault after installing the plugin there). You should see:

- `Load conversation after sign-in` → `Enter conversation` → `Start conversation` / shopping session actions
- Id-based resolution to `conversation.bootstrap`
- An unresolved node for `Missing target that does not exist`

### Development watch mode

```bash
npm run dev
```

Rebuilds `main.js` on change. Reload the plugin in Obsidian (or use the Hot-Reload community plugin).

## Tests

```bash
npm test
```

Covers discovery, node parsing, `Go to` parsing, name resolution, Id resolution, and unresolved references.

## How it works

### Indexing

On load and on vault `create` / `modify` / `delete` / `rename` events for `.flowspec` files, the plugin:

1. Lists vault files with extension `flowspec`
2. Reads each file
3. Parses only structural directives and `Go to`
4. Resolves each `Go to` by exact definition **name** or optional **Id**
5. Rebuilds the in-memory graph and notifies open graph views

### Navigation

Clicking a resolved node opens that file in a workspace leaf and jumps to the definition line (`eState.line`, with a best-effort editor cursor fallback). Clicking an unresolved node shows a notice instead.

## Project layout

```text
obsidian-plugin/
  manifest.json
  styles.css
  src/
    main.ts          # Plugin entry, command, vault watchers
    graph-view.ts    # Cytoscape ItemView
    indexer.ts       # Vault indexing + definition navigation
    parser.ts        # Minimal FlowSpec parser
    graph.ts         # Discovery, resolution, graph build
    types.ts
  test/
  example-vault/
```
