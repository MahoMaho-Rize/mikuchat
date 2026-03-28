# MikuChat Multi-Platform Refactor Plan

> A terminal chat client disguised as a productivity tool.
> Currently QQ-only via NapCat/OneBot 11. Goal: support QQ + Telegram (and more) simultaneously.

## Current Architecture

```
NapCat (OneBot 11 WS) --> qq/client.ts --> qq/bridge.ts --> qq/db.ts --> TUI
```

Everything is coupled to QQ/OneBot: message types (`OB11Segment`), session IDs (`group_123`/`private_456`), send API, etc.

## Target Architecture

```
+-------------+  +-------------+  +-------------+
|  QQ/NapCat  |  |  Telegram   |  |  Discord    |  ...
|  Adapter    |  |  Adapter    |  |  Adapter    |
+------+------+  +------+------+  +------+------+
       |                |                |
       +--------+-------+----------------+
                |
        +-------v-------+
        |  Unified API  |  <-- ChatAdapter interface
        |  (Protocol)   |
        +-------+-------+
                |
        +-------v-------+
        |   Core Layer  |  <-- DB, Bridge, State Management
        +-------+-------+
                |
        +-------v-------+
        |     TUI       |  <-- Theme, rendering, interaction (unchanged)
        +---------------+
```

## Phase 1: Protocol Abstraction

### `src/protocol/types.ts`

```typescript
export interface ChatAdapter {
  readonly name: string                    // "qq", "telegram", "discord"
  readonly displayName: string             // "QQ", "Telegram", "Discord"
  readonly icon: string                    // "Q", "T", "D" (for TUI display)

  connect(config: Record<string, any>): Promise<void>
  disconnect(): void
  sendMessage(sessionId: string, segments: UnifiedSegment[]): Promise<void>
  onMessage(cb: (msg: UnifiedMessage) => void): () => void
  onEvent(cb: (evt: UnifiedEvent) => void): () => void

  readonly status: "connected" | "disconnected" | "connecting"
  readonly selfId: string
}

export type UnifiedSegment =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "mention"; userId: string; name: string }
  | { type: "reply"; messageId: string }
  | { type: "file"; url: string; name: string; size?: number }
  | { type: "sticker"; url: string; name?: string }
  | { type: "audio"; url: string; duration?: number }
  | { type: "video"; url: string }
  | { type: "forward"; messages: UnifiedMessage[] }
  | { type: "unknown"; raw: any }

export interface UnifiedMessage {
  id: string                               // platform-unique message ID
  sessionId: string                        // "{platform}:{type}_{id}"
  platform: string                         // "qq", "telegram"
  senderId: string
  senderName: string
  senderAvatar?: string
  senderRole?: string                      // "admin", "owner", "member"
  segments: UnifiedSegment[]
  rawText: string                          // plain text fallback
  timestamp: number                        // unix seconds
  isSelf: boolean
}

export interface UnifiedSession {
  id: string                               // "{platform}:{type}_{id}"
  platform: string
  name: string
  type: "group" | "private" | "channel"
  avatar?: string
  lastMessage?: string
  lastMessageTime: number
  unreadCount: number
}

export type UnifiedEvent =
  | { type: "message"; message: UnifiedMessage }
  | { type: "status"; platform: string; status: string }
  | { type: "error"; platform: string; error: string }
```

### `src/protocol/registry.ts`

```typescript
export class AdapterRegistry {
  private adapters: Map<string, ChatAdapter> = new Map()

  register(adapter: ChatAdapter): void
  unregister(name: string): void
  get(name: string): ChatAdapter | undefined
  getAll(): ChatAdapter[]
  getConnected(): ChatAdapter[]

  // Unified event stream from all adapters
  onMessage(cb: (msg: UnifiedMessage) => void): () => void
  onEvent(cb: (evt: UnifiedEvent) => void): () => void

  // Send via the correct adapter (parsed from sessionId prefix)
  sendMessage(sessionId: string, segments: UnifiedSegment[]): Promise<void>
}
```

## Phase 2: Adapter Implementations

### QQ Adapter (`src/adapters/qq/`)

Wraps existing `qq/client.ts` and `qq/napcat.ts`:

```
src/adapters/qq/
  index.ts          QQAdapter implements ChatAdapter
  client.ts         Existing NapCat WS client (internal)
  napcat.ts         NapCat process manager (internal)
  convert.ts        OB11Segment <-> UnifiedSegment conversion
```

Key conversion logic in `convert.ts`:
- `OB11Segment[]` -> `UnifiedSegment[]` (incoming)
- `UnifiedSegment[]` -> `OB11Segment[]` (outgoing)
- Session ID mapping: `group_123` -> `qq:group_123`
- Message ID: `string(message_id)` -> `qq:${message_id}`

### Telegram Adapter (`src/adapters/telegram/`)

Uses Telegram Bot API (simpler than MTProto):

```
src/adapters/telegram/
  index.ts          TelegramAdapter implements ChatAdapter
  client.ts         Bot API long-polling client
  convert.ts        Telegram types <-> UnifiedSegment conversion
```

Requirements:
- Bot Token from @BotFather
- `getUpdates` long-polling loop for receiving messages
- `sendMessage` / `sendPhoto` / `sendDocument` for sending
- Privacy mode must be disabled for group messages

Telegram message type mapping:
| Telegram | UnifiedSegment |
|---|---|
| `text` + `entities` | `text` + `mention` segments |
| `photo` | `image` (use `getFile` to get URL) |
| `document` | `file` |
| `sticker` | `sticker` |
| `voice` | `audio` |
| `video` | `video` |
| `reply_to_message` | `reply` segment prepended |

## Phase 3: Core Layer Refactor

### DB Schema Changes (`src/core/db.ts`)

```sql
-- Add platform column to sessions
ALTER TABLE sessions ADD COLUMN platform TEXT NOT NULL DEFAULT 'qq';

-- Add platform column to messages
ALTER TABLE messages ADD COLUMN platform TEXT NOT NULL DEFAULT 'qq';

-- Update session IDs: "group_123" -> "qq:group_123"
UPDATE sessions SET id = 'qq:' || id WHERE id NOT LIKE '%:%';
UPDATE messages SET session_id = 'qq:' || session_id WHERE session_id NOT LIKE '%:%';

-- New index for platform filtering
CREATE INDEX IF NOT EXISTS idx_sessions_platform ON sessions(platform);
```

Session ID format: `{platform}:{type}_{id}`
- `qq:group_123456`
- `qq:private_789012`
- `tg:group_-100123456`
- `tg:private_987654`

### Bridge (`src/core/bridge.ts`)

Receives `UnifiedMessage` from any adapter, writes to DB:

```typescript
export function createBridge(registry: AdapterRegistry, options?: BridgeOptions) {
  const recentIds = new Set<string>()

  registry.onMessage((msg: UnifiedMessage) => {
    // Dedup
    const key = `${msg.platform}:${msg.id}`
    if (recentIds.has(key)) return
    recentIds.add(key)

    // Upsert session
    upsertSession({
      id: msg.sessionId,
      platform: msg.platform,
      // ...
    })

    // Insert message
    insertMessage({
      session_id: msg.sessionId,
      platform: msg.platform,
      // ...
    })
  })
}
```

### Config (`src/core/config.ts`)

Config file at `~/.config/mikuchat/config.json`:

```json
{
  "adapters": {
    "qq": {
      "enabled": true,
      "ws": "ws://localhost:3001",
      "selfId": "1619287560",
      "napcat": {
        "autoStart": false,
        "qqPath": "/home/kiriko/Napcat/opt/QQ/qq",
        "account": "1619287560"
      }
    },
    "telegram": {
      "enabled": true,
      "token": "123456:ABC-DEF..."
    }
  }
}
```

## Phase 4: TUI Layer Changes

### `context/qq.tsx` -> `context/chat.tsx`

Replace `QQProvider` with `ChatProvider`:

```typescript
// Exposes:
// - registry: AdapterRegistry
// - adapters: ChatAdapter[] (all registered)
// - connected: ChatAdapter[] (currently connected)
// - connect(platform, config): Promise<void>
// - disconnect(platform): void
// - sendMessage(sessionId, segments): Promise<void>
```

### Home Page Commands

```
/connect qq           Connect to QQ via NapCat
/connect tg           Connect to Telegram
/disconnect qq        Disconnect QQ
/disconnect tg        Disconnect Telegram
/status               Show all adapter statuses
/start qq             Start NapCat + connect
```

### Session List Display

Each session card shows platform icon:

```
╭ 12:34 Q G 某某QQ群 ──────────╮
│   最新消息预览...              │
╰───────────────────────────────╯
╭ 12:35 T P @someone ──────────╮
│   Hello from Telegram         │
╰───────────────────────────────╯
```

Platform icons: `Q` = QQ, `T` = Telegram, `D` = Discord, `M` = Matrix

### Message Rendering

Replace `OB11Segment` switch with `UnifiedSegment` switch in `SegmentView`:

```typescript
function SegmentView(props: { segment: UnifiedSegment }) {
  switch (props.segment.type) {
    case "text": return <text>{props.segment.text}</text>
    case "image": return <QQImage url={props.segment.url} />
    case "mention": return <text fg={theme.accent}>@{props.segment.name}</text>
    case "reply": return <text fg={theme.textMuted}>[Reply]</text>
    case "sticker": return <text>[Sticker]</text>
    // ...
  }
}
```

## File Structure After Refactor

```
src/
  protocol/
    types.ts                 Unified interfaces
    registry.ts              Adapter registry + event multiplexing
  adapters/
    qq/
      index.ts               QQAdapter implements ChatAdapter
      client.ts              NapCat WS client
      napcat.ts              NapCat process manager
      convert.ts             OB11 <-> Unified conversion
    telegram/
      index.ts               TelegramAdapter implements ChatAdapter
      client.ts              Bot API long-polling client
      convert.ts             TG <-> Unified conversion
  core/
    db.ts                    SQLite with platform field
    bridge.ts                Unified message -> DB bridge
    config.ts                Multi-adapter config management
  tui/
    context/
      chat.tsx               ChatProvider (replaces QQProvider)
      chat-sync.tsx          ChatSyncProvider (unchanged API, new internals)
      ...                    (theme, route, keybind etc. unchanged)
    component/
      segment-view.tsx       Unified segment renderer
      ...                    (chat-prompt, border, miku-bg etc. unchanged)
    routes/
      chat/index.tsx          Uses UnifiedSegment
      chat/sidebar.tsx        Shows platform icons
    pages/
      home.tsx                Multi-adapter commands
      search.tsx              Search across platforms
  main.tsx                    Entry point
```

## Migration Strategy

1. Create `src/protocol/` with interfaces (no breaking changes)
2. Create `src/adapters/qq/` by extracting from `src/qq/`, implement ChatAdapter
3. Create `src/core/` by refactoring `src/qq/db.ts` and `src/qq/bridge.ts`
4. Migrate DB schema (add platform column, update IDs)
5. Replace `QQProvider` with `ChatProvider` in TUI layer
6. Update message rendering to use `UnifiedSegment`
7. Verify QQ still works end-to-end
8. Implement Telegram adapter
9. Test multi-platform simultaneous connection

## Future Platform Ideas

| Platform | Protocol | Difficulty | Notes |
|---|---|---|---|
| Discord | Gateway WS + REST | Medium | Bot token or user token |
| Matrix | Client-Server API | Medium | Open protocol, good fit |
| Slack | Socket Mode | Low | Workspace token |
| IRC | IRC protocol | Low | Classic, simple |
| WeChat | Third-party bridge | High | Heavy anti-bot measures |
| Signal | Signal Protocol | High | Needs linked device |
