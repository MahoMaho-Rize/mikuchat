// OneBot 11 protocol types for NapCat

// === Message Segments ===
export type OB11Segment =
  | { type: "text"; data: { text: string } }
  | { type: "face"; data: { id: string } }
  | { type: "image"; data: { file: string; url?: string; summary?: string; sub_type?: number } }
  | { type: "record"; data: { file: string; url?: string } }
  | { type: "video"; data: { file: string; url?: string } }
  | { type: "at"; data: { qq: string | "all"; name?: string } }
  | { type: "reply"; data: { id: string } }
  | { type: "json"; data: { data: string } }
  | { type: "forward"; data: { id: string } }
  | { type: "file"; data: { file: string; url?: string; name?: string; file_size?: string } }
  | { type: "markdown"; data: { content: string } }
  | { type: "mface"; data: { emoji_package_id: string; emoji_id: string; key: string; summary: string } }
  | { type: "poke"; data: { type: string; id: string } }
  | { type: string; data: Record<string, any> }

// === Sender ===
export interface OB11Sender {
  user_id: number
  nickname: string
  card?: string
  role?: "owner" | "admin" | "member"
  sex?: string
  age?: number
  level?: string
  title?: string
}

// === Message Event ===
export interface OB11Message {
  time: number
  self_id: number
  post_type: "message" | "message_sent"
  message_type: "private" | "group"
  sub_type: string
  message_id: number
  message_seq?: number
  user_id: number
  group_id?: number
  group_name?: string
  sender: OB11Sender
  message: OB11Segment[]
  raw_message: string
  font: number
  target_id?: number
}

// === Meta Event ===
export interface OB11MetaEvent {
  time: number
  self_id: number
  post_type: "meta_event"
  meta_event_type: "lifecycle" | "heartbeat"
  sub_type?: string
  status?: { online: boolean; good: boolean }
  interval?: number
}

// === Notice Event ===
export interface OB11Notice {
  time: number
  self_id: number
  post_type: "notice"
  notice_type: string
  sub_type?: string
  group_id?: number
  user_id?: number
  operator_id?: number
  message_id?: number
  [key: string]: any
}

// === Request Event ===
export interface OB11Request {
  time: number
  self_id: number
  post_type: "request"
  request_type: "friend" | "group"
  user_id: number
  group_id?: number
  comment?: string
  flag: string
  sub_type?: string
}

// === Union ===
export type OB11Event = OB11Message | OB11MetaEvent | OB11Notice | OB11Request

// === API Response ===
export interface OB11Response<T = any> {
  status: "ok" | "failed"
  retcode: number
  data: T
  message?: string
  echo?: string
}

// === Local DB Types ===
export interface QCSession {
  /** "private_{user_id}" or "group_{group_id}" */
  id: string
  type: "private" | "group"
  target_id: number
  name: string
  avatar_url?: string
  last_message?: string
  last_message_time: number
  unread_count: number
  pinned: boolean
}

export interface QCMessage {
  id: number
  session_id: string
  message_id: number
  user_id: number
  nickname: string
  card?: string
  role?: string
  segments: OB11Segment[]
  raw_message: string
  time: number
}
