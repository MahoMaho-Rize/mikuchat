// QQ Image - downloads, caches, renders inline via <img> (Kitty Unicode Placeholder)
// Falls back to text badge if image fails to load
import { createSignal, onMount, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import fs from "fs"
import path from "path"
import os from "os"

const CACHE_DIR = path.join(os.homedir(), ".cache", "mikuchat", "images")

export interface QQImageProps {
  url?: string
  file?: string
  summary?: string
  maxCols?: number
  maxRows?: number
}

export function QQImage(props: QQImageProps) {
  const { theme } = useTheme()
  const [status, setStatus] = createSignal<"idle" | "loading" | "cached" | "error">("idle")
  const [localPath, setLocalPath] = createSignal<string | null>(null)

  const label = () => props.summary || props.file || "image"

  onMount(async () => {
    if (!props.url) return
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      const hash = Bun.hash(props.url).toString(16)
      const ext = props.url.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || "jpg"
      const cached = path.join(CACHE_DIR, `${hash}.${ext}`)

      if (fs.existsSync(cached)) {
        setLocalPath(cached)
        setStatus("cached")
        return
      }

      setStatus("loading")
      const resp = await fetch(props.url)
      if (!resp.ok) { setStatus("error"); return }
      const buf = Buffer.from(await resp.arrayBuffer())
      fs.writeFileSync(cached, buf)
      setLocalPath(cached)
      setStatus("cached")
    } catch {
      setStatus("error")
    }
  })

  return (
    <box flexShrink={0}>
      <Show
        when={status() === "cached" && localPath()}
        fallback={
          <text>
            <span style={{ bg: theme.accent, fg: theme.background, bold: true }}> img </span>
            <span style={{ bg: theme.backgroundElement, fg: theme.textMuted }}>
              {" "}{label()} {status() === "loading" ? "↓" : status() === "error" ? "✗" : "…"}{" "}
            </span>
          </text>
        }
      >
        <img
          src={localPath()!}
          maxCols={props.maxCols ?? 40}
          maxRows={props.maxRows ?? 10}
        />
      </Show>
    </box>
  )
}
