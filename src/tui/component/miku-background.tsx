// MikuBackground — full-screen braille art background, dynamically scaled to terminal size
import { createMemo, For } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { scaleBraille } from "./braille-scale"

// Static import — text is inlined into the bundle by Bun.build
import ART_TEXT from "../../../assets/miku_braille.txt"
const ART_LINES: string[] = ART_TEXT ? ART_TEXT.split("\n") : []

const MIKU_TEAL = "#39C5BB"

export function MikuBackground() {
  const dims = useTerminalDimensions()

  const scaled = createMemo(() => {
    const w = dims().width
    const h = dims().height
    if (w <= 0 || h <= 0 || ART_LINES.length === 0) return []
    return scaleBraille(ART_LINES, w, h)
  })

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width={dims().width}
      height={dims().height}
      overflow="hidden"
    >
      <For each={scaled()}>
        {(line) => <text fg={MIKU_TEAL}>{line}</text>}
      </For>
    </box>
  )
}
