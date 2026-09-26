# EventBuildOS - Client Workspace Platform

## Overview

EventBuildOS is a client-workspace web application for event marketing. It reduces event build-out time by generating marketing assets (emails, SMS, social posts, scripts, and slide outlines) using AI. Users select a client workspace and manage its events, assets, and performance.

Key capabilities:
- Client workspace selection and setup
- Agency records retained internally to support tenant isolation and invitations; there is no agency workspace in the product UI
- Client brand workspace with voice rules, style guides, and asset vaults
- Event builder with intake forms for webinars, summits, and challenges
- AI-powered asset generation with background job processing
- Client-level revenue projections

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, built using Vite
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers

**Design Pattern**: The app opens to a client workspace picker/setup screen. Selecting a client opens its workspace navigation: Client Dashboard, Event Builder, Assets Library, Client Projections, Brand Workspace, and related client tools.

Routes are structured as `/` for client selection/setup and `/client/:id/*` for client-specific pages. Projections are available only within each client's workspace.

### Backend Architecture

**Framework**: Express.js with TypeScript
- **Server**: HTTP server with development hot-reload via Vite middleware
- **API Design**: RESTful JSON API with `/api/*` endpoints
- **Request Handling**: Express JSON body parser with raw body preservation for webhooks
- **Static Serving**: Production builds served from `dist/public`

**Build System**: 
- Development: tsx for TypeScript execution with Vite dev server
- Production: esbuild bundles server code, Vite builds client

### Data Storage

**Database**: PostgreSQL with Drizzle ORM
- Schema defined in `shared/schema.ts` using Drizzle's pgTable definitions
- Migrations managed via `drizzle-kit push`
- Connection via `DATABASE_URL` environment variable

**Core Tables**:
- `users`: Authentication (id, username, password)
- `agencies`: Multi-tenant organizations
- `clients`: Client profiles with brand voice, style guides, banned words
- `events`: Event projects with type, dates, offer details
- `assets`: Generated content with type, status, version tracking
- `generationJobs`: Background job tracking for AI generation

**Schema Validation**: Drizzle-zod generates Zod schemas from table definitions for type-safe validation on both client and server.

### Authentication & Authorization

The app keeps agency records as an internal tenant boundary for client data and invitations. The schema supports:
- User accounts with hashed passwords
- Agency-based multi-tenancy (users see only their agency's data)
- RBAC roles planned: Admin, PM, Copy, Design, Funnel, Finance, Viewer

### Key Design Decisions

1. **Shared Schema Pattern**: Database schema and TypeScript types are defined once in `shared/schema.ts` and used by both frontend and backend, ensuring type safety across the stack.

2. **Storage Abstraction**: The `IStorage` interface in `server/storage.ts` abstracts database operations, making it easier to swap implementations or add caching.

3. **Client-First UI**: The sidebar exposes client selection and client-specific tools; agency administration is not exposed in the product UI.

4. **Asset Generation Pipeline**: Assets are stored with status tracking (draft, in_review, approved, generated) and version numbers to support iterative refinement workflows.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL`
- **Drizzle ORM**: Type-safe query builder and schema management
- **connect-pg-simple**: Session storage in PostgreSQL

### AI/Generation
- **OpenAI API**: Planned for asset generation (structured outputs)
- Background job processing for "Generate All Assets" functionality

### Client portal integrations
- **Google Calendar**: Local calendar entries work without a provider. The Google Calendar connector is not currently connected. The owner can bind a calendar ID to a client after authorization; the portal verifies access before showing "connected", and manual sync imports remote events without duplicating local entries. Agency admins cannot choose a calendar ID while the connector uses one shared app-level identity.
- **Sales**: Validated HighLevel webhooks and admin JSON imports write real transactions; webhook replays with an external ID and repeated imports are deduplicated. Source health shows verified only after an authenticated webhook has arrived. Stripe, Elective, and WAP are not connected; their names on imported transactions do not imply a live feed. Revenue summaries currently support USD.
- **Google Drive folder link**: The owner or agency admin can enter an existing Google Drive folder URL for each client. Optional OAuth-based automatic uploads require separate Google OAuth credentials and user authorization.

### Planned Integrations
- **Slack**: Webhook notifications for generation completion
- **Google Drive API**: OAuth-based folder creation and asset upload per client/event need credentials and authorization. The folder-link feature above works without OAuth.

### UI Libraries
- **Radix UI**: Accessible component primitives
- **Recharts**: Data visualization for projection reports
- **Lucide React**: Icon library
- **embla-carousel-react**: Carousel component
- **cmdk**: Command palette component

### Development Tools
- **Vite**: Build tool with HMR
- **esbuild**: Production server bundling
- **Tailwind CSS**: Utility-first styling
- **TypeScript**: Type safety throughout

## Running the app

- Put `DATABASE_URL` (Supabase Postgres) and `SESSION_SECRET` in a `.env` file, then run `npm run dev`. The Express API and Vite frontend share port `5000`.
- In production set `NODE_ENV=production` and serve over HTTPS (the session cookie is secure-only there).
- Tests: `npm test`. They write to the database in `DATABASE_URL`, so point it at a non-production database first.
- Optional features need additional configuration:
  - `OPENAI_API_KEY` enables AI asset generation.
  - Notification emails and Google Calendar sync still use Replit connectors and need their own API keys to work elsewhere.
  - Google Drive and Meta Ads require their respective OAuth settings.
- The app starts without optional integrations; affected features return a configuration error when used.

## Logins

- Everyone signs in with email + password: admins at `/admin-login`, clients at `/client-login`. Passwords are stored only as scrypt hashes in the `user_credentials` table.
- **Client logins**: create one in the Add Client form, or later in the workspace's **Client Access** tab (add, reset password, remove). A client login opens exactly one workspace; deactivating the workspace blocks it.
- **Admin users**: the owner adds them in **Admin Settings → Users** (Add User: Admin or Client; reset password; remove). Former employee accounts are kept but disabled.
- **Forgotten owner password**: `npx tsx --env-file=.env script/set-password.ts <email> <new password>`.
- One-time setup on a new database: `npx tsx --env-file=.env script/migrate-credentials.ts` (creates `user_credentials`; safe to re-run).