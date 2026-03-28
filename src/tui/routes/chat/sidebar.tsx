// Chat sidebar - session list with unread badges
// Borrowed pattern from OpenCode's session/sidebar.tsx
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useChatSync } from "@tui/context/chat-sync"
import { useRoute } from "@tui/context/route"
import { RGBA } from "@opentui/core"

export function ChatSidebar() {
  const { theme } = useTheme()
  const sync = useChatSync()
  const route = useRoute()

  const sessions = createMemo(() => sync.sessions)
  const activeId = createMemo(() =>
    route.data.type === "chat" ? route.data.sessionId : null,
  )

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={32}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      borderRight={[true]}
      borderColor={theme.border}
    >
      {/* Header */}
      <box flexShrink={0} paddingBottom={1} paddingLeft={1}>
        <text fg={theme.text}>
          <b>Conversations</b>
        </text>
      </box>

      {/* Session list */}
      <scrollbox flexGrow={1}>
        <For each={sessions()} fallback={
          <box paddingLeft={1}>
            <text fg={theme.textMuted}>No conversations yet</text>
          </box>
        }>
          {(session) => {
            const isActive = createMemo(() => activeId() === session.id)
            const hasUnread = createMemo(() => session.unread_count > 0)
            const icon = createMemo(() =>
              session.type === "group" ? "G" : "P",
            )

            return (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={
                  isActive() ? theme.backgroundElement : undefined
                }
                onMouseUp={() => {
                  route.navigate({ type: "chat", sessionId: session.id })
                  sync.setActiveSession(session.id)
                }}
              >
                <box flexDirection="row" gap={1}>
                  {/* Type icon */}
                  <text fg={session.type === "group" ? theme.accent : theme.primary}>
                    {icon()}
                  </text>
                  {/* Name + unread */}
                  <box flexGrow={1} minWidth={0}>
                    <box flexDirection="row">
                      <text fg={isActive() ? theme.text : hasUnread() ? theme.text : theme.textMuted}>
                        {session.name.length > 18
                          ? session.name.slice(0, 17) + "…"
                          : session.name}
                      </text>
                      <box flexGrow={1} />
                      <Show when={hasUnread()}>
                        <text fg={theme.error}>
                          {" "}{session.unread_count > 99 ? "99+" : session.unread_count}
                        </text>
                      </Show>
                    </box>
                    {/* Preview */}
                    <Show when={session.last_message}>
                      <text fg={theme.textMuted}>
                        {(session.last_message || "").length > 22
                          ? (session.last_message || "").slice(0, 21) + "…"
                          : session.last_message}
                      </text>
                    </Show>
                  </box>
                </box>
              </box>
            )
          }}
        </For>
      </scrollbox>

      {/* Footer - QQ status */}
      <box flexShrink={0} paddingTop={1} paddingLeft={1}>
        <text fg={theme.textMuted}>
          {sessions().length} conversations
        </text>
      </box>
    </box>
  )
}
