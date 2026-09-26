---
name: Demo client access
description: Boundaries chosen for the separately provisioned demo client login
---

The user chose dedicated demo email/password sign-ins rather than Replit account invites. They later explicitly chose to make these shared logins work on the public published app. Both client and agency-admin demo identities must stay separate from normal Replit Auth, read-only, and in the same isolated sample agency. Demo admin is not an owner.

**Why:** Publicly shareable demo passwords should not expose real client data or enable paid generation. The user explicitly approved published demo access; it must still let viewers compare roles without granting owner access.

**How to apply:** Future demo enhancements may add disposable, resettable interactivity, but do not remove tenant isolation or enable production access implicitly. Never put the demo password or its hash into project memory.

When publishing while demo login changes are in progress, verify both the working tree and the actual sign-in hashes afterward rather than assuming development and production remain in sync. **Why:** A publish during implementation reverted some uncommitted authentication changes, and previously shared demo passwords stopped matching stored hashes. **How to apply:** Check real logins and tenant isolation in each target environment before sharing a working URL.

For shareable demo sign-in IDs, use addresses at a reserved example domain or a domain the user confirms they own, not the `.invalid` TLD. **Why:** The user explicitly found `.invalid` unsuitable for sharing with a teammate. **How to apply:** Explain that reserved example-domain IDs are login identifiers, not receiving inboxes; do not assume the team owns another domain.

The public demo should show realistic historical sample records throughout the client workspace, but external services should remain visibly disconnected unless a real demo-only connection is authorized. **Why:** Simulated Google, Meta, or payment credentials would misrepresent live integration status and could blur the sample/real-data boundary. **How to apply:** Seed local sample records for visual exploration; keep provider-linked actions and writes disabled for shared demo sessions.

Use standard account language on the login page, not "sample" or "demo" labels. **Why:** The user explicitly wants a normal, polished EventHQ sign-in experience rather than qualification in the entry-page copy. **How to apply:** Keep the underlying read-only tenant isolation and never represent synthetic records as real customer data; communicate actual account limitations when relevant outside the login-page copy.