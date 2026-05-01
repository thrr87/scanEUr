# scanEUr Report

## Executive summary

- Detected vendors: 1
- Unknown candidates: 1
- High-priority review items: 1
- Quick wins: 1
- Strategic dependencies: 1

This report is based on local file evidence only. It does not prove production usage.

## Important disclaimer

scanEUr is a technical dependency discovery and review-support tool. It does not provide legal advice, does not determine GDPR compliance or non-compliance, and does not declare any vendor legal or illegal. Findings are based on local file evidence, database profiles, and documented methodology. Manual review is recommended for high-impact decisions.

## Scan metadata

| Field | Value |
| --- | --- |
| Repository path | `.` |
| Scan mode | local offline |
| Scanner version | `0.1.0` |
| Database version | `2026.04.0` |
| Methodology version | `0.1.0` |
| Scan started at | `2026-04-30T10:00:00Z` |
| Scan completed at | `2026-04-30T10:00:01Z` |
| Files scanned | 1 |
| Files skipped | 1 |

## High-priority review items

### Google Analytics 4

- Category: analytics
- Recommendation: `configure_better`, `review_contractually`, `strategic_migration_only`
- Evidence confidence: Medium
- Manual review recommended: Yes

## Quick wins

### Google Analytics 4

- Category: analytics
- Recommendation: `configure_better`, `review_contractually`, `strategic_migration_only`
- Evidence confidence: Medium
- Manual review recommended: Yes

## Strategic dependencies

### Google Analytics 4

- Category: analytics
- Recommendation: `configure_better`, `review_contractually`, `strategic_migration_only`
- Evidence confidence: Medium
- Manual review recommended: Yes

## Detected vendors

### Google Analytics 4

- Category: analytics
- Verification status: `agent_draft`
- Recommendation: `configure_better`, `review_contractually`, `strategic_migration_only`
- Manual review recommended: Yes

Scores:

| Dimension | Score |
| --- | --- |
| Jurisdiction signal | High |
| Data sensitivity signal | High |
| Operational criticality | High |
| Migration effort | High |
| Alternative maturity | High |
| Evidence confidence | Medium |

Evidence:

| Type | File | Value | Confidence | Line | Rule |
| --- | --- | --- | --- | --- | --- |
| package name | `package.json` | `react-ga4` | High | n/a | `pkg_ga4_react` |
| env var | `.env.example` | `STRIPE_SECRET_KEY=[redacted]` | Medium | 2 | `env_stripe_secret` |

Observed facts:

- The package `react-ga4` was found in `package.json`.
- A parser warning included [redacted].

Inferences:

- The project may integrate with Google Analytics.

Unknowns:

- Production usage was not verified by the scanner.

Alternatives:

| Name | Replacement | Fit | Maturity | Migration effort | Known gaps |
| --- | --- | --- | --- | --- | --- |
| Matomo | `partial` | High | High | Medium | May not match all GA4 advertising ecosystem integrations. |

Notes and limitations:

- A package may indicate planned integration rather than production use.

## Unknown vendor candidates

### api.example-service.test

- Candidate type: `external_domain`
- Evidence confidence: Medium
- Source files: `vercel.json`
- Reason flagged: External-looking API domain did not match a known vendor profile or fingerprint.
- Manual review recommended: Yes

Unsupported claims:

- vendor identity
- jurisdiction
- ownership/control
- data processing role

Suggested review steps:

- Identify the service owner.
- Confirm whether the endpoint is used in production.
- Check whether personal data is sent.

## Alternatives overview

| Current vendor | Alternative | Replacement | Fit | Maturity | Migration effort |
| --- | --- | --- | --- | --- | --- |
| Google Analytics 4 | Matomo | `partial` | High | High | Medium |

## Files scanned

| File | Type | Parser | Status |
| --- | --- | --- | --- |
| `package.json` | package manifest | package json | scanned |

## Files skipped

| File | Reason | User configured |
| --- | --- | --- |
| `.env` | sensitive file default skip | No |

## Parser warnings

| File | Parser | Warning |
| --- | --- | --- |
| `package.json` | package json | Invalid optional field was ignored. |

## Methodology and scoring

- Methodology version: `0.1.0`
- Database version: `2026.04.0`
- Scores are separate review-support signals, not a single global EU score.
- Facts, inferences, unknowns, and manual review needs are kept separate.
- Evidence confidence uses Low / Medium / High / Unknown labels.

## Limitations

- The scanner reviews local files only and does not verify production usage.
- Dependency evidence can indicate planned, historical, test, or transitive usage.
- Vendor profiles, database entries, and fingerprints may be incomplete or out of date.
- The report is not legal advice and should not be treated as a compliance determination.
- Google Analytics 4: A package may indicate planned integration rather than production use.
