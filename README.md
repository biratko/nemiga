# TaCom

Browser-based dual-panel file manager.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vue 3](https://img.shields.io/badge/Vue%203-4FC08D?logo=vuedotjs&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)

## Features

- **Dual-panel interface** — navigate, copy, move files between two panels
- **Tabs** — multiple directories open per panel
- **Keyboard-driven** — Total Commander keybindings (F5 copy, F6 move, F7 mkdir, F8 delete, Tab switch)
- **Archive support** — browse and extract zip, tar, tar.gz, tar.bz2, 7z, rar as virtual directories
- **Drag & drop** — move and copy files between panels with the mouse
- **Inline rename** — F2 to rename files in place
- **Context menu** — right-click for quick actions
- **Themes** — dark and light themes
- **Workspace persistence** — tabs, cursor position, sort order restored on restart
- **Electron packaging** — run as a standalone desktop app

## Quick Start

```bash
# Install dependencies
make install

# Run in development (two terminals)
make dev-backend    # Express + WebSocket on :8080
make dev-frontend   # Vite HMR on :5173

# Open http://localhost:5173
```

## Production

```bash
make build    # Build frontend and backend
make start    # Serve on http://localhost:8080
```

## Electron

```bash
make install-electron
make dist-electron        # Package desktop app
make dist-electron-deb    # Build .deb package
```

## Architecture

```
┌───────────────────────────────────────────┐
│                  Browser                  │
│  ┌─────────────────┐ ┌─────────────────┐  │
│  │   Left Panel    │ │   Right Panel   │  │
│  │  (FilePanel)    │ │  (FilePanel)    │  │
│  └────────┬────────┘ └────────┬────────┘  │
│           │  REST + WebSocket │           │
└───────────┼───────────────────┼───────────┘
            │                   │
┌───────────┼───────────────────┼───────────┐
│           ▼    Express + ws   ▼           │
│  ┌──────────────┐  ┌───────────────────┐  │
│  │  REST API    │  │  WS Handlers      │  │
│  │  /api/fs/*   │  │  copy,move,delete │  │
│  └──────┬───────┘  └────────┬──────────┘  │
│         │                   │             │
│         ▼                   ▼             │
│   ┌──────────────────────────────────┐    │
│   │  ProviderRouter                  │    │
│   │  LocalProvider · ArchiveProvider │    │
│   └──────────────────────────────────┘    │
│                 Backend                   │
└───────────────────────────────────────────┘
```

**Frontend** — Vue 3 + Composition API + Vite + TypeScript

**Backend** — Express 5 + ws (WebSocket) + TypeScript (ESM)

**Communication** — REST for reads (list, settings), dedicated WebSocket per long-running operation (copy/move/delete) with progress, confirm/cancel flow.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Navigate file list |
| Enter / Right | Open directory |
| Backspace / Left | Go up |
| Ctrl+Arrow | Open directory in opposite panel |
| Tab | Switch active panel |
| Insert | Toggle selection |
| F2 | Rename |
| F3 | View |
| F4 | Edit |
| F5 | Copy |
| F6 | Move |
| F7 | Create directory |
| F8 / Delete | Delete |
| Alt+T | New tab |
| Alt+W | Close tab |

## License

MIT
