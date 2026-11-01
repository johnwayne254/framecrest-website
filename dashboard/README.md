# FrameCrest Studios Dashboard

Private, responsive client and project workspace for `dashboard.framecrest.media`.

## What's included
- Email/password sign-in (invitation-only; no public registration form).
- Role-aware workspace: administrator, editor and client.
- Client directory and project intake for administrators.
- Editors see and update only projects assigned to them.
- Clients see only projects linked to their client account.
- Project statuses, due dates, QA status and delivery-folder links.
- Financial records are stored in a separate administrator-only table.

## Stack
Static HTML/CSS/JavaScript + Supabase Auth/Postgres with Row Level Security. No paid frontend framework or build step.

## Setup
1. Create a Supabase project.
2. In Supabase **SQL Editor**, run all of `schema.sql`.
3. In Supabase **Project Settings → API**, copy the Project URL and anon/public key.
4. Put those two values in `config.js`. Never use the `service_role` key in browser code.
5. In Supabase **Authentication → Providers**, enable Email. Keep public sign-ups disabled; create/invite users as administrator.
6. Create your own first account under Authentication → Users, then run the administrator promotion SQL at the bottom of `schema.sql`, replacing the example email.
7. Create client records in the dashboard. Invite the client user in Supabase Auth, then link their profile to the correct client record using the SQL comment at the bottom of `schema.sql`.
8. Invite editors in Supabase Auth, then promote each profile to `editor` using the SQL comment at the bottom of `schema.sql`. Assign editors to projects in the Projects table in Supabase for this first release.

## Cloudflare Pages deployment
Create a **new** Cloudflare Pages project connected to the existing GitHub repository `johnwayne254/framecrest-website`. Set:
- Production branch: `main`
- Framework preset: `None`
- Build command: leave blank (or `exit 0`)
- Build output directory: `dashboard`
- Root directory: leave blank

After the first deployment, add the custom domain `dashboard.framecrest.media` in that new Pages project and follow Cloudflare's DNS instructions. This does not change the existing public website deployment.

## Important notes before inviting clients
- Supabase Row Level Security is the actual permission boundary; hiding menu items is only a user-interface convenience.
- Keep client project folder links access-controlled. A public share link can be forwarded.
- The first release intentionally does not expose financial information to editors or clients.
- Test with separate administrator, editor and client accounts before sharing the dashboard.
- Use strong unique passwords and enable Supabase's available account security options.
- Add a privacy notice and retention process before storing client personal information at scale.

## Current MVP scope
The first release supports client records, project creation, assignment, status updates, due dates, QA status and client-scoped project visibility. Payment figures are stored securely in the database; finance editing and advanced analytics are planned for the next release.

## Website and automatic deployment

The public website links to this workspace at **https://dashboard.framecrest.media/**. The dashboard login page also links back to **https://framecrest.media/**. The dashboard is invitation-only; clients sign in with the account created for them, then use **New project request** and **Messages** to submit work requests and communicate with the FrameCrest team.

This dashboard is the separate `framecrest-dashboard` Cloudflare Pages project, built from the `dashboard/` directory of the same `johnwayne254/framecrest-website` GitHub repository. Set its production branch to `main`, enable automatic production deployments, and use `dashboard` as the build output directory. The public website project uses the repository root as its output directory. A commit to `main` should automatically deploy both connected projects; use Build watch paths to scope dashboard builds to `dashboard/**`.

The current client portal supports project request forms and project messaging. It does not include a general file-upload control in this MVP. Clients can use the delivery-folder links provided for each project where those have been configured.
