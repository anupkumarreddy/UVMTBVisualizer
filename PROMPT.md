# Build Prompt: UVM Testbench Hierarchy Visualizer (Electron App)

## Overview

Build a desktop application (Electron) that visualizes the component hierarchy of a UVM (Universal Verification Methodology) testbench as an interactive tree diagram. The tool does **not** parse SystemVerilog source and does **not** connect to a live simulator. Instead, it parses the **static text output** of UVM's built-in `uvm_top.print_topology()` call, which is commonly captured in simulation log files, and renders that hierarchy as an interactive SVG tree.

This is a v1 scope: **static structural diagram only** — no transaction/phase animation, no runtime log tailing.

---

## 1. Input: UVM Topology Log Format

UVM's `print_topology()` produces a table-formatted, indented ASCII block that looks like this (exact formatting/box-drawing characters vary slightly by simulator — Questa, VCS, Xcelium — but the structure is consistent):

```
UVM_INFO @ 0: reporter [UVMTOP] UVM testbench topology:
------------------------------------------------------------------------------
Name                          Type                          Size
------------------------------------------------------------------------------
uvm_test_top                  my_test                       -
  env                         my_env                        -
    agent0                    my_agent                      -
      driver                  my_driver                     -
      monitor                 my_monitor                    -
      sequencer               my_sequencer                  -
    agent1                    my_agent                      -
      driver                  my_driver                     -
      monitor                 my_monitor                    -
      sequencer               my_sequencer                  -
    scoreboard                my_scoreboard                 -
------------------------------------------------------------------------------
```

Key characteristics to design the parser around:
- The block is delimited by a header line and repeated `---...---` divider lines. Locate the block by finding the `Name`/`Type`/`Size` header row (or similar column headers — be tolerant of extra whitespace) between two divider lines of dashes.
- Depth in the tree is indicated by **leading whitespace indentation** (typically 2 spaces per level, but do not hard-code — infer indent unit from the first indented line and use consistent-multiple detection, falling back to raw whitespace-count comparison between siblings if indent width is irregular).
- Each row has three whitespace-separated columns: **Name** (instance name, e.g. `driver`), **Type** (SystemVerilog class name, e.g. `my_driver`), **Size** (usually `-` for scalar components, or an integer for arrays — can be ignored for v1 visualization but should be parsed and available in the details panel).
- The root row (`uvm_test_top` or similar, depth 0) is the tree root.
- The parser must be **tolerant of noise**: log files often have other `UVM_INFO`/simulator boilerplate lines before/after the topology block. Only the delimited table block should be parsed; everything else in the log is ignored.
- If no valid topology block is found in the selected file, the app should show a clear error state (not crash), e.g. "No UVM topology block found in this file."

---

## 2. Type Inference for Color-Coding

Since the log only provides a class-name string per component (not a semantic UVM category), infer a display category by **case-insensitive substring matching** on the Type column (fall back to Name column if Type match fails). Matching order/precedence (first match wins) and suggested color palette:

| Category    | Substrings matched         | Suggested color |
|-------------|----------------------------|------------------|
| Environment | `env`                      | `#4C6EF5` (blue) |
| Agent       | `agent`                    | `#7048E8` (violet) |
| Driver      | `driver`, `drv`            | `#E8590C` (orange) |
| Monitor     | `monitor`, `mon`           | `#2F9E44` (green) |
| Sequencer   | `sequencer`, `seqr`        | `#F08C00` (amber) |
| Scoreboard  | `scoreboard`, `sb`         | `#E03131` (red) |
| Sequence    | `sequence`, `seq`          | `#AE3EC9` (purple) |
| Test        | `test`                     | `#1098AD` (teal) |
| Register/RAL| `reg_block`, `_rm`, `ral`  | `#5C940D` (olive) |
| Default/Unknown | (no match)              | `#868E96` (gray) |

Implement this as a small, isolated, easily-editable mapping table/module (e.g. `src/typeInference.js`) — not hard-coded inline in the rendering code — so the categories/colors can be tuned later without touching layout/rendering logic.

---

## 3. Architecture & Tech Stack

- **Platform**: Electron (main process + renderer process, standard two-process model).
- **Rendering**: SVG in the renderer, laid out via **D3.js** (`d3-hierarchy`, specifically `d3.tree()` or `d3.cluster()`) for the tree layout algorithm; D3 selections for DOM/SVG manipulation and zoom/pan (`d3-zoom`).
- **No backend/server** — this is a pure desktop app, all parsing happens client-side (or in the Electron main process, communicated to renderer via IPC — your choice, but keep parsing logic framework-agnostic/pure-function so it's unit-testable independent of Electron).
- **Language**: JavaScript or TypeScript (prefer TypeScript if the project tooling supports it easily; otherwise plain JS is fine — don't over-engineer the build setup for a desktop tool).
- **No React/Vue/Svelte required** — vanilla D3 + DOM is sufficient given the scope; a UI framework is optional if it meaningfully simplifies the search box / details panel state, but is not a requirement.

### Suggested file/module structure

```
UVMTBVisualizer/
├── package.json
├── main.js                 # Electron main process: window creation, File > Open menu/dialog
├── preload.js              # contextBridge-exposed IPC (safe file read into renderer)
├── src/
│   ├── index.html          # App shell: toolbar (Open, Search box), SVG canvas container, details panel
│   ├── renderer.js          # Wires up UI: file load → parse → render, search, click handlers
│   ├── topologyParser.js   # Pure function(s): raw log text -> hierarchical JS object tree
│   ├── typeInference.js    # Pure function: (name, type) -> category + color
│   ├── treeRenderer.js     # D3 tree layout + SVG render, collapse/expand, pan/zoom
│   └── styles.css
└── test/
    └── topologyParser.test.js  # Unit tests for the parser against sample log fixtures
```

---

## 4. Parser Contract (`topologyParser.js`)

Implement and export a pure function:

```js
/**
 * @param {string} logText - full raw contents of the selected .log file
 * @returns {{ root: TopologyNode } | { error: string }}
 */
function parseTopology(logText) { ... }

// TopologyNode shape:
// {
//   name: string,       // instance name, e.g. "driver"
//   type: string,       // class name, e.g. "my_driver"
//   size: string,       // raw size column value, e.g. "-" or "4"
//   category: string,   // inferred category key, e.g. "Driver"
//   color: string,      // hex color for category
//   path: string,       // full dotted instance path from root, e.g. "uvm_test_top.env.agent0.driver"
//   children: TopologyNode[]
// }
```

Write this parser to be **testable in isolation** with plain string fixtures (no DOM/Electron dependency). Include at least 3 test fixtures: (1) a clean well-formed topology block, (2) a log with surrounding noise/other UVM_INFO lines, (3) a malformed/missing-topology-block case that should return the `{ error }` shape gracefully.

---

## 5. UI / Interaction Requirements

### Toolbar
- **File > Open** menu item (native Electron menu) and/or a toolbar "Open Log…" button — both trigger a native file-open dialog filtered to `.log`/`.txt`/all files.
- **Search box** in the toolbar: as the user types, filter/highlight matching nodes by name or type (case-insensitive substring match). On finding matches:
  - Highlight matching node(s) distinctly (e.g. bright outline).
  - Auto-expand any collapsed ancestors of a match so it's visible.
  - Optionally auto-pan/center the view to the first match.
  - Show a "no matches" indicator when nothing matches.

### Tree Diagram
- Rendered as an SVG tree (top-down or left-right layout — left-right is often more readable for deep UVM hierarchies with long names; use your judgement, left-right recommended).
- Each node: rounded rectangle or circle, colored per the type-inference table, label showing the instance **name** (primary) with the **type** shown smaller/secondary (or in a tooltip) since names + types together can get visually busy.
- **Collapse/expand**: clicking a node with children toggles its subtree visibility (standard D3 collapsible tree pattern — store collapsed children in a `_children` field). Collapsed nodes show a visual indicator (e.g. a small badge with descendant count).
- **Pan/zoom**: mouse drag to pan, scroll/pinch to zoom, implemented via `d3-zoom` on the SVG `<g>` container.
- **Click for details**: clicking a node (not toggling collapse — decide a clear interaction split, e.g. click-on-label opens details panel, click-on-expand-icon toggles collapse) opens/updates a **details panel** (sidebar) showing: full instance path, name, type, size, inferred category.

### Details Panel
- Fixed sidebar (e.g. right side), initially empty/hidden with placeholder text ("Click a component to see details"), populated on node click with the fields above.

### Error / Empty States
- No file loaded yet: show a friendly empty state in the canvas area ("Open a UVM log file to visualize its testbench topology") with a prominent "Open Log…" button.
- Parse error (no topology block found): show the parser's error message clearly, don't silently fail or show a blank canvas.

---

## 6. Non-Goals (explicitly out of scope for this build)

- No parsing of SystemVerilog source files/class definitions.
- No live simulation connection or log-tailing/auto-reload.
- No transaction-level or phase-level animation/timeline view.
- No editing/saving of the topology (read-only visualization tool).
- No multi-file/multi-log comparison in v1.

---

## 7. Deliverable Checklist

1. Working Electron app launchable via `npm start` (or documented equivalent).
2. File > Open flow that reads a real `.log` file from disk and renders its topology.
3. Parser with unit tests covering the 3 fixture cases above, runnable via `npm test`.
4. Interactive SVG tree: pan, zoom, collapse/expand, color-coded by inferred type.
5. Working search box with highlight + auto-expand-to-match behavior.
6. Details panel showing full path/name/type/size/category on node click.
7. Clear empty and error states.
8. A short README.md covering: how to run, how to generate/capture a UVM topology log (e.g. `uvm_top.print_topology();` call or `+UVM_VERBOSITY` / `run_test()` default topology print, and how to redirect simulator stdout to a `.log` file), and known limitations.

---

## 8. Sample Fixture Log (for parser testing / manual smoke test)

Use this as one of the test fixtures and as a manual smoke-test file (save as `test/fixtures/sample_topology.log`):

```
# vsim -c -do "run -all; quit" tb_top
# UVM_INFO @ 0: reporter [RNTST] Running test my_test...
# UVM_INFO testbench.sv(42) @ 0: uvm_test_top [UVMTOP] UVM testbench topology:
# ----------------------------------------------------------------------------
# Name                          Type                          Size
# ----------------------------------------------------------------------------
# uvm_test_top                  my_test                       -
#   env                         my_env                        -
#     agent0                    my_agent                      -
#       driver                  my_driver                     -
#       monitor                 my_monitor                    -
#       sequencer               my_sequencer                  -
#     agent1                    my_agent                      -
#       driver                  my_driver                     -
#       monitor                 my_monitor                    -
#       sequencer               my_sequencer                  -
#     scoreboard                my_scoreboard                 -
#     ral_model                 my_reg_block                  -
# ----------------------------------------------------------------------------
# UVM_INFO @ 5000000: reporter [TEST_DONE] Test my_test completed.
# ** Note: $finish    : testbench.sv(120)
```

(Strip the leading `# ` comment markers when using as an actual fixture — they're included above only to keep this block visually distinct in markdown; real simulator stdout will not have them.)

---

## 9. Style/Quality Bar

- Keep parsing/inference logic (`topologyParser.js`, `typeInference.js`) pure and framework-free so they're testable without spinning up Electron.
- Keep D3 rendering code (`treeRenderer.js`) reasonably commented — tree layout code is often terse and hard to revisit later.
- No need for a build pipeline (webpack/vite) unless TypeScript is used — plain `<script>` includes of D3 (via npm + a simple bundler, or a vendored/CDN copy) are acceptable for this scope.
- Favor clarity and small modules over cleverness; this is a diagnostic/dev tool, not a product with scale requirements.
