// ChatSyncProvider - replaces SyncProvider
// Manages session list + messages, synced from DB + live WS events
//
// Design: DB is read on startup and session switch only.
// Live WS messages update the store directly (incremental), never re-query.
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
import { segmentsToPreview } from "../../qq/bridge";
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

      // === DB reads: only on startup and explicit session switch ===

      function loadSessions() {
        try {
          const sessions = getSessions({ onlyActive: false, limit: 100 });
          setStore("sessions", reconcile(sessions));
        } catch (e) {
          console.error("Failed to load sessions:", e);
        }
      }

      function loadMessages(sessionId: string) {
        try {
          const msgs = getMessages(sessionId, { limit: 200 });
          setStore("messages", sessionId, reconcile(msgs));
        } catch (e) {
          console.error("Failed to load messages:", e);
        }
      }

      // Initial load from DB
      onMount(() => {
        loadSessions();
        setReady(true);
      });

      // === Live event handler: incremental store updates, no DB reads ===

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

        const preview = segmentsToPreview(msg.message);
        const sender = msg.sender.card || msg.sender.nickname;
        const displayPreview =
          msg.message_type === "group" ? `${sender}: ${preview}` : preview;
        const isSelf = msg.post_type === "message_sent";

        // --- Update session list in-place (no DB read) ---
        batch(() => {
          const idx = store.sessions.findIndex((s) => s.id === sessionId);
          if (idx >= 0) {
            // Existing session: update last_message + unread
            setStore("sessions", idx, {
              last_message: displayPreview,
              last_message_time: msg.time,
              unread_count: isSelf
                ? store.sessions[idx].unread_count
                : store.sessions[idx].id === store.activeSessionId
                  ? 0
                  : store.sessions[idx].unread_count + 1,
            });
          } else {
            // New session: insert at top
            const name =
              msg.message_type === "group"
                ? (msg as any).group_name || `Group ${msg.group_id}`
                : msg.sender.card || msg.sender.nickname || `${msg.user_id}`;
            setStore(
              "sessions",
              produce((draft: QCSession[]) => {
                draft.unshift({
                  id: sessionId,
                  type: msg.message_type,
                  target_id:
                    msg.message_type === "group" ? msg.group_id! : msg.user_id,
                  name,
                  avatar_url: null,
                  last_message: displayPreview,
                  last_message_time: msg.time,
                  unread_count: isSelf ? 0 : 1,
                  pinned: 0,
                });
              }),
            );
          }

          // --- Append message to loaded session (no DB read) ---
          if (store.messages[sessionId]) {
            setStore(
              "messages",
              sessionId,
              produce((draft: QCMessage[]) => {
                if (draft.some((m) => m.message_id === msg.message_id)) return;
                draft.push({
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
                });
              }),
            );
          }
        });
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
            // Load from DB only when switching to a session
            loadMessages(sessionId);
            try {
              markRead(sessionId);
            } catch {}
            // Update unread in-store directly instead of full reload
            const idx = store.sessions.findIndex((s) => s.id === sessionId);
            if (idx >= 0) {
              setStore("sessions", idx, "unread_count", 0);
            }
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
          } catch {
            return [];
          }
        },

        pin(sessionId: string, pinned: boolean) {
          try {
            pinSession(sessionId, pinned);
            // Update in-store
            const idx = store.sessions.findIndex((s) => s.id === sessionId);
            if (idx >= 0) {
              setStore("sessions", idx, "pinned", pinned ? 1 : 0);
            }
          } catch {}
        },

        // Full refresh — only called from home page interval, not per-message
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
              return false;
            }
            setStore(
              "messages",
              sessionId,
              produce((draft: QCMessage[]) => {
                const existing = new Set(draft.map((m) => m.message_id));
                const fresh = older.filter((m) => !existing.has(m.message_id));
                draft.unshift(...fresh);
              }),
            );
            setStore("loading", sessionId, false);
            return true;
          } catch {
            setStore("loading", sessionId, false);
            return false;
          }
        },
      };
    },
  });
