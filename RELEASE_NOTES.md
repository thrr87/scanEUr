# Release Notes

## v0.1.0 - Local CLI MVP

Release date: 2026-05-01

v0.1.0 is the first MVP release of scanEUr. It is scoped to local repository scanning through the `scaneur` CLI and preserves the project trust boundaries: local-first operation, offline default behavior, no telemetry, no source-code upload, no affiliate links, and no paid ranking.

### Included

- `scan`, `explain`, `alternatives`, `init-policy`, and `check` CLI commands.
- Markdown and JSON report output.
- Local vendor, fingerprint, and alternatives databases.
- Scanning for package manifests, lockfiles, Docker files, Docker Compose files, env example/template files, GitHub Actions workflows, Terraform files, and common provider config files.
- Known vendor detection and unknown candidate detection.
- Separate scoring dimensions for jurisdiction signal, data sensitivity signal, operational criticality, migration effort, alternative maturity, and evidence confidence.
- Governance, methodology, privacy, security, funding, contribution, vendor inclusion, and no-affiliate policy docs.
- Static documentation site source under `apps/docs`.

### Not Included

- Domain scanning.
- Hosted service features.
- Online enrichment.
- HTML report output.
- Telemetry.
- Legal compliance verdicts.

### Release Checks

- Package version: `0.1.0`.
- Scanner version: `0.1.0`.
- Methodology version: `0.1.0`.
- Database version: `2026.04.0`.
- Full test suite: `npm test`.

### Known Limits

- Local evidence does not prove production usage.
- Vendor terms, ownership, data residency, and product behavior can change.
- Unknown candidates require manual review.
- v0.1.0 intentionally favors a small reviewed seed database over broad unverified coverage.
