---
name: Portal login boundary
description: Why client and admin login entry points do not switch account roles
---

The client and admin login pages indicate the intended portal, but the persisted account role remains authoritative. A mismatched login should explain the mismatch, not reinterpret an internal account as a client or silently grant different access.

**Why:** Both entry points can lead to the same identity provider, and demo password accounts can also have internal roles. Treating the entry page as the role would turn a navigation choice into an authorization decision.

**How to apply:** Route authenticated users using their stored role and assignments. Keep a client with no single valid assignment on an access-message page rather than sending them to the agency workspace list.

The product presents only Admin and Client profiles. Existing primary-owner and agency-admin accounts both display as Admin, but their internal tenant scopes remain distinct. Legacy employee accounts and invitations are disabled rather than deleted.

**Why:** Removing the internal primary-owner boundary would accidentally grant every agency admin access to other tenants; deleting employee records or invitations would discard audit and assignment history. The requested simplification concerns active login profiles, not cross-tenant privileges.

**How to apply:** New invitations and role changes offer Admin or Client only. Keep checking persisted roles and tenant assignments on the server; never infer an account's permissions from the login page or its display label.