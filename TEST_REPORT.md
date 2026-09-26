# EventHQ quality pass — 24 September 2026

## Scope and method

Risk-based testing of the existing application, not a claim to test every possible input or environment. Automated HTTP tests mount the real API routes with simulated identities and disposable development-database records, cleaned up in `finally`. No production database or existing business records were changed. Run again with:

```sh
npx tsx --test server/*.test.ts
npm run check
npm run build
```

## Results

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| Anonymous access / public page | Pass | Unauthenticated `/api/auth/user` returns 401, invite lookup for an invalid token returns 404, public home returns 200; desktop public page renders in preview. |
| Owner, agency admin, employee, client roles | Pass (API subset) | Disposable fixtures cover authorized and forbidden access to invites, event creation/editing, client data, webhook tokens and rotation, event performance, profile edits, sales stats, and portal resources. Authenticated browser navigation remains unverified. |
| Cross-client reads and writes | Pass (tested endpoints) | Rejects cross-agency invite deletion and assignment, event/asset/webinar reassignment, notification read-state edits, foreign webinar goals, sales reads, projections and training edits. Negative requests leave fixture data unchanged. This is not a proof that every endpoint is isolated. |
| Sales/imports and calculations | Pass (tested inputs) | Existing regression checks import replay/idempotency, paid, failed, full and partial refund amounts, date-filtered portal net revenue and cross-client import references. New test checks event-performance zero denominator, revenue, profit, ROAS, negative spend, empty title, and attendees exceeding registrations. |
| Client operations | Pass (API subset) | Token reads/rotation checked by role and tenant; employee/client profile edits and forbidden edits checked. No actual webhook delivery or external processor transaction was sent. |
| Calendar/Drive | Partial | Disconnected calendar behavior and forbidden sync tested; Drive link now opens the configured folder and is disabled when absent. Real Google authorization, syncing and folder permissions not verified. |
| Client navigation/assets/dashboard | Partial | Code inspection found and fixed client Dashboard link, dead Drive button, misleading asset fetch-error empty state, and custom sales end-of-day/net-revenue mismatch. Could not drive authenticated forms in browser. |
| Build/runtime | Pass | TypeScript check, production build, three HTTP suites, dev workflow startup, and public desktop screenshot. Build warns that the main JS bundle exceeds 500 kB. A 401 in the anonymous screenshot's console is expected. |
| Security scan | Findings | Dependency scanner: 0 critical, **19 high**, 29 moderate, 8 low advisory entries. Static-code and privacy/dataflow scanners returned zero findings; manual route review found and fixed cross-tenant defects those scans missed. |

## Confirmed defects corrected

1. Agency admins could delete another agency's invite by ID, or invite an employee/client with access to a client in another agency. Both paths now reject unauthorized requests.
2. Existing events, assets and webinars could be moved to another tenant by PATCHing ownership fields. Such fields now return 400. A webinar-goals create body could override the URL client; the URL is now authoritative.
3. Any signed-in user could mark any other user's notification as read by recipient ID. Only that recipient, or an accessible client-scoped notification without a user recipient, may do so now.
4. API logs included entire response bodies, including potentially sensitive data, and raw paths containing invite tokens. Logs now use route templates, status and duration only.
5. Client navigation pointed at the agency dashboard; the Assets Drive action did nothing and its fetch error looked like an empty library; dashboard custom sales excluded most of the selected final day and totaled raw amounts rather than net revenue. These UI paths were corrected.

The corresponding API regressions are in `server/routes.boundaries.test.ts` and `server/workflows.regression.test.ts`. They use only temporary records.

## Unresolved / release review

- **High — dependency advisories:** 19 high-severity entries include Drizzle ORM SQL-identifier injection, sharp image parsing, Vite development server file reads, ws memory exhaustion, and build dependencies. Assess reachable attack surfaces and upgrade compatible versions; an ORM or image-library upgrade requires compatibility testing.
- **Medium — calendar time zones:** Marketing Calendar builds dates in the browser's local zone even when another zone is selected. A user in a different zone may schedule an incorrect time or invite. Its UI also promises Google invites when a connector can be disconnected.
- **Medium — dashboard error states:** Sales stats can show zero when the request fails, and reversed custom periods are accepted. Projections and calendar edits have limited mutation-error feedback.
- **Medium — responsive/role UI:** Event Tracker and Webinar Tracker bypass the standard mobile layout; Event Tracker excludes the `agency_employee` role from edits. These are source-review findings, not verified mobile-device reproductions.
- **Medium — onboarding:** The external survey embed does not update local onboarding completion or provide a reliable blocked-embed fallback. It needs a verified provider completion flow.

## Blocked, not passed

Authenticated browser form, keyboard and mobile journeys could not be exercised with the available preview (static screenshot only); route-level role simulation is not a substitute. Live Google Calendar/Drive, Stripe, Elective, WAP, Meta Ads, email delivery, external survey submission and real processor webhook delivery require authorized accounts, valid provider configuration or vendor test environments. Do not assume these flows work from the passing local tests.