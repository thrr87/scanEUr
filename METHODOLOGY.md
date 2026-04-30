# scanEUr Methodology

scanEUr is a technical dependency discovery and review-support tool. It does not provide legal advice and does not determine GDPR compliance or non-compliance.

## No single global score

scanEUr does not provide a single global “EU score.” A single number would hide important context and create false precision.

Instead, scanEUr reports separate dimensions:

1. Jurisdiction signal.
2. Data sensitivity signal.
3. Operational criticality.
4. Migration effort.
5. Alternative maturity.
6. Evidence confidence.

## Jurisdiction signal

Indicates whether a dependency may require jurisdictional, ownership/control, transfer, or contractual review.

Labels:

- Low.
- Medium.
- High.
- Critical.
- Unknown.

This is not a legal conclusion.

## Data sensitivity signal

Estimates whether the dependency commonly handles personal, sensitive, confidential, or operationally sensitive data.

Actual processing depends on implementation and configuration.

## Operational criticality

Estimates how disruptive failure or migration would be.

Hosting, authentication, payments, databases, and core APIs often have high operational criticality.

## Migration effort

Estimates practical effort and risk of replacing, removing, or reconfiguring a dependency.

Payments, authentication, databases, and hosting are often strategic migrations rather than quick wins.

## Alternative maturity

Estimates whether realistic alternatives exist for the likely use case.

Alternatives are evaluated by feature fit, maturity, migration effort, operational burden, self-hosting complexity, data residency, ownership/control, export/import support, API compatibility, and known gaps.

## Evidence confidence

Indicates how strongly local evidence maps to a finding.

High-confidence evidence may include official package names, exact config files, provider domains, and official GitHub Actions.

Unknown or weak evidence should lead to manual review rather than strong recommendations.

## Recommendation categories

scanEUr uses these categories:

- `replace_now`
- `configure_better`
- `review_contractually`
- `monitor`
- `keep_for_now`
- `strategic_migration_only`
- `manual_review_required`

## Recommendation logic

General logic:

- High data sensitivity + high jurisdiction signal + low migration effort + mature alternatives may be a quick win.
- High operational criticality + high migration effort should be treated as strategic review, not immediate replacement.
- Unknown evidence confidence means manual review, not a strong recommendation.
- Critical infrastructure should not be replaced blindly.

## Commercial independence

scanEUr does not rank vendors based on sponsorship, payment, affiliate links, paid placement, or monetized recommendations.

## Limitations

- A local reference does not prove production usage.
- A package may be unused, dev-only, or transitive.
- Config files can be stale.
- Vendor terms, ownership, regions, and product behavior can change.
- Self-hosting increases operational responsibility.
- Legal assessment requires context outside scanEUr.
