// Bridge: connects QQClient events to local DB storage
import { QQClient, type QQEventHandler } from "./client"
import { upsertSession, insertMessage } from "./db"
import type { OB11Message, OB11Segment } from "./types"

/** Extract plain text preview from message segments */
export function segmentsToPreview(segments: OB11Segment[], maxLen = 50): string {
  const parts: string[] = []
  for (const seg of segments) {
    switch (seg.type) {
      case "text":
        parts.push(seg.data.text)
        break
      case "image":
        parts.push("[图片]")
        break
      case "face":
        parts.push("[表情]")
        break
      case "mface":
        parts.push(`[${seg.data.summary || "表情"}]`)
        break
      case "at":
        parts.push(seg.data.qq === "all" ? "@全体成员" : `@${seg.data.name || seg.data.qq}`)
        break
      case "reply":
        parts.push("[回复]")
        break
      case "record":
        parts.push("[语音]")
        break
      case "video":
        parts.push("[视频]")
        break
      case "file":
        parts.push(`[文件]${seg.data.name || ""}`)
        break
      case "forward":
        parts.push("[合并转发]")
        break
      case "json":
        parts.push("[卡片消息]")
        break
      case "markdown":
        parts.push(seg.data.content?.slice(0, 30) || "[Markdown]")
        break
      case "poke":
        parts.push("[戳一戳]")
        break
      default:
        parts.push(`[${seg.type}]`)
    }
  }
  const text = parts.join("")
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text
}

function getSessionId(msg: OB11Message): string {
  if (msg.message_type === "group" && msg.group_id) {
    return `group_${msg.group_id}`
  }
  if (msg.post_type === "message_sent") {
    return `private_${msg.target_id || msg.user_id}`
  }
  return `private_${msg.user_id}`
}

function getSessionName(msg: OB11Message): string {
  if (msg.message_type === "group") {
    return msg.group_name || `群${msg.group_id}`
  }
  return msg.sender.card || msg.sender.nickname || `${msg.user_id}`
}

/**
 * Start bridging QQClient events to local DB.
 * Returns unsubscribe function.
 */
export function startBridge(client: QQClient): () => void {
  // Dedup: track recent message_ids to avoid double-insert from message + message_sent
  const recentIds = new Set<number>()

  const handler: QQEventHandler = (event) => {
    if (event.post_type !== "message" && event.post_type !== "message_sent") return

    const msg = event as OB11Message

    // Dedup: skip if we already processed this message_id
    if (recentIds.has(msg.message_id)) return
    recentIds.add(msg.message_id)
    // Prune old entries to prevent memory leak
    if (recentIds.size > 5000) {
      const iter = recentIds.values()
      for (let i = 0; i < 2500; i++) iter.next()
      // Actually just clear and let it refill — simpler
      recentIds.clear()
    }

    const sessionId = getSessionId(msg)
    const preview = segmentsToPreview(msg.message)
    const senderName = msg.sender.card || msg.sender.nickname
    const displayPreview =
      msg.message_type === "group" ? `${senderName}: ${preview}` : preview

    upsertSession({
      id: sessionId,
      type: msg.message_type,
      target_id: msg.message_type === "group" ? msg.group_id! : msg.user_id,
      name: getSessionName(msg),
      last_message: displayPreview,
      last_message_time: msg.time,
      unread_count: msg.post_type === "message_sent" ? 0 : undefined,
    })

    insertMessage({
      session_id: sessionId,
      message_id: msg.message_id,
      user_id: msg.user_id,
      nickname: msg.sender.nickname,
      card: msg.sender.card,
      role: msg.sender.role,
      segments: msg.message,
      raw_message: msg.raw_message,
      time: msg.time,
    })
  }

  return client.onEvent(handler)
}
