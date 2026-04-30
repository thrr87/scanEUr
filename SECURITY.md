# Security Policy

## Reporting vulnerabilities

Report security vulnerabilities through the project’s designated private security contact or vulnerability reporting channel once established. Do not disclose exploitable vulnerabilities publicly before maintainers have had a reasonable opportunity to respond.

If no private channel exists yet, open a minimal public issue stating that you need a maintainer security contact, without sharing exploit details.

## What to report

Please report:

- Secret leakage in reports.
- Source-code upload or unintended network calls.
- Telemetry behavior.
- Path disclosure issues.
- Parser crashes with security impact.
- Database validation bypasses.
- CLI behavior that may expose sensitive data.
- Supply-chain risks in the scanner itself.

## Privacy expectations

Default scanEUr behavior must be:

- Local-first.
- Offline by default.
- No telemetry by default.
- No source-code upload.
- No secret upload.
- No `.env` scanning by default.

## Local scanning boundaries

The scanner should read supported local files only. It should not execute project code, run package manager scripts, install dependencies, call external APIs, or upload scan data in default flows.

## Sensitive file handling

The scanner should skip sensitive files by default, including:

- `.env`
- `.env.local`
- `.env.production`
- private keys
- certificates
- token files

Allowed env templates include:

- `.env.example`
- `.env.sample`
- `.env.template`

For env templates, scanEUr should extract keys only and avoid values.

## No telemetry policy

scanEUr must not collect usage analytics, dependency lists, file paths, errors, machine identifiers, or scan results by default.

## Security review checklist for changes

Before merging changes that touch scanning, parsing, reporting, or CLI output:

1. Confirm no default network calls.
2. Confirm no secrets are printed.
3. Confirm sensitive files are skipped.
4. Confirm parser errors do not expose raw content.
5. Confirm reports include redacted evidence only.
6. Confirm tests cover privacy behavior.

## Dependencies

Project dependencies should be kept minimal and reviewed for supply-chain risk. The scanner should not depend on hosted services for default operation.
