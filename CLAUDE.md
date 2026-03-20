# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with Turbopack on port 3000
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run Vitest unit tests
npm run setup        # Install deps + generate Prisma client + run migrations
npm run db:reset     # Reset database (destructive)
```

Run a single test file: `npx vitest run src/path/to/__tests__/file.test.ts`

## Environment

Copy `.env.example` to `.env`. `ANTHROPIC_API_KEY` is optional — without it, the app runs in mock mode generating static demo components.

## Architecture

**UIGen** is an AI-powered React component generator with live preview. Users describe components in natural language; Claude generates them in real-time via a split-view interface (chat left, preview/editor right).

### Data Flow

1. User sends message → `ChatContext` (`src/lib/contexts/chat-context.tsx`) calls `/api/chat`
2. `/api/chat/route.ts` runs Vercel AI SDK `streamText()` with two tools enabled
3. Claude calls `str_replace_editor` or `file_manager` tools to modify files
4. Tools update the in-memory **VirtualFileSystem** (`src/lib/file-system.ts`)
5. `FileSystemContext` propagates changes to React tree
6. `PreviewFrame` transforms JSX via Babel standalone → blob URLs → sandboxed iframe
7. On stream completion, messages + serialized file system are persisted to SQLite via Prisma

### Key Abstractions

**VirtualFileSystem** (`src/lib/file-system.ts`) — All AI-generated code lives in an in-memory FS. Nothing is written to disk during generation. Supports full CRUD, rename, serialize/deserialize.

**AI Tools** — Two tools are provided to Claude via the Vercel AI SDK:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`) — view/create/str_replace/insert/undo_edit on virtual files
- `file_manager` (`src/lib/tools/file-manager.ts`) — rename/delete virtual files

**Provider** (`src/lib/provider.ts`) — Abstraction over Anthropic API. Uses `claude-haiku-4-5-20251001` by default. Falls back to mock mode (static demo components) when no API key is set.

**JSX Transform** (`src/lib/transform/jsx-transformer.ts`) — Browser-side Babel transforms JSX files, resolves dependencies via `esm.sh` CDN, generates preview HTML.

### State Management

Two React Contexts (no Redux/Zustand):
- `FileSystemContext` — virtual FS state + file CRUD operations
- `ChatContext` — wraps Vercel AI SDK `useChat()`, handles tool call responses, tracks anonymous sessions

### Auth

JWT tokens in httpOnly cookies (7-day expiration). `src/middleware.ts` guards protected routes. Anonymous users' work tracked in localStorage via `src/lib/anon-work-tracker.ts`.

### Database

SQLite via Prisma. See `prisma/schema.prisma` for the authoritative schema definition. Models: `User` (id, email, password) → `Project` (id, name, userId?, messages as JSON string, data as JSON-serialized file system). Always reference `prisma/schema.prisma` when reasoning about stored data structures.

### Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json`).

### Testing

Vitest with jsdom. Tests co-located in `__tests__` directories alongside source files.
