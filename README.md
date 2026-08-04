# UVM Testbench Visualizer

[![CI](https://github.com/anupkumarreddy/UVMTBVisualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/anupkumarreddy/UVMTBVisualizer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

UVM Testbench Visualizer is a local Electron desktop app that turns the static table produced by `uvm_top.print_topology()` into an interactive, color-coded UVM block diagram.

It reads a log file from disk, ignores simulator output outside the topology table, and lays out the test, environment, agents, drivers, monitors, sequencers, scoreboard, and RAL model as nested architecture blocks on a pannable D3 canvas. It does not parse SystemVerilog source or connect to a simulator.

## Run the app

Prerequisites: Node.js 20 or newer and npm.

```bash
npm install
npm start
```

Use **Open log** in the toolbar or **File → Open Log…** (`Cmd/Ctrl+O`) to select a `.log` or `.txt` file. The sample fixture at `test/fixtures/sample_topology.log` is useful for a quick smoke test.

## Canvas controls

- Drag the background to pan and scroll or pinch to zoom.
- Click a component block to populate the inspector.
- Click the numbered/minus control in a container header to collapse or expand its nested blocks.
- Search by instance name or class type. Matching blocks are highlighted, and collapsed ancestor containers are reopened automatically.
- Use **Fit view** to frame the visible hierarchy and **Expand all** to reopen every branch.

## Capture a topology log

Call the built-in UVM topology printer after the testbench has been built, for example:

```systemverilog
task run_phase(uvm_phase phase);
  uvm_top.print_topology();
  // test stimulus...
endtask
```

Many environments also print the topology around `run_test()` depending on their reporting setup. Redirect the simulator transcript to a file using the option supported by your simulator, for example:

```bash
vsim -c work.tb_top -do "run -all; quit" | tee simulation.log
./simv | tee simulation.log
xrun -R tb_top | tee simulation.log
```

The exact simulator command and flags vary by project. The app looks for a table whose `Name`, `Type`, and `Size` header is enclosed by divider lines, then uses leading whitespace to reconstruct parent/child relationships.

## Test and build

```bash
npm test
npm run build
```

The parser and type-inference modules are framework-free ES modules. Tests cover a clean log, a noisy simulator transcript, missing and malformed tables, irregular indentation, category precedence, and name fallback behavior.

## Known limitations

- This v1 visualizes one static topology table from one file at a time.
- It does not tail logs, animate phases or transactions, compare runs, or edit the topology.
- Categories are inferred from class/instance naming substrings, so unconventional naming can appear as **Unknown**. Rules live in `src/typeInference.js` and are intentionally easy to tune.
- Wrapped or heavily customized printer rows that no longer preserve whitespace-separated `Name`, `Type`, and `Size` fields may not parse.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md), and never attach proprietary simulator logs to public issues.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Anup Reddy.
