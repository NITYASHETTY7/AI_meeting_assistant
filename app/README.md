# Mirai Granola — App

This is the Electron + React + TypeScript application. See the [root README](../README.md) for a full description of what Mirai Granola does.

## Development

```bash
pnpm install
pnpm dev
```

Starts the Vite dev server and launches Electron with hot module reload.

## Production build

```bash
pnpm build
```

## Stack

- Electron, React 19, TypeScript, Vite
- Tailwind CSS v4
- Zustand for state
- Better SQLite3 + Drizzle ORM for local storage
- oxlint for linting

## Structure

- `electron/` — main process (window creation, IPC handlers, native SQLite/keytar access)
- `src/` — renderer (React app: pages, components, services, store)
- `database/` — Drizzle schema and migrations (the actual `.db` file is gitignored — it contains your local data)
