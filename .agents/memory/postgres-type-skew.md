---
name: Postgres type skew
description: Why a healthy Drizzle/Postgres runtime can still fail TypeScript checks after mixed package-manager installs
---

If TypeScript says a `pg.Pool` is not assignable to Drizzle's expected `Pool` while database operations run normally, compare the *resolved* `@types/pg` packages at the app root and under Drizzle before changing database code. A root declaration can be older than the nested declaration and omit properties Drizzle expects.

**Why:** This workspace once had mismatched Postgres declaration versions due to mixed installation layouts; changing the runtime pool was unnecessary.

**How to apply:** Align the type dependency through the project's package manager, then run the type check. Avoid an unsafe cast or a second database pool merely to silence the error.