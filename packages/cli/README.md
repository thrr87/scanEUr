# @scaneur/cli

Command-line interface package for scanEUr v0.1.0.

Responsibilities:

- Command definitions.
- Argument parsing.
- Terminal output.
- Exit codes.
- Config file loading.
- Calling scanner and report packages.

This package must not contain core scanner logic.

## Quickstart from source

```bash
node packages/cli/src/index.js --version
node packages/cli/src/index.js scan examples/node-next-sentry-stripe --output scaneur-report.md
node packages/cli/src/index.js explain stripe
node packages/cli/src/index.js alternatives ga4
```

Default commands run locally and offline. The CLI must not collect telemetry or upload source code in v0.1.0.
