// Session search dialog - reuses OpenCode's DialogSelect
// Supports fuzzy search by name, ID, and group number
import { createMemo } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useRoute } from "@tui/context/route"
import { useChatSync } from "@tui/context/chat-sync"
import { useTheme } from "@tui/context/theme"
import { getSessions } from "../qq"

export function SessionSearchDialog() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useChatSync()
  const { theme } = useTheme()

  // Load ALL sessions from DB (not just active ones)
  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const all = getSessions({ onlyActive: false, limit: 500 })
    return all.map((s) => {
      const id = s.target_id.toString()
      const unread = s.unread_count > 0 ? ` (${s.unread_count})` : ""
      return {
        title: `${s.name}${unread}`,
        value: s.id,
        // Searchable description includes the numeric ID
        description: id,
        category: s.type === "group" ? "Groups" : "Private",
        footer: s.last_message
          ? (s.last_message.length > 35 ? s.last_message.slice(0, 34) + "…" : s.last_message)
          : undefined,
      }
    })
  })

  const currentSession = createMemo(() => {
    if (route.data.type === "chat") return route.data.sessionId
    return undefined
  })

  return (
    <DialogSelect
      title="Search Conversations"
      placeholder="Search by name or ID..."
      options={options()}
      flat
      current={currentSession()}
      onSelect={(option) => {
        sync.setActiveSession(option.value)
        route.navigate({ type: "chat", sessionId: option.value })
        dialog.clear()
      }}
    />
  )
}
