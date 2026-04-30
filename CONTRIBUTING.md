# Contributing to scanEUr

Thank you for contributing to scanEUr. The project depends on careful code, transparent methodology, and trustworthy vendor data.

## Contribution areas

You can contribute:

- Scanner code.
- CLI behavior.
- Parsers.
- Report renderers.
- Tests and fixtures.
- Vendor profiles.
- Detection fingerprints.
- Alternatives data.
- Documentation.
- Corrections and disputes.

## Project principles

All contributions must respect:

- Local-first default behavior.
- Offline-by-default scanning.
- No telemetry by default.
- No source-code upload.
- No affiliate links.
- No paid placement.
- No sponsored recommendations.
- No legal overclaiming.
- Evidence-based vendor data.
- Confidence labels and uncertainty.

## Contributing code

Before changing code:

1. Read the relevant docs in `docs/`.
2. Keep module boundaries clear.
3. Add or update tests.
4. Avoid adding network calls to default scan paths.
5. Avoid printing secrets.
6. Keep CLI exit behavior consistent with `docs/05_cli_specification.md`.

Expected tests:

- Unit tests for new logic.
- Fixture tests for scanner behavior.
- Snapshot tests for report changes where relevant.
- Privacy/redaction tests for anything touching file content.

## Contributing vendor profiles

Vendor profiles should be added under `vendors/`.

A contribution should include:

- Stable vendor ID.
- Name and category.
- Aliases.
- Detection identifiers.
- Jurisdiction/control notes when supported by evidence.
- Data-category notes.
- Operational criticality and migration-effort defaults.
- Evidence sources.
- Verification status.
- Last reviewed date if verified or partially verified.
- Limitations.

### Evidence requirements

Use official sources where possible:

- Vendor documentation.
- Product documentation.
- Package registries.
- Legal/subprocessor pages.
- Corporate pages.
- API documentation.

Do not mark a profile `verified` unless the important claims are human-reviewed and evidence-backed.

AI-assisted profiles must be labelled `agent_draft`.

## Contributing fingerprints

Fingerprints should be added under `fingerprints/`.

A fingerprint may include:

- Package name.
- Env var pattern.
- Domain.
- Docker image.
- GitHub Action.
- Config file.
- Terraform provider.
- Text pattern.

Fingerprint rules should be specific and tested. Avoid broad substring matches that create false positives.

## Contributing alternatives

Alternatives should be added under `alternatives/`.

Each alternative should include:

- Source vendor or category.
- Alternative name or vendor ID.
- Replacement type.
- Fit level.
- Maturity.
- Migration effort.
- Self-hosting option.
- EU/control notes when evidence-backed.
- Known gaps.
- Best-fit cases.
- Poor-fit cases.
- Migration notes.

Alternatives must not be ranked by sponsorship, payment, affiliate revenue, or vendor pressure.

## Review expectations

Maintainers should review for:

- Schema validity.
- Evidence quality.
- Currentness.
- Conservative wording.
- No legal conclusions.
- No commercial influence.
- False positive risk.
- False negative risk.
- Test coverage.

## Wording guidelines

Prefer:

- “detected”
- “may indicate”
- “likely”
- “unknown”
- “manual review recommended”
- “depending on use case”
- “migration effort may be high”

Avoid:

- “compliant”
- “non-compliant”
- “illegal”
- “safe”
- “guaranteed”
- “must replace”
- “best vendor” without methodology

## Conflicts of interest

Disclose material conflicts when contributing or reviewing vendor data, alternatives, or scoring logic. This includes employment, consulting, sponsorship, investment, partnership, or other financial relationships with vendors.

## Security and privacy reports

Use `SECURITY.md` for vulnerability reports, secret leakage concerns, or privacy boundary issues.
