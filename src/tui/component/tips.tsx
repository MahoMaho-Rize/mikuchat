import { createMemo, createSignal, For } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"

const themeCount = Object.keys(DEFAULT_THEMES).length
const themeTip = `Use {highlight}/themes{/highlight} or {highlight}Ctrl+X T{/highlight} to switch between ${themeCount} built-in themes`

type TipPart = { text: string; highlight: boolean }

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

export function Tips() {
  const theme = useTheme().theme
  const parts = parse(TIPS[Math.floor(Math.random() * TIPS.length)])

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Tip{" "}
      </text>
      <text flexShrink={1}>
        <For each={parts}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}

const TIPS = [
  "Use {highlight}/start{/highlight} to launch NapCat and connect to QQ automatically",
  "Use {highlight}/connect{/highlight} to connect to an already running NapCat instance",
  "Press {highlight}Ctrl+K{/highlight} to fuzzy search conversations by name or ID",
  "Press {highlight}Ctrl+B{/highlight} to toggle the session sidebar",
  "Use {highlight}PageUp{/highlight}/{highlight}PageDown{/highlight} to scroll through chat history",
  "Press {highlight}Home{/highlight} to load older messages and jump to the top",
  "Press {highlight}End{/highlight} to jump to the latest messages",
  "Press {highlight}Meta+Enter{/highlight} to insert a newline in your message",
  "Type {highlight}/back{/highlight} or {highlight}/home{/highlight} to return to the home screen",
  "Type {highlight}/status{/highlight} to check WebSocket connection state",
  "Type {highlight}/img ~/path/to/image.png{/highlight} to send an image in chat",
  "Send {highlight}/img{/highlight} with a file path to share images in conversations",
  themeTip,
  "MikuChat stores messages in SQLite at {highlight}~/.local/share/mikuchat/qc.db{/highlight}",
  "Ensure {highlight}reportSelfMessage: true{/highlight} in NapCat config to see your own messages",
  "NapCat WebSocket default is {highlight}ws://127.0.0.1:3001{/highlight}",
  "MikuChat requires {highlight}Kitty terminal{/highlight} for image rendering support",
  "Press {highlight}Ctrl+C{/highlight} to quit MikuChat",
  "New messages won't interrupt you while browsing history — press {highlight}End{/highlight} to catch up",
  "QQ emoji (face) IDs are automatically converted to Unicode emoji",
  "Click on the {highlight}↓ new messages{/highlight} indicator to jump to latest",
  "MikuChat uses the Kitty Graphics Protocol with Unicode Placeholders for inline images",
  "Images are cached at {highlight}~/.cache/mikuchat/images/{/highlight} to avoid re-downloading",
  "The default theme is {highlight}miku{/highlight} — teal and pink inspired by Hatsune Miku",
  'Use {highlight}"theme": "system"{/highlight} to match your terminal\'s colors',
  "Create JSON theme files in {highlight}.mikuchat/themes/{/highlight} directory for custom themes",
  "Themes support dark/light variants for both modes",
  "MikuChat runs on {highlight}Bun{/highlight} with SolidJS and OpenTUI for terminal rendering",
  "The sidebar shows all your QQ conversations — click to open",
  "Reply quotes are rendered inline with the original message preview",
]
