---
title: Regular Dependency Security Audits
impact: CRITICAL
section: 1
impactDescription: Prevents exploitation of known vulnerabilities in packages
tags: security, dependencies, pnpm-audit, dependabot
---

## Regular Dependency Security Audits

Outdated dependencies contain known vulnerabilities that attackers exploit. Automated scanning with `pnpm audit` plus GitHub Dependabot catches issues before production. **Never deploy without a clean dependency audit.**

**Incorrect (vulnerable deps):**

```json
// package.json - outdated packages 🚨
{
  "dependencies": {
    "lodash": "^4.17.20",      // CVE-2021-23337
    "jsonwebtoken": "^8.5.1"   // CVE-2022-23529 and related advisories
  }
}
```

**Correct (automated security):**

```json
// package.json
{
  "scripts": {
    "audit:check": "pnpm audit --prod --audit-level high",
    "audit:fix": "pnpm audit --fix",
    "audit:report": "pnpm audit --json"
  }
}
```

```bash
# Local / CI checks
pnpm audit --prod --audit-level high   # fail CI on high/critical in runtime deps
pnpm audit                             # full report incl. dev dependencies
pnpm audit --fix                       # apply fixes via pnpm.overrides
pnpm audit --json                      # machine-readable report for tooling
```

**CI / automation:**

- `pnpm audit --audit-level high` runs in CI on every PR and weekly on a schedule — a non-zero exit code blocks the pipeline.
- Dependabot (GitHub-native, dev-time only — runtime stays zero-cloud per I11) opens update PRs for new advisories:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"      # covers pnpm workspaces
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

**Workflow:**

- `pnpm audit` weekly in CI/CD (`--json` output feeds reports; `patched_versions: null` means no fix exists yet).
- `pnpm audit --fix` writes patched versions into `pnpm.overrides` in `package.json` — review the diff and commit.
- When no fix exists: pin an override to a safe version, or isolate the vulnerable package behind an adapter and track the advisory.
- Pin major versions, auto-patch minors via Dependabot PRs.
