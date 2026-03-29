// QQProvider - replaces SDKProvider
// Manages QQClient + NapCatManager + Bridge
import { createSignal, onCleanup } from "solid-js";
import { createSimpleContext } from "./helper";
import { QQClient, NapCatManager, startBridge } from "../../qq";
import type { QQClientStatus, NapCatStatus, OB11Event } from "../../qq";

export const { use: useQQ, provider: QQProvider } = createSimpleContext({
  name: "QQ",
  init: () => {
    let client = new QQClient();
    const napcat = new NapCatManager();

    const [wsStatus, setWsStatus] =
      createSignal<QQClientStatus>("disconnected");
    const [napcatStatus, setNapCatStatus] =
      createSignal<NapCatStatus>("stopped");
    const [napcatInfo, setNapCatInfo] = createSignal("");
    const [logs, setLogs] = createSignal<string[]>([]);
    const [selfId, setSelfId] = createSignal(0);
    // Track whether we started NapCat ourselves (don't kill external instances)
    let weStartedNapcat = false;

    const eventListeners = new Set<(event: OB11Event) => void>();
    let bridgeUnsub: (() => void) | null = null;
    let statusUnsub: (() => void) | null = null;
    let eventUnsub: (() => void) | null = null;

    function attachClient(c: QQClient) {
      // Detach old
      statusUnsub?.();
      eventUnsub?.();
      bridgeUnsub?.();

      client = c;

      statusUnsub = client.onStatus((s) => {
        setWsStatus(s);
        if (s === "connected") {
          setSelfId(client.selfId);
          if (!bridgeUnsub) {
            bridgeUnsub = startBridge(client);
          }
          if (!client.selfId) {
            client
              .getLoginInfo()
              .then((info) => {
                setSelfId(info.user_id);
              })
              .catch(() => {});
          }
        }
      });

      eventUnsub = client.onEvent((event) => {
        if (event.self_id && !selfId()) setSelfId(event.self_id);
        for (const handler of eventListeners) {
          try {
            handler(event);
          } catch {}
        }
      });
    }

    // Attach default client
    attachClient(client);

    const unsubNapcat = napcat.onStatus((s, info) => {
      setNapCatStatus(s);
      if (info) setNapCatInfo(info);
      if (
        s === "running" &&
        wsStatus() !== "connected" &&
        wsStatus() !== "connecting"
      ) {
        setTimeout(() => client.connect(), 1000);
      }
    });

    const unsubLog = napcat.onLog((line) => {
      setLogs((prev) => [...prev.slice(-200), line]);
    });

    onCleanup(() => {
      statusUnsub?.();
      eventUnsub?.();
      unsubNapcat();
      unsubLog();
      bridgeUnsub?.();
      client.disconnect();
      // Only kill NapCat if WE started it
      if (weStartedNapcat) {
        napcat.stop();
      }
    });

    return {
      get client() {
        return client;
      },
      napcat,
      get wsStatus() {
        return wsStatus();
      },
      get napcatStatus() {
        return napcatStatus();
      },
      get napcatInfo() {
        return napcatInfo();
      },
      get selfId() {
        return selfId();
      },
      get logs() {
        return logs();
      },
      onEvent(handler: (event: OB11Event) => void) {
        eventListeners.add(handler);
        return () => eventListeners.delete(handler);
      },
      /** Start NapCat process (we own it, will kill on exit) */
      async start(account?: string) {
        weStartedNapcat = true;
        await napcat.start();
      },
      /** Connect to an existing NapCat instance (won't kill on exit) */
      connect(url?: string) {
        const target = url || "ws://127.0.0.1:3001/";
        // If url changed, create a new client
        if (target !== (client as any).url) {
          const newClient = new QQClient(target);
          attachClient(newClient);
        }
        client.connect();
      },
      /** Disconnect WS only (doesn't kill NapCat) */
      disconnect() {
        client.disconnect();
      },
      /** Stop NapCat process (only if we started it) */
      stop() {
        client.disconnect();
        if (weStartedNapcat) {
          napcat.stop();
          weStartedNapcat = false;
        }
      },
    };
  },
});
