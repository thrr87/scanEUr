# scanEUr

**scanEUr** is a free, MIT-licensed, local-first scanner for jurisdictional software dependencies.

Current release: **v0.1.0 Local CLI MVP**.

It scans a local software project and detects third-party services, infrastructure vendors, SDKs, SaaS tools, cloud dependencies, analytics providers, payment providers, authentication providers, observability tools, AI APIs, email/SMS services, and other external operational dependencies.

scanEUr helps European teams understand what their software stack depends on, what may require review, and which alternatives may be realistic. It does not provide legal advice and does not declare GDPR compliance or non-compliance.

## Why scanEUr exists

Modern products are built from many external services. These dependencies are often introduced through packages, starter templates, environment variables, deployment configs, GitHub Actions, Docker images, or AI-generated code.

European teams are often asked:

- Which vendors does your product use?
- Which services may process personal data?
- Which dependencies may involve non-EU jurisdictional or control exposure?
- Which vendors are operationally critical?
- Which findings are quick wins?
- Which dependencies require strategic review?
- Which alternatives are realistic?
- Which unknown services need manual investigation?

scanEUr provides a local, evidence-based first pass.

## What it does

scanEUr detects local evidence of external dependencies and reports:

- Detected vendors.
- Unknown vendor candidates.
- High-priority review items.
- Quick wins.
- Strategic dependencies.
- Data sensitivity signals.
- Jurisdiction signals.
- Operational criticality.
- Migration effort.
- Alternative maturity.
- Evidence confidence.
- Files scanned and skipped.
- Methodology and database version.

## What it does not do

scanEUr does not:

- Provide legal advice.
- Certify GDPR compliance.
- Declare a vendor legal or illegal.
- Claim all US vendors are bad.
- Claim all EU vendors are safe.
- Recommend replacing critical infrastructure blindly.
- Upload source code in the default scan path.
- Use telemetry by default.
- Use affiliate links or paid recommendations.

## Install

After the package is published, install the CLI from npm:

```bash
npm install -g @scaneur/cli
```

From a source checkout, run the same CLI entrypoint directly:

```bash
npm install
node packages/cli/src/index.js --version
```

## CLI quickstart

Run a local scan:

```bash
scaneur scan .
```

From a source checkout:

```bash
node packages/cli/src/index.js scan examples/node-next-sentry-stripe --output scaneur-report.md
```

Write a Markdown report:

```bash
scaneur scan . --output report.md
```

Write a JSON report:

```bash
scaneur scan . --format json --output report.json
```

Explain a vendor profile:

```bash
scaneur explain stripe
```

Show alternatives:

```bash
scaneur alternatives ga4
```

Initialize a starter CI policy:

```bash
scaneur init-policy
```

Run a CI-style check:

```bash
scaneur check . --fail-on new-high
```

## Example output

```text
scanEUr completed local scan.
Files scanned: 14
Files skipped: 231
Detected vendors: 8
Unknown candidates: 3
High-priority review items: 2
Quick wins: 1
Strategic dependencies: 2
Report written: report.md
```

Example finding language:

```text
Stripe was detected through package and environment-variable evidence.
This dependency may involve payment data and personal data depending on implementation.
Operational criticality is likely high.
Migration effort is likely high.
Manual contractual and operational review is recommended.
```

## Trust principles

scanEUr optimizes for trust over monetisation.

- Free and MIT-licensed.
- Local-first by default.
- Offline by default.
- No telemetry by default.
- No affiliate links.
- No paid placement.
- No paid ranking.
- No sponsored recommendations.
- No monetized recommendations.
- Transparent methodology.
- Evidence-based vendor profiles.
- Confidence labels for all findings.
- Recommendations ranked by methodology, not commercial incentives.
- Clear distinction between observed facts, inferred signals, and unknowns.
- No legal advice claims.
- Manual review encouraged for high-impact decisions.
- Optional online enrichment only when explicitly requested by the user.
- Online enrichment must never send source code.
- Online enrichment may only send minimized vendor/package/domain identifiers.

## MVP scope

MVP v0.1 is a TypeScript Node.js CLI that scans local repository files only. It supports Markdown and JSON reports. It does not include domain scanning or default online enrichment.

Supported MVP file types include package manifests, lockfiles, Docker files, Docker Compose files, env example/template files, GitHub Actions workflows, and common hosting/framework/provider config files.

## Documentation

See:

- `RELEASE_NOTES.md`
- `docs/00_project_brief.md`
- `docs/01_product_prd.md`
- `docs/05_cli_specification.md`
- `docs/11_scoring_methodology.md`
- `docs/15_privacy_security_and_trust_model.md`
- `docs/16_governance_and_vendor_inclusion_policy.md`
- `METHODOLOGY.md`
- `VENDOR_INCLUSION_POLICY.md`
- `NO_AFFILIATE_POLICY.md`
- `SECURITY.md`
- `FUNDING.md`

## Contributing

Contributions are welcome for code, vendor profiles, fingerprints, alternatives, fixtures, tests, and documentation.

Before contributing vendor or alternatives data, read:

- `CONTRIBUTING.md`
- `VENDOR_INCLUSION_POLICY.md`
- `NO_AFFILIATE_POLICY.md`

Verified vendor profiles require evidence and human review. AI-generated profiles must remain labelled `agent_draft` until reviewed.

## Disclaimer

scanEUr is a technical dependency discovery and review-support tool. It does not provide legal advice, does not determine GDPR compliance or non-compliance, and does not declare any vendor legal or illegal. Findings are based on local file evidence, database profiles, and documented methodology. Manual review is recommended for high-impact decisions.
