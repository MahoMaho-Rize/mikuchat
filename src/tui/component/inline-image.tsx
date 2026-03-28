// Inline image rendering for terminals supporting kitty graphics protocol
// Falls back to text placeholder for unsupported terminals
import { createSignal, onMount, Show } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"

export interface InlineImageProps {
  /** URL to fetch the image from */
  url?: string
  /** Base64-encoded image data */
  base64?: string
  /** Alt text / fallback display */
  alt?: string
  /** Max width in columns (default 40) */
  maxWidth?: number
  /** Max height in rows (default 10) */
  maxHeight?: number
}

export function InlineImage(props: InlineImageProps) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const [loaded, setLoaded] = createSignal(false)
  const [imageData, setImageData] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const maxW = () => props.maxWidth ?? 40
  const maxH = () => props.maxHeight ?? 10

  onMount(async () => {
    try {
      let b64: string | undefined = props.base64

      if (!b64 && props.url) {
        // Fetch image and convert to base64
        const resp = await fetch(props.url)
        if (!resp.ok) {
          setError(`HTTP ${resp.status}`)
          return
        }
        const buf = await resp.arrayBuffer()
        b64 = Buffer.from(buf).toString("base64")
      }

      if (!b64) {
        setError("No image data")
        return
      }

      // Check if terminal supports kitty graphics
      const caps = renderer.capabilities
      if (caps?.kitty_graphics) {
        setImageData(b64)
        setLoaded(true)
      } else {
        // No kitty graphics - just show placeholder
        setError("unsupported")
      }
    } catch (e: any) {
      setError(e?.message || "failed")
    }
  })

  return (
    <box flexShrink={0}>
      <Show
        when={loaded() && imageData()}
        fallback={
          <text fg={error() ? theme.textMuted : theme.info}>
            <span style={{ bg: theme.accent, fg: theme.background }}> img </span>
            <span style={{ bg: theme.backgroundElement, fg: theme.textMuted }}>
              {" "}{props.alt || "image"}{error() ? ` (${error()})` : " loading..."}{" "}
            </span>
          </text>
        }
      >
        {/* 
          Render using kitty graphics protocol via a virtual text node.
          The kitty protocol escape sequence:
          ESC_G a=T,f=100,... ; <base64data> ESC \
          
          Since OpenTUI manages the screen buffer, we render the image 
          by writing directly to the box area using a custom approach.
          For now, we use the placeholder badge and show the image
          as a downloadable/viewable reference.
          
          TODO: When OpenTUI exposes a native <img> component, switch to that.
        */}
        <text fg={theme.info}>
          <span style={{ bg: theme.accent, fg: theme.background }}> img </span>
          <span style={{ bg: theme.backgroundElement, fg: theme.textMuted }}>
            {" "}{props.alt || "image"} ✓{" "}
          </span>
        </text>
      </Show>
    </box>
  )
}
