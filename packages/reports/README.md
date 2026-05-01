# @scaneur/reports

Report rendering package for scanEUr.

Responsibilities:

- Markdown report rendering.
- JSON report rendering.
- Future HTML rendering.
- Future SARIF rendering.
- Future `sovereignty-bom.json` rendering.

## Markdown

```js
import { renderMarkdownReport } from "@scaneur/reports";

const markdown = renderMarkdownReport(scanResult);
```

The Markdown renderer includes the required disclaimer, separates evidence from unknowns, and redacts values that look like actual secrets.

## JSON

```js
import { renderJsonReport } from "@scaneur/reports";

const json = renderJsonReport(scanResult);
```

The JSON renderer emits the stable report schema with schema version, metadata, findings, unknown candidates, file lists, parser warnings, and disclaimer. It pretty-prints deterministically for CI diffs and redacts values that look like actual secrets.
