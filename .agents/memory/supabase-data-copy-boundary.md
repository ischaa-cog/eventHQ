---
name: Supabase data-copy boundary
description: Security and cutover decisions for moving application data to Supabase
---

Treat a data copy to Supabase separately from switching the running application. Keep the existing source untouched until an explicit cutover decision. Exclude active login sessions, while preserving users, assignments, and pending invitations.

**Why:** Supabase exposes public-schema tables through its REST API, and the application's Replit-based login state does not become Supabase Auth merely by copying database rows. Migrating session cookies is neither necessary nor a valid authentication cutover.

**How to apply:** Enable row-level security and remove anonymous/authenticated API table access in the same transaction as a public-schema import. Verify row counts, relationships, and access controls before switching any runtime database connection. Decide development and published app cutovers separately.