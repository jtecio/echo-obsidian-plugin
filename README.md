# Echo Web Sync — Obsidian Plugin

Auto-sync voice captures and todos between [Echo Web](https://github.com/jtecio/echo-web) and your Obsidian vault.

## Features

- **Capture sync** — Voice captures from Echo Web appear in your daily notes
- **Meeting notes** — Meeting captures create separate notes with frontmatter
- **Two-way todo sync** — Todos sync bidirectionally between Echo Web and Obsidian
- **Configurable folders** — Choose where daily notes and meeting notes are stored
- **Auto-sync** — Runs every N minutes (configurable)
- **Deduplication** — Safe to run multiple times, never creates duplicates

## Requirements

- An [Echo Web](https://github.com/jtecio/echo-web) server instance
- Obsidian 1.0.0+

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder `.obsidian/plugins/echo-web-sync/` in your vault
3. Copy the files into that folder
4. Enable the plugin in Obsidian Settings → Community Plugins

### BRAT (recommended for beta)
1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Add `jtecio/echo-obsidian-plugin` as a beta plugin
3. Enable Echo Web Sync in Community Plugins

## Setup

1. Go to Settings → Echo Web Sync
2. Enter your Echo Web server URL
3. Login with your credentials
4. Adjust sync interval and folder settings as needed

## Todo Sync

Tasks marked with 🎤 in daily notes sync with Echo Web:

```markdown
- [ ] 🎤 Buy groceries
- [x] 🎤 Fix deployment pipeline
```

- New 🎤 tasks → created in Echo Web on next sync
- Checking/unchecking → status updates in Echo Web
- Echo Web todos → written to today's daily note with 🎤 marker

## Daily Note Format

Captures are appended under the configured section header (default `#### 🧠`):

```markdown
#### 🧠

- **14:30** Voice note about project planning #work
  🎵 [Lyssna](https://your-server/api/captures/42/audio?token=...)
  <!-- echo-id:42 -->

#### ✅

- [ ] 🎤 Review pull request <!-- echo-todo:5 -->
- [x] 🎤 Deploy to production <!-- echo-todo:3 -->
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Server URL | (empty) | Your Echo Web server address |
| Sync interval | 5 min | Auto-sync frequency (1-60 min) |
| Section header | `#### 🧠` | Daily note section for captures |
| Daily note folder | `Journal/Daily` | Base folder (year subfolder auto-created) |
| Meeting folder | `Moten` | Where meeting notes are created |
| Sync todos | On | Enable two-way todo sync |
| Todo section | `#### ✅` | Daily note section for todos |
| Show audio links | On | Include playback links |
| Show location | On | Include location info |
| Show tags | On | Include tags |

## Building from source

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## License

MIT
