// QC-Dev entry point
import "./tui/component/image-register";
import {
  render,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/solid";
import { Switch, Match, ErrorBoundary, Show } from "solid-js";
import { RouteProvider, useRoute } from "./tui/context/route";
import { ThemeProvider, useTheme } from "./tui/context/theme";
import { KVProvider } from "./tui/context/kv";
import { ToastProvider } from "./tui/ui/toast";
import { ExitProvider, useExit } from "./tui/context/exit";
import { KeybindProvider } from "./tui/context/keybind";
import { DialogProvider, useDialog } from "./tui/ui/dialog";
import { QQProvider, useQQ } from "./tui/context/qq";
import { ChatSyncProvider, useChatSync } from "./tui/context/chat-sync";
import { TuiConfigProvider } from "./tui/context/tui-config";
import { QCHome } from "./pages/home";
import { ChatPage } from "./tui/routes/chat";
import { SessionSearchDialog } from "./pages/search";

export async function main() {
  return new Promise<void>(async (resolve) => {
    const onExit = async () => resolve();

    render(
      () => (
        <ErrorBoundary
          fallback={(error, reset) => (
            <ErrorView error={error} reset={reset} onExit={onExit} />
          )}
        >
          <ExitProvider onExit={onExit}>
            <KVProvider>
              <ToastProvider>
                <RouteProvider>
                  <TuiConfigProvider config={{}}>
                    <ThemeProvider mode="dark">
                      <KeybindProvider>
                        <QQProvider>
                          <ChatSyncProvider>
                            <DialogProvider>
                              <App />
                            </DialogProvider>
                          </ChatSyncProvider>
                        </QQProvider>
                      </KeybindProvider>
                    </ThemeProvider>
                  </TuiConfigProvider>
                </RouteProvider>
              </ToastProvider>
            </KVProvider>
          </ExitProvider>
        </ErrorBoundary>
      ),
      {
        targetFps: 60,
        exitOnCtrlC: false,
        useKittyKeyboard: {},
        autoFocus: false,
      },
    );
  });
}

const EXIT_LOGO = [
  " ███╗   ███╗ ██╗ ██╗  ██╗ ██╗   ██╗  ██████╗ ██╗  ██╗  █████╗  ████████╗",
  " ████╗ ████║ ██║ ██║ ██╔╝ ██║   ██║ ██╔════╝ ██║  ██║ ██╔══██╗ ╚══██╔══╝",
  " ██╔████╔██║ ██║ █████╔╝  ██║   ██║ ██║      ███████║ ███████║    ██║   ",
  " ██║╚██╔╝██║ ██║ ██╔═██╗  ██║   ██║ ██║      ██╔══██║ ██╔══██║    ██║   ",
  " ██║ ╚═╝ ██║ ██║ ██║  ██╗ ╚██████╔╝ ╚██████╗ ██║  ██║ ██║  ██║    ██║   ",
  " ╚═╝     ╚═╝ ╚═╝ ╚═╝  ╚═╝  ╚═════╝   ╚═════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚═╝   ",
];

const EXIT_GRADIENT = [
  "#39C5BB",
  "#3DD8D0",
  "#5CDFD7",
  "#B48EDB",
  "#E12885",
  "#C926A0",
];

function exitLogo(): string {
  const reset = "\x1b[0m";
  return EXIT_LOGO.map((line, i) => {
    const hex = EXIT_GRADIENT[i % EXIT_GRADIENT.length];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `  \x1b[38;2;${r};${g};${b}m${line}${reset}`;
  }).join("\n");
}

function App() {
  const route = useRoute();
  const { theme } = useTheme();
  const exit = useExit();
  const dialog = useDialog();
  const renderer = useRenderer();
  const dims = useTerminalDimensions();
  renderer.disableStdoutInterception();

  // Set exit message with logo
  exit.message.set(
    [exitLogo(), ``, `  \x1b[90mSee you next time, Master~\x1b[0m`, ``].join(
      "\n",
    ),
  );

  // Global keybinds
  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      exit();
    }
    // Ctrl+K: open session search from anywhere
    if (evt.ctrl && evt.name === "k") {
      evt.preventDefault();
      dialog.replace(() => <SessionSearchDialog />);
    }
  });

  return (
    <box
      width={dims().width}
      height={dims().height}
      backgroundColor={theme.background}
    >
      <Switch>
        <Match when={route.data.type === "home"}>
          <QCHome />
        </Match>
        <Match when={route.data.type === "chat"}>
          <ChatPage />
        </Match>
      </Switch>
    </box>
  );
}

function ErrorView(props: {
  error: Error;
  reset: () => void;
  onExit: () => void;
}) {
  return (
    <box flexGrow={1} paddingLeft={2} paddingTop={1}>
      <text>
        <b>A fatal error occurred!</b>
      </text>
      <text>{String(props.error)}</text>
      <text>{props.error.stack}</text>
      <box flexDirection="row" gap={2} paddingTop={1}>
        <text onMouseUp={() => props.reset()}>
          <b>[Reset]</b>
        </text>
        <text onMouseUp={() => props.onExit()}>
          <b>[Exit]</b>
        </text>
      </box>
    </box>
  );
}

await main();
