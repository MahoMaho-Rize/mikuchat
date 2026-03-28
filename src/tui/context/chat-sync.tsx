// ChatSyncProvider - replaces SyncProvider
// Manages session list + messages, synced from DB + live WS events
import { createSignal, onMount, onCleanup, batch } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { createSimpleContext } from "./helper";
import { useQQ } from "./qq";
import {
  getSessions,
  getMessages,
  markRead,
  pinSession,
  searchSessions,
} from "../../qq";
import type { QCSession, QCMessage, OB11Message } from "../../qq";

export const { use: useChatSync, provider: ChatSyncProvider } =
  createSimpleContext({
    name: "ChatSync",
    init: () => {
      const qq = useQQ();

      const [store, setStore] = createStore<{
        sessions: QCSession[];
        messages: Record<string, QCMessage[]>;
        activeSessionId: string | null;
        loading: Record<string, boolean>;
      }>({
        sessions: [],
        messages: {},
        activeSessionId: null,
        loading: {},
      });

      const [ready, setReady] = createSignal(false);

      // Load sessions from DB
      function loadSessions() {
        try {
          const sessions = getSessions({ onlyActive: false, limit: 100 });
          setStore("sessions", reconcile(sessions));
        } catch (e) {
          console.error("Failed to load sessions:", e);
        }
      }

      // Load messages for a session
      function loadMessages(sessionId: string) {
        try {
          const msgs = getMessages(sessionId, { limit: 200 });
          setStore("messages", sessionId, reconcile(msgs));
        } catch (e) {
          console.error("Failed to load messages:", e);
        }
      }

      // Initial load
      onMount(() => {
        loadSessions();
        setReady(true);
      });

      // Listen for live events to update store in realtime
      const unsub = qq.onEvent((event) => {
        if (event.post_type !== "message" && event.post_type !== "message_sent")
          return;
        const msg = event as OB11Message;

        const sessionId =
          msg.message_type === "group" && msg.group_id
            ? `group_${msg.group_id}`
            : msg.post_type === "message_sent"
              ? `private_${msg.target_id || msg.user_id}`
              : `private_${msg.user_id}`;

        // Reload sessions to pick up DB changes from bridge
        loadSessions();

        // If we have this session's messages loaded, append the new one
        if (store.messages[sessionId]) {
          const newMsg: QCMessage = {
            id: 0,
            session_id: sessionId,
            message_id: msg.message_id,
            user_id: msg.user_id,
            nickname: msg.sender.nickname,
            card: msg.sender.card,
            role: msg.sender.role,
            segments: msg.message,
            raw_message: msg.raw_message,
            time: msg.time,
          };
          setStore(
            "messages",
            sessionId,
            produce((draft: any) => {
              // Avoid duplicates
              if (
                !draft.some((m: QCMessage) => m.message_id === msg.message_id)
              ) {
                draft.push(newMsg);
              }
            }),
          );
        }
      });

      onCleanup(unsub);

      return {
        get ready() {
          return ready();
        },
        get sessions() {
          return store.sessions;
        },
        get activeSessionId() {
          return store.activeSessionId;
        },

        setActiveSession(sessionId: string | null) {
          setStore("activeSessionId", sessionId);
          if (sessionId) {
            // Always reload messages from DB to pick up any new history
            loadMessages(sessionId);
            // Mark as read
            try {
              markRead(sessionId);
            } catch (e) {
              console.error("Failed to mark read:", e);
            }
            loadSessions(); // refresh unread counts
          }
        },

        getMessages(sessionId: string): QCMessage[] {
          return store.messages[sessionId] ?? [];
        },

        getSession(sessionId: string): QCSession | undefined {
          return store.sessions.find((s) => s.id === sessionId);
        },

        search(query: string): QCSession[] {
          try {
            return searchSessions(query);
          } catch (e) {
            console.error("Failed to search sessions:", e);
            return [];
          }
        },

        pin(sessionId: string, pinned: boolean) {
          try {
            pinSession(sessionId, pinned);
            loadSessions();
          } catch (e) {
            console.error("Failed to pin session:", e);
          }
        },

        refresh() {
          loadSessions();
        },

        isLoading(sessionId: string): boolean {
          return store.loading[sessionId] ?? false;
        },

        loadMore(sessionId: string): boolean {
          if (store.loading[sessionId]) return false;
          const msgs = store.messages[sessionId];
          if (!msgs || msgs.length === 0) return false;
          setStore("loading", sessionId, true);
          try {
            const oldest = msgs[0];
            const older = getMessages(sessionId, {
              before: oldest.time,
              beforeId: oldest.id,
              limit: 100,
            });
            if (older.length === 0) {
              setStore("loading", sessionId, false);
              return false; // no more history
            }
            setStore(
              "messages",
              sessionId,
              produce((draft: any) => {
                // Deduplicate by message_id before prepending
                const existing = new Set(
                  draft.map((m: QCMessage) => m.message_id),
                );
                const fresh = older.filter(
                  (m: QCMessage) => !existing.has(m.message_id),
                );
                draft.unshift(...fresh);
              }),
            );
            setStore("loading", sessionId, false);
            return true;
          } catch (e) {
            console.error("Failed to load more messages:", e);
            setStore("loading", sessionId, false);
            return false;
          }
        },
      };
    },
  });
