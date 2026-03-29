# AGENTS.md — MikuChat

Terminal-based QQ chat client built on Bun, SolidJS, OpenTUI, and the OneBot 11 protocol via NapCat.

## Build & Run Commands

```bash
# Install dependencies
bun install

# Run in development mode (from source)
bun run dev
# Equivalent to: bun run --conditions=browser ./src/main.tsx

# Production build (outputs to dist/)
bun run build
# Equivalent to: bun run script/build.ts

# Type-check (no emit)
bun run typecheck
# Equivalent to: tsc --noEmit
```

### Testing

There is no test framework or test runner configured. The `test-*.tsx` and `test-*.sh`
files in the repo root are ad-hoc manual integration scripts (gitignored). There are
no unit tests to run. If you add tests, use `bun:test` (Bun's built-in test runner).

### Linting & Formatting

No ESLint, Prettier, or other linter/formatter is configured. There are no pre-commit
hooks. The only automated check is `tsc --noEmit` (typecheck).

## Tech Stack

| Layer          | Technology                                      |
|----------------|------------------------------------------------|
| Runtime        | Bun >= 1.1 (`bun:sqlite`, ESM, JSX transform) |
| UI framework   | SolidJS 1.9 with OpenTUI (`@opentui/solid`)   |
| Terminal       | Kitty (required for graphics protocol)         |
| QQ backend     | NapCat (OneBot 11 WebSocket)                   |
| Database       | SQLite via `bun:sqlite` (WAL mode)             |
| Image proc.    | sharp (JPEG to PNG for Kitty protocol)         |
| Bundler        | Bun.build with `@opentui/solid/bun-plugin`     |

## Project Structure

```
src/
  main.tsx                 Entry point, provider tree, global keybinds
  pages/                   Top-level page components (home, search)
  qq/                      QQ/OneBot 11 layer (client, bridge, db, types)
  tui/
    component/             UI components (chat prompt, images, borders, background)
    context/               SolidJS context providers (qq, chat-sync, route, theme, keybind, kv)
    routes/                Route page components (chat, sidebar)
    ui/                    Base UI primitives (dialog, toast)
    util/                  Utilities (clipboard, selection)
  stubs/                   Stub modules for OpenCode backend dependencies (not real implementations)
script/
  build.ts                 Production build script
```

## Code Style

### TypeScript Configuration

- Target: ESNext, Module: ESNext, Module resolution: bundler
- `strict: false` — strict mode is OFF
- `noUncheckedIndexedAccess: false`
- JSX: preserve with `jsxImportSource: "@opentui/solid"`
- Path aliases: `@/*` -> `./src/stubs/*`, `@tui/*` -> `./src/tui/*`
- Many files in `src/tui/` and `src/stubs/` are explicitly excluded from typecheck in tsconfig.json

### Module System

- ESM throughout (`"type": "module"` in package.json)
- Named exports strongly preferred over default exports
- Barrel files for re-exports (e.g., `src/qq/index.ts` with `export * from "./db"`)
- `export type *` used for type-only re-exports

### Import Order

Follow this order (no enforced linter rule, but consistent convention):

1. Side-effect imports (`import "./tui/component/image-register"`)
2. Framework imports (`solid-js`, `solid-js/store`, `@opentui/solid`, `@opentui/core`)
3. Path-aliased TUI imports (`@tui/context/...`, `@tui/component/...`)
4. Path-aliased stub imports (`@/global`, `@/util/...`)
5. Relative imports for same-layer code (`../../qq`, `./types`)
6. Node built-ins (`fs`, `path`, `os`)

### Naming Conventions

| Entity                    | Convention     | Example                              |
|---------------------------|----------------|--------------------------------------|
| Files                     | kebab-case     | `chat-sync.tsx`, `braille-scale.ts`  |
| SolidJS components        | PascalCase     | `QCHome`, `ChatPage`, `SegmentView`  |
| Types / Interfaces        | PascalCase     | `QCSession`, `OB11Segment`           |
| Discriminated unions      | PascalCase     | `type Route = HomeRoute \| ChatRoute` |
| Constants (config/arrays) | UPPER_SNAKE    | `LOGO_LINES`, `BRAILLE_BASE`        |
| Variables / functions     | camelCase      | `segmentsToPreview`, `getSessionId`  |
| Singleton objects         | PascalCase     | `Global`, `Filesystem`, `Clipboard`  |
| Signal pairs              | `[x, setX]`   | `const [open, setOpen] = createSignal(false)` |

### Formatting

- 2-space indentation
- Semicolons: inconsistent (some files use them, some don't). No linter enforces this.
  Match the style of the file you're editing.
- Trailing commas in multi-line constructs
- Double quotes for strings (general convention, not enforced)

### SolidJS Component Pattern

```tsx
export function ComponentName(props: Props) {
  // 1. Context hooks (useTheme, useQQ, useRoute, etc.)
  // 2. Signals and stores
  // 3. Memos and effects
  // 4. Event handler functions
  // 5. Return JSX with <box>, <text>, <Show>, <For>, <Switch>/<Match>
}
```

### Context Provider Pattern

All contexts use the shared `createSimpleContext` helper from `@tui/context/helper`:

```tsx
export const { use: useXxx, provider: XxxProvider } = createSimpleContext({
  name: "Xxx",
  init: (props?) => {
    // signals, stores, effects, cleanup
    return { /* reactive getters and methods */ }
  },
})
```

### OpenTUI JSX Elements

This project uses OpenTUI terminal rendering, NOT browser DOM. Intrinsic elements are:
`<box>`, `<text>`, `<textarea>`, `<scrollbox>`, `<code>`, `<img>` (custom registered).
Layout uses Yoga flexbox props: `flexGrow`, `flexDirection`, `gap`, `padding*`, `width`, `height`.

### Error Handling

The codebase uses a pragmatic "swallow and continue" approach:

- **Most errors are silently caught**: `try { ... } catch {}` and `.catch(() => {})` are common
- **User-facing failures** show toasts: `toast.show({ variant: "error", message: "..." })`
- **Internal failures** use `console.error()`
- **Functions return defaults on failure** rather than propagating exceptions
- **Do not introduce `throw` unless a caller explicitly handles it**

### Type Assertions

- `as any` is used liberally for type coercions from SQLite rows and dynamic data
- `@ts-expect-error` is used occasionally for known framework mismatches
- Zod is available (`zod` in deps) but only used for event bus validation, not broadly

### Database

- SQLite via `bun:sqlite` with WAL mode, accessed through `src/qq/db.ts`
- All DB functions are plain exported functions (not a class), e.g., `upsertSession()`, `getMessages()`
- Parameterized queries with positional placeholders (`?1`, `?2`, ...)
- JSON columns stored as strings, parsed on read (`JSON.parse(r.segments)`)

### Image Rendering

Uses Kitty Graphics Protocol via `fs.writeSync(1, ...)` to bypass OpenTUI's stdout interception.
Image caching is at `~/.cache/mikuchat/images/`. JPEG images are converted to PNG via `sharp`
before transmission because Kitty requires PNG for Unicode placeholder mode.

## Key Architectural Notes

- The app is a fork/derivative of [OpenCode TUI](https://github.com/anomalyco/opencode),
  repurposed from an AI coding assistant into a QQ chat client. Many `src/stubs/` modules
  exist to satisfy imports from inherited OpenCode code without real implementations.
- The `tsconfig.json` excludes many inherited files that aren't used. Don't add them back.
- NapCat management (start/stop QQ process with Xvfb) is in `src/qq/napcat.ts`.
- The bridge (`src/qq/bridge.ts`) deduplicates incoming WebSocket events before writing to SQLite.
- Theme files live in `src/tui/context/theme/*.json`. The default is `miku.json`.
