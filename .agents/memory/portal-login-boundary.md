---
name: Portal login boundary
description: Why client and admin login entry points do not switch account roles
---

The client and admin login pages indicate the intended portal, but the persisted account role remains authoritative. A mismatched login should explain the mismatch, not reinterpret an internal account as a client or silently grant different access.

**Why:** Both entry points can lead to the same identity provider, and demo password accounts can also have internal roles. Treating the entry page as the role would turn a navigation choice into an authorization decision.

**How to apply:** Route authenticated users using their stored role and assignments. Keep a client with no single valid assignment on an access-message page rather than sending them to the agency workspace list.