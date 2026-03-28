// Chat Prompt - adapted from OpenCode's Prompt component
// Full textarea interaction with customizable shortcut hints
import { BoxRenderable, TextareaRenderable, MouseEvent, PasteEvent, decodePasteBytes } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useKeybind } from "@tui/context/keybind"
import { useExit } from "@tui/context/exit"
import { useRenderer } from "@opentui/solid"
import { useTextareaKeybindings } from "./textarea-keybindings"
import { EmptyBorder, MikuPanelBorder } from "./border"

export type ShortcutHint = {
  key: string
  label: string
}

export type ChatPromptProps = {
  visible?: boolean
  disabled?: boolean
  placeholder?: string
  label?: string
  labelColor?: any
  onSubmit?: (text: string) => void
  onKeyDown?: (e: any) => void
  ref?: (ref: ChatPromptRef) => void
  hint?: JSX.Element
  shortcuts?: ShortcutHint[]
  rightShortcuts?: ShortcutHint[]
}

export type ChatPromptRef = {
  focused: boolean
  text: string
  focus(): void
  blur(): void
  clear(): void
  submit(): void
}

export function ChatPrompt(props: ChatPromptProps) {
  let input: TextareaRenderable
  let anchor: BoxRenderable

  const keybind = useKeybind()
  const { theme, syntax } = useTheme()
  const exit = useExit()
  const renderer = useRenderer()
  const textareaKeybindings = useTextareaKeybindings()

  const [text, setText] = createSignal("")

  const ref: ChatPromptRef = {
    get focused() {
      return input?.focused ?? false
    },
    get text() {
      return text()
    },
    focus() {
      input?.focus()
    },
    blur() {
      input?.blur()
    },
    clear() {
      input?.clear()
      setText("")
    },
    submit() {
      submit()
    },
  }

  createEffect(() => {
    if (props.visible !== false) input?.focus()
    if (props.visible === false) input?.blur()
  })

  createEffect(() => {
    if (props.disabled) input.cursorColor = theme.backgroundElement
    if (!props.disabled) input.cursorColor = theme.text
  })

  function submit() {
    if (props.disabled) return
    const value = text().trim()
    if (!value) return

    if (value === "exit" || value === "quit" || value === ":q") {
      exit()
      return
    }

    props.onSubmit?.(value)
    input.clear()
    setText("")
  }

  const highlight = createMemo(() => {
    return props.labelColor ?? theme.primary
  })

  return (
    <>
      <box ref={(r) => (anchor = r)} visible={props.visible !== false}>
        <box
          border={["top", "left", "right", "bottom"]}
          borderColor={highlight()}
          customBorderChars={{
            ...EmptyBorder,
            topLeft: "╭",
            topRight: "╮",
            bottomLeft: "╰",
            bottomRight: "╯",
            horizontal: "─",
            vertical: "│",
          }}
        >
          <box
            paddingLeft={2}
            paddingRight={2}
            paddingTop={0}
            flexShrink={0}
            backgroundColor={theme.backgroundElement}
            flexGrow={1}
          >
            <textarea
              placeholder={props.placeholder}
              textColor={keybind.leader ? theme.textMuted : theme.text}
              focusedTextColor={keybind.leader ? theme.textMuted : theme.text}
              minHeight={1}
              maxHeight={6}
              onContentChange={() => {
                setText(input.plainText)
              }}
              keyBindings={textareaKeybindings()}
              onKeyDown={async (e) => {
                if (props.disabled) {
                  e.preventDefault()
                  return
                }
                // Forward to parent handler first
                props.onKeyDown?.(e)
                if (e.defaultPrevented) return

                // Ctrl+U: clear
                if (keybind.match("input_clear", e) && text() !== "") {
                  input.clear()
                  setText("")
                  e.preventDefault()
                  return
                }
                // Exit on Ctrl+D when empty
                if (keybind.match("app_exit", e) && text() === "") {
                  await exit()
                  e.preventDefault()
                  return
                }
              }}
              onSubmit={submit}
              onPaste={async (event: PasteEvent) => {
                if (props.disabled) {
                  event.preventDefault()
                  return
                }
                // Let textarea handle the paste natively.
                // Only do layout fixup afterwards (same as OpenCode).
                setTimeout(() => {
                  if (!input || input.isDestroyed) return
                  input.getLayoutNode().markDirty()
                  renderer.requestRender()
                }, 0)
              }}
              ref={(r: TextareaRenderable) => {
                input = r
                props.ref?.(ref)
                setTimeout(() => {
                  if (!input || input.isDestroyed) return
                  input.cursorColor = theme.text
                }, 0)
              }}
              onMouseDown={(r: MouseEvent) => r.target?.focus()}
              focusedBackgroundColor={theme.backgroundElement}
              cursorColor={theme.text}
              syntaxStyle={syntax()}
            />
            {/* Label bar under textarea */}
            <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1}>
              <Show when={props.label}>
                <text fg={highlight()}>
                  {props.label}{" "}
                </text>
              </Show>
              <Show when={props.hint}>
                {props.hint}
              </Show>
            </box>
          </box>
        </box>
        {/* Shortcut hints row — each hint in its own pill */}
        <box flexDirection="row" justifyContent="space-between" flexShrink={0} paddingTop={0} gap={1}>
          <box flexDirection="row" gap={1}>
            <Show when={props.shortcuts}>
              <For each={props.shortcuts}>
                {(s) => (
                  <box
                    border={["top", "left", "right", "bottom"]}
                    borderColor={theme.borderSubtle}
                    customBorderChars={MikuPanelBorder}
                    backgroundColor={theme.background}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text fg={theme.text}>
                      {s.key} <span style={{ fg: theme.textMuted }}>{s.label}</span>
                    </text>
                  </box>
                )}
              </For>
            </Show>
          </box>
          <box flexDirection="row" gap={1}>
            <For each={props.rightShortcuts ?? [{ key: "enter", label: "send" }, { key: "meta+enter", label: "newline" }]}>
              {(s) => (
                <box
                  border={["top", "left", "right", "bottom"]}
                  borderColor={theme.borderSubtle}
                  customBorderChars={MikuPanelBorder}
                  backgroundColor={theme.background}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text fg={theme.text}>
                    {s.key} <span style={{ fg: theme.textMuted }}>{s.label}</span>
                  </text>
                </box>
              )}
            </For>
          </box>
        </box>
      </box>
    </>
  )
}
