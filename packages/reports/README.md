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
