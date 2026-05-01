# Examples

Deterministic fixture projects used by tests and manual QA.

- `node-basic` exercises generic Node files that should not create SaaS findings.
- `node-next-sentry-stripe` exercises npm packages, config files, and redacted env templates.
- `python-api-sendgrid` exercises Python manifests and env templates.
- `docker-compose-supabase` exercises Docker Compose service images.
- `github-actions-cloudflare` exercises workflow and deployment config detection.
- `unknown-services` exercises unknown candidate creation and false-positive guards.
- `secrets-redaction` exercises default sensitive-file skipping and report redaction.
- `monorepo-large` exercises deterministic traversal and deduplication across packages.

Fixtures intentionally use fake domains, fake keys, and non-customer sample data only.
