---
name: verify
description: Run frontend lint, typecheck, and build to verify changes are correct before committing.
---

Run the following verification steps in the dashboard directory. Stop at the first failure and fix the issue before continuing.

1. **Lint**: `cd /Users/lasse/workspace/sleep_analysis/dashboard && npm run lint`
2. **Typecheck**: `cd /Users/lasse/workspace/sleep_analysis/dashboard && npm run typecheck`
3. **Build**: `cd /Users/lasse/workspace/sleep_analysis/dashboard && npm run build`

Report which steps passed and which failed. If any step fails, show the relevant errors and suggest fixes.
