# Contributing

Thanks for helping improve UVM Testbench Visualizer.

## Development setup

1. Install Node.js 20 or newer.
2. Fork and clone the repository.
3. Run `npm ci` to install the locked dependency set.
4. Run `npm start` to launch the Electron app.

The parser and type-inference modules are pure JavaScript and can be tested without launching Electron.

## Before opening a pull request

Run the same verification used by continuous integration:

```bash
npm run check
npm audit --audit-level=high
```

When changing topology parsing, add or update a fixture under `test/fixtures/` and cover the behavior with a Node test. When changing the block-diagram renderer, keep parsing and type inference independent from Electron and DOM APIs.

## Pull requests

- Keep changes focused and explain the user-visible impact.
- Do not commit simulator logs containing proprietary hierarchy names or project data. Use synthetic fixtures.
- Do not add inferred signal or TLM connections unless the source data proves that relationship.
- Update the README when behavior, setup, or known limitations change.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
