repo: polerix/SpinnerCockpit
branch: main

## Last sync

date: 2026-09-16
note: local and GitHub histories joined on main; the local cockpit snapshot is preserved on backup/local-before-sync-2026-09-16. Pages publishes the built cockpit from docs/.

### Updated in this project
- Preserved the original instrument demo in root `index.html`.
- Added the newer Vite cockpit as `app.html`, served at the development server root and built into `docs/index.html` for Pages.
- Added the local app sources, tests, data, and fabrication assets to `main`.

## Screen map

| Screen | Repo files |
| --- | --- |
| Spinner Cockpit.dc.html | README.html (bundled), support.js |
| Spinner Cockpit v1 instruments.dc.html | index.html (bundled), support.js |
| Los Angeles cockpit | app.html, src/, spinner.css, public/ |
| Mask geometry | Spinner Dashboard hud.svg, uploads/Spinner Dashboard hud.svg |
| Reference art | Spinner Dashboard.svg, il_1140xN.4957876296_9b0j.webp, uploads/Screenshot 2026-09-14 at 4.05.18 PM.png |

## Sync history

- 2026-09-14 — repo associated, empty upstream; README.md and github.md prepared locally.
- 2026-09-16 — joined the two root histories without discarding either; kept the existing Pages homepage and added the local app separately.
- 2026-09-16 — published the Vite cockpit through the `docs/` Pages source; retained the original instrument demo in the repository root.
- 2026-09-19 — **note for Dispatch:** found `publish.sh` sitting untracked in this repo's root and deleted it at the user's request. It wasn't a SpinnerCockpit script — it required root `index.html` to be over 100KB (this repo's is 27KB) and, on success, would `mkdir`+`cp` a new standalone repo named `comic-press`, `git init` it, and `gh repo create --push` with the commit message "The Comic Press: Mad Lib comic workflow" plus a Pages enable call. That's a different project (a mad-lib comic generator) — it looks like this script was meant to run in that project's directory, not here, and got dropped into SpinnerCockpit instead. If you're Dispatch picking this up: the user's local git/gh auth is confirmed healthy from a separate Claude Code session on this machine (verified `gh auth status` + `git ls-remote origin` both succeeded 2026-09-19), so if you hit a push/token error it's likely your own connector session needing reconnect (Settings → Connectors → GitHub in Claude Desktop), not this machine's credentials. Recreate `publish.sh` in the `comic-press` project's own directory if that work still needs doing.
