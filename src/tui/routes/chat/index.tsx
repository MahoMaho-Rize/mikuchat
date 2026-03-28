// Chat page - mirrors OpenCode's session/index.tsx layout exactly
// Adapted for QQ messages with per-user colored bubbles
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onMount,
  Show,
  Switch,
  Match,
} from "solid-js";
import { useTheme, selectedForeground } from "@tui/context/theme";
import { useChatSync } from "@tui/context/chat-sync";
import { useQQ } from "@tui/context/qq";
import { useRoute, useRouteData } from "@tui/context/route";
import { ChatSidebar } from "./sidebar";
import { ChatPrompt, type ChatPromptRef } from "@tui/component/chat-prompt";
import { useTerminalDimensions, useKeyboard } from "@opentui/solid";
import { RGBA } from "@opentui/core";
import {
  SplitBorder,
  EmptyBorder,
  MikuPanelBorder,
} from "@tui/component/border";
import { Toast, useToast } from "@tui/ui/toast";
import { Locale } from "@/util/locale";
import type { QCMessage, OB11Segment } from "../../../qq";
import { QQImage } from "@tui/component/qq-image";
import { MikuBackground } from "@tui/component/miku-background";
import { Clipboard } from "@tui/util/clipboard";

// Stable user colors - rotate through theme colors per user_id
const USER_COLORS_KEYS = [
  "primary",
  "accent",
  "success",
  "warning",
  "secondary",
  "info",
  "error",
] as const;

export function ChatPage() {
  const { theme, syntax } = useTheme();
  const route = useRouteData("chat");
  const sync = useChatSync();
  const qq = useQQ();
  const dimensions = useTerminalDimensions();
  const nav = useRoute();
  const toast = useToast();

  const wide = createMemo(() => dimensions().width > 120);
  const session = createMemo(() => sync.getSession(route.sessionId));
  const messages = createMemo(() => sync.getMessages(route.sessionId));

  let scroll: any;
  let prompt: ChatPromptRef;

  const [sidebarVisible, setSidebarVisible] = createSignal(true);
  const [showScrollbar, setShowScrollbar] = createSignal(true);
  const [noMoreHistory, setNoMoreHistory] = createSignal(false);

  // Build userId -> nickname map from loaded messages (for resolving @mentions)
  const nicknameMap = createMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages()) {
      const name = msg.card || msg.nickname;
      if (name) map.set(String(msg.user_id), name);
    }
    return map;
  });

  onMount(() => {
    sync.setActiveSession(route.sessionId);
  });

  // Reset noMoreHistory when switching sessions
  createEffect(
    on(
      () => route.sessionId,
      () => setNoMoreHistory(false),
    ),
  );

  // Load more history when scrolled to top
  function tryLoadMore() {
    if (noMoreHistory() || sync.isLoading(route.sessionId)) return;
    if (!scroll || scroll.y > 3) return;
    const prevHeight = scroll.scrollHeight;
    const loaded = sync.loadMore(route.sessionId);
    if (!loaded) {
      setNoMoreHistory(true);
      return;
    }
    // Maintain scroll position after prepending older messages
    setTimeout(() => {
      if (!scroll) return;
      const delta = scroll.scrollHeight - prevHeight;
      if (delta > 0) scroll.scrollTo(delta);
    }, 50);
  }

  // Extract text content from a message for clipboard
  function messageText(msg: QCMessage): string {
    return msg.segments
      .map((seg: any) => {
        switch (seg.type) {
          case "text":
            return seg.data.text;
          case "at":
            return `@${seg.data.name || seg.data.qq}`;
          case "face":
            return `[emoji:${seg.data.id}]`;
          case "mface":
            return `[${seg.data.summary || "sticker"}]`;
          case "image":
            return "[图片]";
          case "record":
            return "[语音]";
          case "video":
            return "[视频]";
          case "file":
            return `[文件:${seg.data.name || seg.data.file}]`;
          case "forward":
            return "[合并转发]";
          case "json":
            return "[卡片消息]";
          case "markdown":
            return seg.data.content || "";
          default:
            return `[${seg.type}]`;
        }
      })
      .join("");
  }

  // Copy last message text
  function copyLastMessage() {
    const msgs = messages();
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    const text = messageText(last);
    if (!text) return;
    Clipboard.copy(text)
      .then(() =>
        toast.show({ variant: "info", message: "Copied last message" }),
      )
      .catch(() => toast.show({ variant: "error", message: "Copy failed" }));
  }

  // Scroll to bottom on new messages
  createEffect(
    on(
      () => messages().length,
      () => {
        setTimeout(() => {
          if (scroll) scroll.scrollTo(scroll.scrollHeight);
        }, 50);
      },
    ),
  );

  // Keybinds
  useKeyboard((evt) => {
    // Toggle sidebar
    if (evt.ctrl && evt.name === "b") {
      setSidebarVisible((v) => !v);
    }
    // Ctrl+Y: copy last message
    if (evt.ctrl && evt.name === "y") {
      copyLastMessage();
      evt.preventDefault();
    }
    // PageUp at top: load more history
    if (evt.name === "pageup") {
      tryLoadMore();
    }
    // Scroll keybinds
    if (evt.name === "pageup" && scroll) {
      scroll.scrollBy(-scroll.height / 2);
    }
    if (evt.name === "pagedown" && scroll) {
      scroll.scrollBy(scroll.height / 2);
    }
    // Home: jump to top
    if (evt.name === "home" && scroll) {
      tryLoadMore();
      scroll.scrollTo(0);
    }
    // End: jump to bottom
    if (evt.name === "end" && scroll) {
      scroll.scrollTo(scroll.scrollHeight);
    }
  });

  // Get a stable color for a user_id
  function userColor(userId: number): any {
    const idx = Math.abs(userId) % USER_COLORS_KEYS.length;
    return (theme as any)[USER_COLORS_KEYS[idx]];
  }

  async function sendMessage(text: string) {
    if (text === "/back" || text === "/home") {
      nav.navigate({ type: "home" });
      return;
    }
    const sessionId = route.sessionId;
    const parts = sessionId.split("_");
    const type = parts[0] as "group" | "private";
    const targetId = Number(parts.slice(1).join("_"));
    try {
      await qq.client.sendMsg(type, targetId, [
        { type: "text", data: { text } },
      ]);
      // Self message will arrive via WS (reportSelfMessage: true)
      // No need to insert locally — bridge handles it from the WS event
    } catch (e: any) {
      toast.show({
        variant: "error",
        message: `Send failed: ${e?.message || "unknown error"}`,
      });
    }
  }

  const sessionName = createMemo(() => session()?.name || route.sessionId);
  const sessionType = createMemo(() =>
    session()?.type === "group" ? "Group" : "Private",
  );

  return (
    <>
      <MikuBackground />
      <box flexDirection="row" flexGrow={1}>
        {/* Main content column */}
        <box
          flexGrow={1}
          paddingBottom={1}
          paddingTop={1}
          paddingLeft={2}
          paddingRight={2}
          gap={1}
        >
          {/* Header */}
          <box
            flexDirection="row"
            flexShrink={0}
            paddingLeft={1}
            paddingRight={1}
            border={["top", "left", "right", "bottom"]}
            borderColor={theme.borderSubtle}
            customBorderChars={MikuPanelBorder}
            backgroundColor={theme.background}
          >
            <Show when={!wide()}>
              <text
                fg={theme.primary}
                onMouseUp={() => nav.navigate({ type: "home" })}
              >
                {"← "}
              </text>
            </Show>
            <text fg={theme.text}>
              <b>{sessionName()}</b>
            </text>
            <text fg={theme.textMuted}> · {sessionType()}</text>
            <box flexGrow={1} />
            <Show when={session()?.type === "group"}>
              <text fg={theme.textMuted}>
                ctrl+b <span style={{ fg: theme.textMuted }}>sidebar</span>
              </text>
            </Show>
          </box>

          {/* Message scroll area - exact OpenCode pattern */}
          <scrollbox
            ref={(r: any) => (scroll = r)}
            viewportOptions={{
              paddingRight: showScrollbar() ? 1 : 0,
            }}
            verticalScrollbarOptions={{
              paddingLeft: 1,
              visible: showScrollbar(),
              trackOptions: {
                backgroundColor: theme.backgroundElement,
                foregroundColor: theme.border,
              },
            }}
            stickyScroll={true}
            stickyStart="bottom"
            flexGrow={1}
          >
            {/* Load more indicator */}
            <Show when={sync.isLoading(route.sessionId)}>
              <box
                flexShrink={0}
                alignSelf="center"
                paddingTop={1}
                paddingBottom={1}
              >
                <text fg={theme.textMuted}>Loading history...</text>
              </box>
            </Show>
            <Show when={noMoreHistory() && messages().length > 0}>
              <box
                flexShrink={0}
                alignSelf="center"
                paddingTop={1}
                paddingBottom={1}
              >
                <text fg={theme.textMuted}>
                  ─── Beginning of conversation ───
                </text>
              </box>
            </Show>
            <For each={messages()}>
              {(message, index) => {
                const prevMsg = createMemo(() => {
                  const i = index();
                  return i > 0 ? messages()[i - 1] : undefined;
                });
                // Collapse same-sender consecutive messages
                const sameSender = createMemo(() => {
                  const prev = prevMsg();
                  return (
                    prev &&
                    prev.user_id === message.user_id &&
                    message.time - prev.time < 120
                  ); // within 2 minutes
                });
                const isSelf = createMemo(() => message.user_id === qq.selfId);
                const color = createMemo(() => userColor(message.user_id));

                const timeStr = () => {
                  const d = new Date(message.time * 1000);
                  return d.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                };

                return (
                  <box
                    marginTop={sameSender() ? 0 : 1}
                    flexShrink={0}
                    alignSelf="flex-start"
                    maxWidth="85%"
                    border={["top", "left", "right", "bottom"]}
                    borderColor={sameSender() ? theme.borderSubtle : color()}
                    customBorderChars={MikuPanelBorder}
                    backgroundColor={theme.background}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    {/* Header: time + name + badges — compact single line */}
                    <Show when={!sameSender()}>
                      <box flexDirection="row" gap={1} flexShrink={0}>
                        <text fg={theme.textMuted}>{timeStr()}</text>
                        <text fg={color()}>
                          <b>{message.card || message.nickname}</b>
                        </text>
                        <Show
                          when={
                            message.role === "admin" || message.role === "owner"
                          }
                        >
                          <text>
                            <span
                              style={{
                                bg: theme.warning,
                                fg: theme.background,
                                bold: true,
                              }}
                            >
                              {" "}
                              {message.role}{" "}
                            </span>
                          </text>
                        </Show>
                        <Show when={isSelf()}>
                          <text>
                            <span
                              style={{
                                bg: theme.primary,
                                fg: theme.background,
                                bold: true,
                              }}
                            >
                              {" "}
                              me{" "}
                            </span>
                          </text>
                        </Show>
                      </box>
                    </Show>

                    {/* Message content */}
                    <For each={message.segments}>
                      {(seg) => (
                        <SegmentView
                          segment={seg}
                          syntax={syntax()}
                          nicknames={nicknameMap()}
                        />
                      )}
                    </For>
                  </box>
                );
              }}
            </For>
          </scrollbox>

          {/* Bottom prompt area - exact OpenCode pattern */}
          <box flexShrink={0}>
            <ChatPrompt
              ref={(r) => {
                prompt = r;
                setTimeout(() => r?.focus(), 100);
              }}
              placeholder={`Message ${sessionName()}...`}
              label={sessionType()}
              labelColor={
                session()?.type === "group" ? theme.accent : theme.primary
              }
              onSubmit={sendMessage}
              onKeyDown={(e: any) => {
                // Esc: go back to home
                if (e.name === "escape") {
                  nav.navigate({ type: "home" });
                  e.preventDefault();
                  return;
                }
              }}
              hint={<text fg={theme.textMuted}>{sessionName()}</text>}
              shortcuts={[
                { key: "esc", label: "back" },
                { key: "ctrl+y", label: "copy" },
                { key: "ctrl+b", label: "sidebar" },
                { key: "pgup", label: "history" },
              ]}
            />
          </box>
          <Toast />
        </box>

        {/* Sidebar - same pattern as OpenCode (conditional + overlay) */}
        <Show when={sidebarVisible()}>
          <Switch>
            <Match when={wide()}>
              <ChatSidebar />
            </Match>
            <Match when={!wide()}>
              <box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                alignItems="flex-end"
                backgroundColor={RGBA.fromInts(0, 0, 0, 70)}
                onMouseUp={() => setSidebarVisible(false)}
              >
                <ChatSidebar />
              </box>
            </Match>
          </Switch>
        </Show>
      </box>
    </>
  );
}

// === Segment Renderer ===

function SegmentView(props: {
  segment: OB11Segment;
  syntax: any;
  nicknames: Map<string, string>;
}) {
  const { theme } = useTheme();
  const seg = () => props.segment;

  return (
    <box flexShrink={0}>
      {(() => {
        switch (seg().type) {
          case "text":
            return <text fg={theme.text}>{seg().data.text}</text>;
          case "image":
            return (
              <QQImage
                url={seg().data.url}
                file={seg().data.file}
                summary={seg().data.summary}
              />
            );
          case "at": {
            // Resolve: prefer data.name > nickname map > fallback qq number
            const qq = String(seg().data.qq);
            const display =
              seg().data.name ||
              props.nicknames.get(qq) ||
              (qq === "all" ? "全体成员" : qq);
            return (
              <text>
                <span style={{ fg: theme.warning, bold: true }}>
                  @{display}
                </span>
              </text>
            );
          }
          case "reply":
            return (
              <box marginBottom={0} flexShrink={0}>
                <text fg={theme.textMuted}>
                  ↩{" "}
                  <span style={{ fg: theme.textMuted }}>Reply to message</span>
                </text>
              </box>
            );
          case "face":
            return <text fg={theme.accent}>[emoji:{seg().data.id}]</text>;
          case "mface":
            return (
              <text>
                <span style={{ fg: theme.accent }}>
                  [{seg().data.summary || "sticker"}]
                </span>
              </text>
            );
          case "record":
            return (
              <text>
                <span style={{ bg: theme.info, fg: theme.background }}>
                  {" "}
                  voice{" "}
                </span>
                <span
                  style={{ bg: theme.backgroundElement, fg: theme.textMuted }}
                >
                  {" "}
                  Voice Message{" "}
                </span>
              </text>
            );
          case "video":
            return (
              <text>
                <span style={{ bg: theme.info, fg: theme.background }}>
                  {" "}
                  video{" "}
                </span>
                <span
                  style={{ bg: theme.backgroundElement, fg: theme.textMuted }}
                >
                  {" "}
                  Video{" "}
                </span>
              </text>
            );
          case "file":
            return (
              <text>
                <span style={{ bg: theme.secondary, fg: theme.background }}>
                  {" "}
                  file{" "}
                </span>
                <span
                  style={{ bg: theme.backgroundElement, fg: theme.textMuted }}
                >
                  {" "}
                  {seg().data.name || seg().data.file}{" "}
                </span>
              </text>
            );
          case "forward":
            return (
              <text>
                <span style={{ bg: theme.info, fg: theme.background }}>
                  {" "}
                  fwd{" "}
                </span>
                <span
                  style={{ bg: theme.backgroundElement, fg: theme.textMuted }}
                >
                  {" "}
                  Merged Forward{" "}
                </span>
              </text>
            );
          case "json":
            return (
              <text>
                <span style={{ bg: theme.textMuted, fg: theme.background }}>
                  {" "}
                  card{" "}
                </span>
                <span
                  style={{ bg: theme.backgroundElement, fg: theme.textMuted }}
                >
                  {" "}
                  Card Message{" "}
                </span>
              </text>
            );
          case "markdown":
            return (
              <box paddingTop={0} flexShrink={0}>
                <code
                  filetype="markdown"
                  content={seg().data.content || ""}
                  fg={theme.text}
                  syntaxStyle={props.syntax}
                />
              </box>
            );
          default:
            return <text fg={theme.textMuted}>[{seg().type}]</text>;
        }
      })()}
    </box>
  );
}
