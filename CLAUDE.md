# CLAUDE.md — Echo Obsidian Plugin

## Project Overview

Obsidian plugin that syncs voice captures and todos between an Echo Web server and an Obsidian vault. Published as a public repo — **never commit sensitive data** (tokens, server URLs, passwords).

## Architecture

```
echo-obsidian-plugin/
├── main.ts          — Plugin entry point, lifecycle, commands, auto-sync
├── api.ts           — Echo Web API client (requestUrl-based, works on mobile)
├── sync.ts          — SyncEngine: orchestrates capture + todo sync
├── todo-sync.ts     — Two-way todo sync (Obsidian ↔ Echo Web)
├── daily-notes.ts   — Daily note CRUD, section append, todo section replace
├── meeting-notes.ts — Meeting note creation with frontmatter
├── formatter.ts     — Capture/todo formatting for daily notes
├── settings.ts      — Obsidian settings tab UI
├── types.ts         — TypeScript interfaces + default settings
├── styles.css       — Status bar badge styles
├── manifest.json    — Obsidian plugin manifest
└── esbuild.config.mjs — Build config
```

## Key Concepts

### Sync Flow
1. **Captures** (one-way: Echo Web → Obsidian):
   - `GET /api/sync?since=` fetches unsynced captures
   - Groups by date → appends to daily notes under `#### 🧠`
   - Meetings → separate files in meeting folder + link in daily note
   - `PATCH /api/captures/{id}/synced` marks as synced
   - Tracks `lastSyncTimestamp` for incremental sync

2. **Todos** (two-way: Echo Web ↔ Obsidian):
   - Echo Web → Obsidian: all active todos written to today's `#### ✅` section
   - Obsidian → Echo Web: 🎤-marked tasks scanned from recent daily notes
   - New `- [ ] 🎤 text` → `POST /api/todos` + adds `<!-- echo-todo:N -->`
   - Status changes → `PATCH /api/todos/{id}` with `{completed: bool}`
   - Scanner checks last 30 modified daily notes

### Deduplication
- Captures: `<!-- echo-id:N -->` in daily note prevents re-sync
- Todos: `<!-- echo-todo:N -->` links Obsidian task to Echo Web todo
- Meeting notes: checks if file with echo-id already exists

### Daily Note Structure
```
Journal/Daily/{YYYY}/{YYYY-MM-DD}.md  (folder configurable)
```
Template:
```markdown
---
typ: Daily
status: Active
date: YYYY-MM-DD
---
# YYYY-MM-DD

#### 🧠          ← captures go here
#### ✅          ← todos go here (replaced on each sync)
#### 🤖          ← robot/automated entries
```

### Settings (stored in data.json, NEVER commit)
- `serverUrl` — Echo Web server address
- `token` — JWT auth token
- `username` — logged-in user
- `syncIntervalMinutes` — auto-sync frequency (1-60)
- `lastSyncTimestamp` — ISO timestamp for incremental capture sync
- `sectionHeader` — daily note section for captures (default: `#### 🧠`)
- `dailyNoteFolder` — base folder for daily notes (default: `Journal/Daily`)
- `meetingFolder` — meeting notes folder (default: `Moten`)
- `syncTodos` — enable two-way todo sync
- `todoSectionHeader` — section for todos (default: `#### ✅`)
- `showAudioLinks`, `showLocation`, `showTags` — formatting toggles

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Login, get JWT |
| GET | `/api/auth/me` | Verify auth |
| GET | `/api/sync?since=` | Fetch unsynced captures |
| PATCH | `/api/captures/{id}/synced` | Mark capture synced |
| GET | `/api/sync/pending` | Count pending captures |
| GET | `/api/todos` | List all todos |
| POST | `/api/todos` | Create todo |
| PATCH | `/api/todos/{id}` | Update todo (text, completed) |

## Build & Deploy

```bash
npm install
npm run build          # Production build → main.js
npm run dev            # Dev build with sourcemaps
```

Deploy to vault:
```bash
cp main.js manifest.json styles.css ~/.obsidian/plugins/echo-web-sync/
```

## Release Process

1. Bump version in `manifest.json` and `package.json`
2. `npm run build`
3. Commit and push
4. `gh release create vX.Y.Z main.js manifest.json styles.css --title "vX.Y.Z"`

## Security Rules

- **NEVER** commit `data.json` (contains JWT tokens)
- **NEVER** hardcode server URLs (keep default empty)
- **NEVER** include `.env` files
- The `.gitignore` excludes: `node_modules/`, `main.js`, `data.json`, `.env`
- `main.js` is only included in GitHub Releases as a binary asset

## GitHub

- **Repo**: `jtecio/echo-obsidian-plugin` (PUBLIC)
- **Branch**: `main`
- **Releases**: https://github.com/jtecio/echo-obsidian-plugin/releases
- **Install via BRAT**: add `jtecio/echo-obsidian-plugin`
