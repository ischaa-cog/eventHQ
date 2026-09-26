---
name: Invitation sender verification
description: Why connected email delivery still needs explicit sender-domain verification
---

Do not treat an authorized Resend connection as permission to send mail from an unverified domain. Keep a real sender address configurable only after the domain owner confirms control and DNS verification succeeds; do not substitute Resend's test sender for external client invitations.

**Why:** The existing connection can authenticate API requests while its sending domain remains unverified. A provider API connection alone cannot prove that external invitations will arrive.

**How to apply:** Before claiming invitations work end to end, confirm the sending domain is verified, use a sender on that domain, and verify delivery to an external inbox and acceptance by its intended recipient.