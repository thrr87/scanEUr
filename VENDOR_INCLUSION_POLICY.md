# Vendor Inclusion Policy

## Purpose

This policy defines how vendors are included, corrected, disputed, and reviewed in scanEUr.

## Inclusion does not imply judgment

A vendor appearing in scanEUr does not mean the vendor is bad, good, compliant, non-compliant, recommended, discouraged, legal, or illegal. It means the vendor may be relevant to software dependency review.

## Eligible vendor categories

scanEUr may include vendors and tools in categories such as:

- Cloud infrastructure.
- Hosting and deployment.
- Authentication.
- Payments.
- Analytics.
- Tag management.
- Observability.
- Error tracking.
- AI APIs.
- Email and SMS.
- CRM and support.
- Search.
- Vector databases.
- Collaboration.
- CI/CD.
- Open-source/self-hosted tools.

## Evidence requirements

Vendor profiles should use evidence for:

- Official domains.
- Package names.
- Product names and aliases.
- Corporate identity and ownership/control claims.
- Data residency options.
- Product documentation.
- Legal or subprocessor documentation when relevant.

Official sources are preferred. Non-official sources must be labelled.

## Verification status

Use one of:

- `verified`
- `partially_verified`
- `fingerprint_only`
- `agent_draft`
- `unknown`

AI-generated profiles must remain `agent_draft` until human review.

## Correction requests

Anyone may request a correction by providing:

- Vendor/profile ID.
- Current field or wording.
- Proposed correction.
- Supporting evidence.
- Explanation.

Maintainers should review evidence and update the profile when appropriate.

## Vendor requests

Vendors may submit corrections and evidence. Vendors may not pay for:

- Better scoring.
- Preferential ranking.
- Removal of accurate evidence.
- Sponsored recommendations.
- Paid placement.

## Disputes

When evidence is disputed:

1. Prefer official current sources where appropriate.
2. Lower confidence if evidence is unclear.
3. Add limitations if context matters.
4. Avoid legal conclusions.
5. Document review notes.

## Alternatives ranking

Alternatives are ranked by methodology, not money.

Permitted factors:

- Feature fit.
- Maturity.
- Migration effort.
- Documentation quality.
- Operational burden.
- Self-hosting complexity.
- Realistic SMB adoption.
- Data residency options.
- Ownership/control signals.
- Export/import support.
- API compatibility.
- Known gaps.

Forbidden factors:

- Affiliate commission.
- Paid placement.
- Sponsored ranking.
- Vendor payment.
- Undisclosed conflict of interest.

## Conflict-of-interest disclosure

Contributors and maintainers should disclose material relationships with vendors when contributing or reviewing related data.

## Review standard

A profile should not be marked `verified` unless important claims are evidence-backed and human-reviewed.
