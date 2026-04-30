# @scaneur/scanner

Reusable scanner engine package.

Responsibilities:

- File discovery.
- Parser orchestration.
- Evidence collection.
- Matching orchestration.
- Scoring orchestration.
- Structured scan result creation.

Current implementation includes deterministic MVP file discovery with default ignored
directories, sensitive-file skips, env-template allowlisting, and file size limits.
