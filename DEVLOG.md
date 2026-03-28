# MikuChat Development Log

> A chronicle of building a terminal QQ chat client on OpenTUI, and every wall we ran into along the way.

## Project Genesis

**Goal**: Build a TUI-based QQ chat client using OpenTUI (the terminal UI framework extracted from OpenCode), with NapCat as the QQ backend via OneBot 11 WebSocket protocol. Run in Kitty terminal with full pixel-level image rendering.

**Stack**: Bun + SolidJS + OpenTUI + SQLite + NapCat/OneBot 11 + Kitty Graphics Protocol

---

## Phase 1: Extracting OpenTUI from OpenCode

### The 46-Stub Hell

OpenCode's TUI components are deeply entangled with its backend services — session management, LLM providers, MCP servers, LSP, project management, etc. Every `import` chain eventually reaches into backend code.

**The problem**: We wanted ONLY the UI framework, but it imports 46+ `@/` paths and `@opencode-ai` packages.

**The solution**: Created stub modules for every single backend dependency — empty implementations that satisfy the type checker without pulling in real backend code. Files like `src/stubs/session/index.ts`, `src/stubs/provider/provider.ts`, `src/stubs/tool/bash.ts`, etc. Each one exports the minimum interface the TUI code expects.

**Lesson**: OpenTUI is NOT a standalone library. It's surgically extracted organ tissue that needs life support (stubs) to survive outside the host.

### SyncProvider's Loading Gate

OpenTUI wraps everything in a `<Show when={ready}>` gate via `createSimpleContext` in `helper.tsx`. The `SyncProvider` starts with `status: "loading"`, which blocks all rendering until the backend SDK connects.

**The problem**: We don't have an SDK. The app just showed a blank screen forever.

**The fix**: Changed `SyncProvider`'s initial status to `"partial"` with fallback agent data, bypassing the loading gate.

### Build System Discovery

OpenTUI requires a specific build incantation:
- `bunfig.toml` must have `preload = ["@opentui/solid/preload"]` for JSX compilation
- Build script uses `@opentui/solid/bun-plugin` for SolidJS JSX transform
- Must run with `--conditions=browser` flag
- `tsconfig.json` path aliases: `@/*` → `./src/stubs/*`, `@tui/*` → `./src/tui/*`

Getting this wrong produces cryptic "JSX element has no construct or call signature" errors that tell you nothing useful.

---

## Phase 2: QQ/NapCat Integration

### NapCat Configuration Archaeology

NapCat's config file location is non-obvious:
```
/home/kiriko/Napcat/opt/QQ/resources/app/app_launcher/napcat/config/onebot11_1619287560.json
```

**Key discovery**: `reportSelfMessage: true` must be set to see your own sent messages in the WS stream. Without this, you send a message and it just vanishes into the void — no echo, no confirmation.

### NapCat Launch Sequence

NapCat needs a virtual X display:
```bash
Xvfb :99 &
DISPLAY=:99 /home/kiriko/Napcat/opt/QQ/qq --no-sandbox --disable-gpu --disable-software-rasterizer -q 1619287560
```

**The lifecycle trap**: If MikuChat starts NapCat (`/start`), it should kill it on exit. If MikuChat attaches to an existing NapCat (`/connect`), it must NOT kill it on exit. This is tracked by a `weStartedNapcat` flag.

### Message Deduplication

NapCat sometimes sends duplicate messages via WebSocket. Without dedup, the chat fills with repeated messages.

**Two-layer dedup**:
1. Bridge layer: `recentIds` Set tracking `message_id` values
2. DB layer: `INSERT OR IGNORE` with unique index on `message_id`

### @Mention Nickname Resolution

QQ @mentions arrive as `[CQ:at,qq=123456]` — just a number, no name. Displaying raw QQ numbers is useless.

**Solution**: Build a `nicknameMap` from message history — every message has `user_id` + `nickname`/`card`, so we accumulate a mapping and use it to resolve @mentions to display names.

---

## Phase 3: Kitty Graphics Protocol — The Image Rendering Saga

This was by far the most painful part of the entire project. Multiple days of debugging.

### Attempt 1: Unicode Placeholder Method (FAILED)

The Kitty docs describe a "Unicode Placeholder" method using `U+10EEEE` characters that get replaced with image pixels during rendering.

**Result**: Complete failure. Despite running Kitty 0.43.1 which should support it, the characters just rendered as tofu boxes. Spent hours debugging before abandoning this approach.

### Attempt 2: Direct Kitty Escape Sequences (PARTIALLY WORKED)

Kitty Graphics Protocol uses escape sequences: `\x1b_G...;\x1b\\` with base64-encoded image data.

**Critical discovery #1**: OpenTUI intercepts `process.stdout.write()` — ALL stdout goes through OpenTUI's rendering pipeline, which corrupts binary escape sequences. But `fs.writeSync(1, ...)` bypasses the interception entirely. All Kitty graphics must use `fs.writeSync(1, ...)`.

This took a long time to figure out. The symptoms were: image commands sent, terminal receives garbage, nothing renders. The root cause was invisible — OpenTUI's stdout hook silently mangles the escape sequences.

### The JPEG Disaster

**Critical discovery #2**: Kitty's `f=100` format flag means PNG. We were sending JPEG data with `f=100`, and Kitty silently failed — no error, no image, just nothing.

NapCat image URLs from `multimedia.nt.qq.com.cn` return JPEG images. Every single one needs to be converted to PNG via `sharp` before transmission.

**This was the main blocker for image rendering**. The debugging process:
1. Images work in test scripts → images fail in app
2. Test scripts use PNG test images → app downloads JPEG from QQ servers
3. Hours of comparing byte-by-byte output
4. Finally realized the format mismatch

### Content-Hash Pool Caching

Kitty terminal has limited image memory. Uploading the same image twice wastes memory.

**Solution**: Hash image content with `Bun.hash()`, use as cache key. Each unique image is:
1. Downloaded from URL
2. Cached to disk (`~/.cache/mikuchat/images/`)
3. Converted JPEG→PNG via sharp
4. Transmitted to terminal memory once (`a=t`)
5. Placed per-renderable (`a=p`) with viewport clipping for scrolling

### Viewport Clipping for Scrolling

When you scroll a chat, images need to be clipped to the visible viewport. Kitty doesn't do this automatically for `a=p` placements.

The ImageRenderable must calculate which portion of the image is visible based on scroll position and only place that region. Getting the math wrong means images "float" over the UI or disappear entirely.

### Yoga Layout Integration

OpenTUI uses Yoga (CSS Flexbox) for layout. Custom renderables need to integrate with it.

**Trap**: `node.markDirty()` only works on leaf nodes with custom measure functions. For image elements, you must use `node.setWidth()/setHeight()` which auto-triggers relayout. Using `markDirty()` on non-leaf nodes silently does nothing.

Also: `renderSelf` must be empty for image renderables — images bypass the text buffer entirely and write directly to the terminal via `fs.writeSync(1, ...)`.

---

## Phase 4: ChatPrompt Component

### Textarea vs Input

OpenTUI has both `<input>` and `<textarea>` elements. The chat input MUST use `<textarea>` (multi-line support, Enter to send, Meta+Enter for newline).

The correct keybinding setup uses `useTextareaKeybindings()` from OpenTUI, not custom key handlers.

### Clipboard Paste Bug

Initial implementation tried to `preventDefault()` on paste events and manually insert text.

**The problem**: OpenTUI's textarea already handles paste natively and correctly. Preventing default and re-inserting breaks the cursor position and undo stack.

**The fix**: Just let textarea handle paste. Only do `markDirty()` + `requestRender()` after to fix layout.

### Clean Exit

**Never use `process.exit(0)` with OpenTUI**. It leaves the terminal in a broken state (alternate screen buffer not cleared, cursor hidden, raw mode stuck).

**Correct pattern**: `useExit()` → `renderer.destroy()` → let the process exit naturally.

---

## Phase 5: Miku Theme & Visual Overhaul

### Theme System

Created `miku.json` with Hatsune Miku's signature colors:
- Primary: `#39C5BB` (Miku teal)
- Secondary: `#E12885` (Miku pink)
- Borders: `#E5C07B` (warm yellow — creates nice contrast with teal background)
- Background: `#0A1A1E` (deep blue-green, NOT pure black)

### The getCustomThemes() Catch Trap

**Bug that took forever to find**: On startup, `ThemeProvider` calls `getCustomThemes()` to scan for custom theme files. In MikuChat, there's no `.opencode` directory, so this throws an error. The `catch` handler was:

```javascript
.catch(() => {
  setStore("active", "opencode")  // ← SILENTLY OVERRIDES YOUR THEME
})
```

This meant MikuChat always fell back to the `opencode` theme (background `#0A0A0A`, basically pure black) despite `miku` being set as default. The miku theme would briefly flash then get replaced.

**Debugging process**: Added `fs.appendFileSync` debug logging to `/tmp/` because `process.stderr.write` is also intercepted by OpenTUI. Captured:
```
[THEME] active="miku"    bg=#0a1a1e   ← correct, briefly
[THEME] active="opencode" bg=#0a0a0a   ← overridden by catch!
```

**The fix**: Don't override the theme in the catch handler. Custom theme loading failure is not a reason to change the selected theme.

### Braille Character Art Background

The Miku background uses braille characters (`⠀`-`⣿`), each encoding a 2×4 dot grid. The source art is 177 lines × 639 columns.

**The scaler** (`braille-scale.ts`):
1. Decode braille text → binary bitmap (1278×708 dots)
2. For each target cell, map to source region, compute dot density
3. Re-encode to braille if density exceeds threshold

This runs on every terminal resize. For large terminals this is thousands of braille characters recomputed. Performance is acceptable because it's pure integer math.

### Background Color: The "荧光感" Mystery

User reported MikuCode (OpenCode mod) had a nice "fluorescent" quality to its background but MikuChat was "pure black".

**Investigation**: Both projects used identical miku.json, identical braille art, identical MikuBackground component. Diffed everything — no differences.

**Root cause**: The `getCustomThemes()` catch trap (described above). MikuCode's OpenCode host handled the error differently and actually stayed on the miku theme. MikuChat silently fell back to opencode's pure black background.

The "fluorescent" effect was simply the miku theme's `#0A1A1E` background (deep teal-tinged dark) interacting with the `#39C5BB` braille dots. Pure black (`#0A0A0A`) has no teal tint, so the dots look flat.

### Root Box Dimensions

MikuChat's root `<box>` originally used `flexGrow={1}` without explicit width/height. OpenCode's root box uses `width={dims().width} height={dims().height}`.

Without explicit dimensions, the background color doesn't fill the entire terminal — edges show pure terminal black. Had to add `useTerminalDimensions()` and set explicit width/height on the root box.

### Card-Style UI ("每个组件圈一个")

The initial approach was wrapping everything in one big panel — this completely covered the Miku background art.

**User feedback**: "不是,不要这样,你这样将底下的miku画给遮住了,你这样啊,每一行每一条消息,每一个组件圈一个啊"

Redesigned to: each independent element (message bubble, header, session card, shortcut pill) gets its own small `╭──╮` rounded border with `backgroundColor={theme.background}`. The Miku art shows through the gaps between cards.

The `MikuPanelBorder` constant:
```typescript
export const MikuPanelBorder = {
  ...EmptyBorder,
  topLeft: "╭", topRight: "╮",
  bottomLeft: "╰", bottomRight: "╯",
  horizontal: "─", vertical: "│",
}
```

**Border crash**: First attempt omitted `bottomT`, `topT`, `cross`, `leftT`, `rightT` fields. OpenTUI accesses these during border rendering → `undefined is not an object` crash. Must always spread `...EmptyBorder` as base.

### LOGO Character Art

Original OpenCode logo uses a custom shadow system with `_^~` marker characters. Replacing "OPEN" with "MIKU" in this system produced garbled output because the shadow math didn't work with different letter shapes.

**Solution**: Threw out the entire shadow system. Replaced with simple `███╗` box-drawing style (same as MikuChat), one color per line via `LOGO_GRADIENT` array. Much cleaner.

---

## Phase 6: MikuCode (OpenCode Mod)

Porting the visual changes back to OpenCode was mostly mechanical but had its own surprises.

### Session Page: 2282 Lines

OpenCode's `session/index.tsx` is 2282 lines. Finding all message rendering locations required systematic searching for `SplitBorder`, `border={["left"]}`, `<code`, `<markdown`, etc. Five separate message box types needed conversion.

### InlineTool Had No Border

The `InlineTool` component (renders one-line tool calls like `✓ glob src/**/*.ts`) had no border at all — just padding. Easy to miss because it looks fine without a background art behind it. Had to wrap it in a card too.

### Type Error: RGBA vs String

Logo gradient colors are hex strings (`"#39C5BB"`). The `renderLine` function expects `RGBA` objects. Using `as RGBA` cast fails at runtime. Need `RGBA.fromHex()` conversion.

### CLI Logo (`ui.ts`)

OpenCode has TWO logo renderers — the TUI one (`logo.tsx`) and a CLI one (`ui.ts`) for non-TUI contexts. The CLI one uses raw ANSI escape codes. Had to rewrite it to use `LOGO_LINES` + true-color ANSI (`\x1b[38;2;R;G;Bm`).

---

## Key Discoveries Summary

| Discovery | Impact |
|---|---|
| OpenTUI intercepts `stdout.write` but NOT `fs.writeSync(1,...)` | All Kitty graphics must bypass OpenTUI |
| Kitty `f=100` is PNG only, not JPEG | Every QQ image needs sharp conversion |
| `node.markDirty()` only works on leaf nodes | Use `setWidth()/setHeight()` instead |
| Unicode Placeholder (`U+10EEEE`) doesn't work | Wasted hours, use direct placement instead |
| `getCustomThemes().catch` silently overrides theme | The "pure black background" mystery |
| `SyncProvider` loading gate blocks rendering | Change initial status to "partial" |
| `process.exit(0)` breaks terminal state | Always use `renderer.destroy()` |
| Paste: let textarea handle it natively | Don't `preventDefault` on paste |
| `customBorderChars` needs ALL fields | Always spread `...EmptyBorder` |
| WAL mode DB: must copy `.db` + `.db-wal` + `.db-shm` | Data lives in WAL file, not main DB |
| `reportSelfMessage: true` in NapCat config | Without it, own messages are invisible |

---

## Timeline

1. **Day 1-2**: Extract OpenTUI, create 46 stubs, get blank screen rendering
2. **Day 2-3**: QQ data layer (WS client, bridge, DB), NapCat integration
3. **Day 3-5**: Kitty image rendering hell (stdout interception, JPEG→PNG, viewport clipping)
4. **Day 5-6**: ChatPrompt, clipboard paste, clean exit, session search
5. **Day 6-7**: Miku theme, braille background, card-style UI, MikuCode port
6. **Day 7**: Background color debugging, project rename, git init

## Stats

- ~190 source files
- ~27,000 lines of code
- 46 stub modules for backend dependencies
- 1 braille art scaler
- 1 Kitty Graphics Protocol image renderer with content-hash pool
- 2 products: MikuChat (QQ client) + MikuCode (OpenCode skin)
- Countless hours staring at hexdumps of Kitty escape sequences
