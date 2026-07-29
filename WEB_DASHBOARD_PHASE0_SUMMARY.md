# FarmSignal Web Dashboard — Phase 0 Wrap-Up

**Status: Phase 0 complete and verified live.** This is a session handoff note — read this plus `WEB_DASHBOARD_PLAN.md` (`C:\FarmSignaldemo\WEB_DASHBOARD_PLAN.md`, full phase breakdown) before starting Phase 1 in a new session.

---

## What exists right now

- **Local project:** `C:\FarmSignaldemo\farmsignal_web` — Vite + React + TypeScript scaffold.
- **GitHub:** [github.com/farmsignal2026/farmsignal-web](https://github.com/farmsignal2026/farmsignal-web), branch `main`, one commit so far (`c8757b2`, "Phase 0: Vite + React + TypeScript scaffold").
- **Vercel:** project `farmsignal-web` under the Vercel account tied to `farmsignal2026`/org `Smart-Farming26`. Auto-deploys from `main` on push.
- **Live URLs, both confirmed working in-browser:**
  - `https://farmsignal-web.vercel.app` (Vercel's default domain)
  - `https://farmsignal.soil2smile.com` (custom domain — CNAME `farmsignal` → `57532c1b28c02357.vercel-dns-016.com` added in GoDaddy, SSL auto-issued by Vercel)
- Both show the Phase 0 placeholder screen: "FarmSignal Dashboard / Phase 0 scaffold" with a green "Supabase client connected" indicator, confirming the whole pipeline (build → deploy → env vars → Supabase reachability) works end to end.

## What Phase 0 actually set up

- Tailwind CSS v4 (via `@tailwindcss/vite`, not the old `postcss`/config-file setup) with the dashboard's real color palette ported into `src/index.css`'s `@theme` block — Tailwind's built-in `green`/`amber`/`red`/`blue`/`purple`/`teal`/`neutral` scales now resolve to `RS_Cane_Monitoring_S1.html`'s exact shades, not Tailwind's stock ones.
- `@supabase/supabase-js` client (`src/lib/supabaseClient.ts`), reading `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from environment variables — same Supabase project as the mobile app and the legacy HTML dashboard. Local values live in `.env` (gitignored); `.env.example` is the committed template. **The same two vars are also set in Vercel's project settings** (Production + Preview) — that's a separate place from the local `.env` and needs updating there too if the values ever change.
- TanStack Query's `QueryClientProvider` wired in `main.tsx` (no real queries yet — that starts Phase 1).
- `react-router-dom` installed (not wired into routes yet — Phase 1).
- DM Sans / DM Mono fonts loaded via the same Google Fonts `<link>` the HTML dashboard uses.
- Favicon reuses the FarmSignal logo icon already generated for the mobile app.

## Decisions made / things worth knowing before continuing

- **Stack confirmed:** Vite (not Next.js) — this dashboard is a pure client-side SPA against Supabase, nothing found in the HTML needs a server function (see "AI Insights" note in `WEB_DASHBOARD_PLAN.md` — it's a local rules-based calculation, not an external API call).
- **`react-router-dom` is pinned to latest (7.18.2)**, not downgraded, despite `npm audit` flagging one advisory (GHSA-qwww-vcr4-c8h2, RSC-mode CSRF bypass). Deliberately assessed as not applicable — this project never uses React Router's RSC/server-action mode, only plain client-side routing. Don't blindly run `npm audit fix --force` on this later without re-checking that reasoning; older versions had a much longer list of real advisories.
- **CSS gotcha hit during setup:** a comment inside `src/index.css` containing a literal `*/`-like substring (written as shorthand, e.g. `--g*/--a*`) silently terminated the CSS comment early and broke the Tailwind build with a confusing "Invalid custom property" error. Root cause was the comment text itself, not a Tailwind bug. If a future edit to that file reintroduces a cryptic build failure, check for accidental `*/` sequences inside comments first.
- **Git identity is already configured** on this machine (`user.name = farmsignal2026`, `user.email` set) — no need to redo that setup.
- **GitHub auth for push:** Git Credential Manager + browser OAuth, already authorized once for the `farmsignal2026` account / `Smart-Farming26` org — future pushes from this machine shouldn't need re-authorization.

## Immediate next step

**Phase 1 — Auth + shell + core data layer** (see `WEB_DASHBOARD_PLAN.md` for full scope): login screen (phone+PIN / email, same synthetic-email pattern as the mobile app), session restore, officer-scope hydration, sidebar filter dropdowns, top stat row, and the core data-loading hook porting `loadFromSupabase()` — reusing the classification logic already verified (and bug-fixed) in the Flutter mobile port as the single source of truth.

## Related docs

- `C:\FarmSignaldemo\WEB_DASHBOARD_PLAN.md` — full Phase 0-9 plan, including the source-of-truth facts confirmed by reading `RS_Cane_Monitoring_S1.html` directly (legacy upload path, AI Insights being rules-based, the existing assign-to-officer flow, etc.)
- `C:\FarmSignaldemo\farmsignal_flutter\DEVELOPER_GUIDE.md` — the mobile app's equivalent reference, including the exact classification/business-rule logic this web port should stay consistent with
