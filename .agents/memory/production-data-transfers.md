---
name: Production data transfers
description: Safety decision for copying development business records into a published EventHQ app
---

When copying development business records to production, preserve existing production users and login sessions unless the user explicitly chooses to replace them.

**Why:** Production may contain working sign-in records even when all business tables are empty. The user specifically chose to retain those records rather than overwrite the entire production database.

**How to apply:** Inspect both databases before future transfers. Check identity references and table conflicts, use a data-only transfer for the intended business tables, and ask before replacing any nonempty production data.