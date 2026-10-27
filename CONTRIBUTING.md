# Contributing

Use Node.js 24.19 or newer. Install the locked dependencies with `npm ci`.
Run `npm run build`, `npm test` and `npm run build:harmony` before submitting a
change. Desktop UI tests require Electron and a graphical session; they create
isolated test data under `test-results/`.

Keep notes, encryption keys, passwords, tokens and signing certificates out of
the repository. Preserve legacy note formats and test import/export compatibility
when changing storage. Do not include third-party themes, fonts or pet pictures
without verifying their redistribution rights and retaining their notices.

Contributions to the project's own code are made under MIT. Contributions to
third-party material remain subject to the relevant upstream license. Report
license/source provenance concerns with a file path, version and public source.
