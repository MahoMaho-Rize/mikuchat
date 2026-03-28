// Home page - Logo + ChatPrompt + NapCat status + session list
import {
  createMemo,
  createSignal,
  createEffect,
  For,
  onMount,
  Show,
} from "solid-js";
import { useTheme } from "@tui/context/theme";
import { useQQ } from "@tui/context/qq";
import { useRoute } from "@tui/context/route";
import { useExit } from "@tui/context/exit";
import { useChatSync } from "@tui/context/chat-sync";
import { Toast, useToast } from "@tui/ui/toast";
import { ChatPrompt, type ChatPromptRef } from "@tui/component/chat-prompt";
import { useRenderer } from "@opentui/solid";
import { MikuBackground } from "@tui/component/miku-background";
import { MikuPanelBorder } from "@tui/component/border";

const LOGO_LINES = [
  " ███╗   ███╗ ██╗ ██╗  ██╗ ██╗   ██╗  ██████╗ ██╗  ██╗  █████╗  ████████╗",
  " ████╗ ████║ ██║ ██║ ██╔╝ ██║   ██║ ██╔════╝ ██║  ██║ ██╔══██╗ ╚══██╔══╝",
  " ██╔████╔██║ ██║ █████╔╝  ██║   ██║ ██║      ███████║ ███████║    ██║   ",
  " ██║╚██╔╝██║ ██║ ██╔═██╗  ██║   ██║ ██║      ██╔══██║ ██╔══██║    ██║   ",
  " ██║ ╚═╝ ██║ ██║ ██║  ██╗ ╚██████╔╝ ╚██████╗ ██║  ██║ ██║  ██║    ██║   ",
  " ╚═╝     ╚═╝ ╚═╝ ╚═╝  ╚═╝  ╚═════╝   ╚═════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚═╝   ",
];

// Miku gradient: teal → cyan → pink → magenta → purple (top to bottom)
const LOGO_GRADIENT = [
  "#39C5BB", // Miku teal
  "#3DD8D0", // bright cyan
  "#5CDFD7", // light cyan
  "#B48EDB", // lavender
  "#E12885", // Miku pink
  "#C926A0", // magenta-pink
];

const COMMANDS = [
  { cmd: "/start", desc: "Start NapCat and connect to QQ" },
  { cmd: "/connect", desc: "Connect to running NapCat (ws://127.0.0.1:3001)" },
  { cmd: "/disconnect", desc: "Disconnect WS (keep NapCat running)" },
  { cmd: "/stop", desc: "Stop NapCat (only if started by MikuChat)" },
  { cmd: "/status", desc: "Show connection status" },
  { cmd: "exit", desc: "Quit MikuChat" },
];

export function QCHome() {
  const { theme } = useTheme();
  const qq = useQQ();
  const route = useRoute();
  const sync = useChatSync();
  const exit = useExit();
  const [cmdLog, setCmdLog] = createSignal<string[]>([]);

  let prompt: ChatPromptRef;

  const connected = createMemo(() => qq.wsStatus === "connected");

  // Refresh sessions while connected
  createEffect(() => {
    if (connected()) {
      const interval = setInterval(() => sync.refresh(), 2000);
      return () => clearInterval(interval);
    }
  });

  const sessions = createMemo(() => sync.sessions);

  const statusColor = createMemo(() => {
    switch (qq.wsStatus) {
      case "connected":
        return theme.success;
      case "connecting":
        return theme.warning;
      case "error":
        return theme.error;
      default:
        return theme.textMuted;
    }
  });

  const statusText = createMemo(() => {
    if (qq.wsStatus === "connected") return `Connected (QQ: ${qq.selfId})`;
    if (qq.napcatStatus === "wait_login") return `Waiting for QR scan...`;
    if (qq.napcatStatus === "starting") return `Starting NapCat...`;
    if (qq.wsStatus === "connecting") return `Connecting...`;
    return `Disconnected`;
  });

  async function handleSubmit(text: string) {
    if (text === "/start") {
      setCmdLog((p) => [...p, "> Starting NapCat..."]);
      qq.napcat.onLog((line) => {
        setCmdLog((p) => [...p.slice(-30), line]);
      });
      await qq.start();
      return;
    }
    if (text === "/connect") {
      setCmdLog((p) => [...p, "> Connecting to ws://127.0.0.1:3001..."]);
      qq.connect();
      return;
    }
    if (text === "/disconnect") {
      qq.disconnect();
      setCmdLog((p) => [...p, "> Disconnected from NapCat"]);
      return;
    }
    if (text === "/stop") {
      qq.stop();
      setCmdLog((p) => [...p, "> NapCat stopped"]);
      return;
    }
    if (text === "/status") {
      setCmdLog((p) => [
        ...p,
        `> WS: ${qq.wsStatus}`,
        `> NapCat: ${qq.napcatStatus}`,
        `> Self ID: ${qq.selfId || "N/A"}`,
        `> Sessions: ${sync.sessions.length}`,
      ]);
      return;
    }
    // Search sessions
    const results = sync.search(text);
    if (results.length > 0) {
      sync.setActiveSession(results[0].id);
      route.navigate({ type: "chat", sessionId: results[0].id });
      return;
    }
    setCmdLog((p) => [...p, `Unknown command: ${text}`]);
  }

  return (
    <>
      <MikuBackground />

      <box
        flexGrow={1}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        gap={1}
      >
        {/* Disconnected view */}
        <Show when={!connected()}>
          <box flexGrow={1} alignItems="center" gap={1}>
            <Show when={cmdLog().length === 0}>
              <box flexGrow={1} minHeight={0} />
            </Show>
            {/* LOGO - no background, floats directly on miku art */}
            <box flexShrink={0}>
              <For each={LOGO_LINES}>
                {(line, i) => (
                  <text fg={LOGO_GRADIENT[i()] ?? LOGO_GRADIENT[0]}>
                    {line}
                  </text>
                )}
              </For>
            </box>
            {/* Prompt input */}
            <box width="100%" maxWidth={75} flexShrink={0} zIndex={1000}>
              <ChatPrompt
                ref={(r) => {
                  prompt = r;
                }}
                placeholder={`Type /start or /connect to begin...`}
                label="MikuChat"
                labelColor={theme.primary}
                onSubmit={handleSubmit}
                shortcuts={[{ key: "ctrl+k", label: "search" }]}
                rightShortcuts={[{ key: "ctrl+c", label: "exit" }]}
              />
            </box>
            {/* Commands list */}
            <box
              flexShrink={0}
              paddingLeft={1}
              paddingRight={1}
              border={["top", "left", "right", "bottom"]}
              borderColor={theme.borderSubtle}
              customBorderChars={MikuPanelBorder}
              backgroundColor={theme.background}
            >
              <For each={COMMANDS}>
                {(c) => (
                  <box flexDirection="row" gap={2}>
                    <text fg={theme.accent}>{c.cmd.padEnd(12)}</text>
                    <text fg={theme.textMuted}>{c.desc}</text>
                  </box>
                )}
              </For>
            </box>
            {/* Log output */}
            <Show when={cmdLog().length > 0}>
              <box
                width="100%"
                maxWidth={75}
                flexGrow={1}
                paddingLeft={1}
                paddingRight={1}
                border={["top", "left", "right", "bottom"]}
                borderColor={theme.borderSubtle}
                customBorderChars={MikuPanelBorder}
                backgroundColor={theme.background}
              >
                <scrollbox
                  flexGrow={1}
                  stickyScroll={true}
                  stickyStart="bottom"
                >
                  <For each={cmdLog()}>
                    {(line) => <text fg={theme.textMuted}>{line}</text>}
                  </For>
                </scrollbox>
              </box>
            </Show>
            <Show when={cmdLog().length === 0}>
              <box flexGrow={1} minHeight={0} />
            </Show>
          </box>
        </Show>

        {/* Connected view: session list */}
        <Show when={connected()}>
          <box flexGrow={1} flexDirection="column" gap={1}>
            {/* Prompt input — header info merged into label area */}
            <box flexShrink={0} zIndex={1000}>
              <ChatPrompt
                ref={(r) => {
                  prompt = r;
                  setTimeout(() => r?.focus(), 50);
                }}
                placeholder="Search conversations or type a command..."
                label={`MikuChat ● ${qq.selfId} · ${sessions().length} chats`}
                labelColor={theme.success}
                onSubmit={handleSubmit}
                shortcuts={[{ key: "ctrl+k", label: "search" }]}
                rightShortcuts={[{ key: "/disconnect", label: "disconnect" }]}
              />
            </box>

            {/* Session list - each session gets its own bordered row */}
            <scrollbox flexGrow={1}>
              <For
                each={sessions()}
                fallback={
                  <box
                    paddingLeft={1}
                    paddingRight={1}
                    alignItems="center"
                    border={["top", "left", "right", "bottom"]}
                    borderColor={theme.borderSubtle}
                    customBorderChars={MikuPanelBorder}
                    backgroundColor={theme.background}
                  >
                    <text fg={theme.textMuted}>Waiting for messages...</text>
                  </box>
                }
              >
                {(session) => {
                  const hasUnread = () => session.unread_count > 0;
                  const icon = () => (session.type === "group" ? "G" : "P");
                  const timeStr = () =>
                    session.last_message_time
                      ? new Date(
                          session.last_message_time * 1000,
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";
                  return (
                    <box
                      alignSelf="flex-start"
                      paddingLeft={1}
                      paddingRight={1}
                      marginBottom={1}
                      border={["top", "left", "right", "bottom"]}
                      borderColor={
                        hasUnread() ? theme.primary : theme.borderSubtle
                      }
                      customBorderChars={MikuPanelBorder}
                      backgroundColor={theme.background}
                      onMouseUp={() => {
                        sync.setActiveSession(session.id);
                        route.navigate({ type: "chat", sessionId: session.id });
                      }}
                    >
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>{timeStr()}</text>
                        <text
                          fg={
                            session.type === "group"
                              ? theme.accent
                              : theme.primary
                          }
                        >
                          {icon()}
                        </text>
                        <text fg={hasUnread() ? theme.text : theme.textMuted}>
                          {session.name.length > 30
                            ? session.name.slice(0, 29) + "…"
                            : session.name}
                        </text>
                        <Show when={hasUnread()}>
                          <text fg={theme.error}>
                            {" "}
                            {session.unread_count > 99
                              ? "99+"
                              : session.unread_count}
                          </text>
                        </Show>
                      </box>
                      <Show when={session.last_message}>
                        <text fg={theme.textMuted}>
                          {" "}
                          {(session.last_message || "").length > 50
                            ? (session.last_message || "").slice(0, 49) + "…"
                            : session.last_message}
                        </text>
                      </Show>
                    </box>
                  );
                }}
              </For>
            </scrollbox>

            {/* Footer */}
            <box
              flexShrink={0}
              flexDirection="row"
              gap={2}
              paddingLeft={1}
              paddingRight={1}
              border={["top", "left", "right", "bottom"]}
              borderColor={theme.borderSubtle}
              customBorderChars={MikuPanelBorder}
              backgroundColor={theme.background}
            >
              <text fg={theme.textMuted}>MikuChat v0.1.0</text>
              <box flexGrow={1} />
              <text fg={statusColor()}>● {qq.wsStatus}</text>
            </box>
          </box>
        </Show>
      </box>
      <Toast />
    </>
  );
}
