# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Initial setup (install deps, generate Prisma client, run migrations)
npm run setup

# Development server (Next.js with Turbopack)
npm run dev

# Run all tests
npm test

# Run a single test file
npx vitest run src/lib/__tests__/file-system.test.ts

# Production build
npm run build

# Reset database
npm run db:reset
```

## Environment

Copy `.env` and add `ANTHROPIC_API_KEY`. Without it, the app falls back to a mock provider that returns static components.

## Architecture

UIGen is a Next.js 15 App Router app where users describe React components in a chat and see them rendered live.

### Request Flow

1. User sends a message → `POST /api/chat` (`src/app/api/chat/route.ts`)
2. The route calls Claude (or mock) via Vercel AI SDK `streamText` with two tools: `str_replace_editor` and `file_manager`
3. Claude uses these tools to create/modify files in a **virtual file system** (in-memory, never touches disk)
4. File changes stream back to the client via the AI SDK's data stream protocol
5. The preview iframe uses Babel standalone to transform JSX and render the component live

### Three-Panel Layout (`src/app/main-content.tsx`)

- **Left (35%):** Chat interface — messages + input
- **Right (65%):** Toggle between Preview (iframe) and Code (file tree + Monaco editor)

### Virtual File System (`src/lib/file-system.ts`)

`VirtualFileSystem` is a plain in-memory class that holds a file tree. It's serialized to JSON and persisted in the `Project.data` column. The FileSystem context (`src/lib/contexts/file-system-context.tsx`) wraps this and syncs state to React.

### AI Tools (`src/lib/tools/`)

- `str_replace_editor` — create, view, and do targeted string-replace edits on files
- `file_manager` — rename, delete, list directories

The system prompt (`src/lib/prompts/generation.tsx`) instructs Claude to always create `/App.jsx` as the entry point, use Tailwind CSS, and use `@/` import aliases.

### Preview (`src/components/preview/PreviewFrame.tsx`)

Renders an iframe that uses an import map + Babel standalone to resolve `@/` aliases and transform JSX at runtime. Looks for `/App.jsx`, `/index.jsx`, etc. as the entry point.

### LLM Provider (`src/lib/provider.ts`)

Uses `claude-haiku-4-5` by default. If `ANTHROPIC_API_KEY` is missing, returns a mock `LanguageModelV1` that emits static component code. Max steps: 40 (real) / 4 (mock).

### Auth (`src/lib/auth.ts`, `src/actions/index.ts`)

JWT sessions via `jose`, stored as HTTP-only cookies (7-day expiry). Anonymous users can work without signing in — their state is tracked in `localStorage` via `src/lib/anon-work-tracker.ts` and migrated to a real project on sign-up.

### Database

Prisma with SQLite (`prisma/dev.db`). Two models: `User` and `Project`. `Project.messages` and `Project.data` are JSON strings holding serialized chat history and the virtual file system respectively.

## Path Aliases

`@/*` maps to `src/*` — used everywhere in imports.
