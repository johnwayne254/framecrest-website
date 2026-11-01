# FrameCrest Cloudflare Pages deployment guide

The public website and private workspace are two separate Cloudflare Pages projects built from one GitHub repository.

## Repository

- GitHub: `johnwayne254/framecrest-website`
- Production branch: `main`
- Git provider: GitHub / Cloudflare Workers and Pages app
- Deployment model: Cloudflare Pages Git integration (not manual Direct Upload)

## Project A — public website

| Setting | Value |
|---|---|
| Cloudflare project | `framecrest-website` |
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | blank (repository root) |
| Build command | blank, or `exit 0` |
| Build output directory | `.` |
| Custom domain | `framecrest.media` |

Keep **Enable automatic production branch deployments** switched on.

## Project B — client dashboard

| Setting | Value |
|---|---|
| Cloudflare project | `framecrest-dashboard` |
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | blank (repository root) |
| Build command | blank, or `exit 0` |
| Build output directory | `dashboard` |
| Custom domain | `dashboard.framecrest.media` |

Keep **Enable automatic production branch deployments** switched on.

## Optional build watch paths for this monorepo

By default, every change in the repository may trigger both Pages projects. To reduce unnecessary builds:

- `framecrest-website`: include all paths; exclude `dashboard/**`.
- `framecrest-dashboard`: include `dashboard/**`.

If you prefer every commit to rebuild both projects, leave the default watch paths unchanged.

## Expected workflow

1. A change is committed or merged to GitHub `main`.
2. Cloudflare's Git integration starts the appropriate Pages build automatically.
3. GitHub shows a separate check run for each Pages project that builds.
4. After a successful production deployment, the public site is served at `https://framecrest.media` and the client workspace at `https://dashboard.framecrest.media`.

Do not use a preview URL as the permanent public address. Preview URLs are for checking deployments; production custom domains remain attached to the production deployment.

## Troubleshooting when the live site looks unchanged

1. Open the GitHub repository's latest commit and inspect its Cloudflare check runs.
2. Confirm a successful check run named `Cloudflare Pages: framecrest-website` for a public-site change.
3. In Cloudflare, open Workers & Pages → `framecrest-website` → Deployments and verify the production deployment points to the latest `main` commit.
4. Under Settings → Builds & deployments → Branch control, confirm production branch is `main` and automatic production branch deployments are enabled.
5. If the project has no Git repository under Settings → Builds, it may be a Direct Upload project. Create a Git-integrated Pages project from this repository instead; Cloudflare does not convert an existing Direct Upload project into a Git-integrated project.
6. After a successful production deploy, test in a private browser window or hard-refresh to rule out browser caching.

Repeat the same checks for `framecrest-dashboard` when the dashboard code changes.

## What has been verified

The GitHub repository has produced successful Cloudflare Pages check runs for both `framecrest-website` and `framecrest-dashboard` on the same `main` commit. This confirms that the GitHub-to-Cloudflare integration has been active for both projects. Continue checking the latest main-branch check runs after each new commit.
