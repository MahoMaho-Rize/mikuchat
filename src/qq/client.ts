// NapCat WebSocket client - connects to OneBot 11 WS endpoint
import type { OB11Event, OB11Message, OB11Response, OB11Segment } from "./types"

export type QQClientStatus = "disconnected" | "connecting" | "connected" | "error"

export type QQEventHandler = (event: OB11Event) => void

interface PendingRequest {
  resolve: (data: any) => void
  reject: (error: Error) => void
  timer: Timer
}

export class QQClient {
  private ws: WebSocket | null = null
  readonly url: string
  private token: string
  private handlers: Set<QQEventHandler> = new Set()
  private statusHandlers: Set<(status: QQClientStatus) => void> = new Set()
  private pending: Map<string, PendingRequest> = new Map()
  private echoCounter = 0
  private reconnectTimer: Timer | null = null
  private _status: QQClientStatus = "disconnected"
  private _selfId: number = 0
  private shouldReconnect = true

  constructor(url = "ws://127.0.0.1:3001/", token = "") {
    this.url = url
    this.token = token
  }

  get status() {
    return this._status
  }

  get selfId() {
    return this._selfId
  }

  private setStatus(s: QQClientStatus) {
    this._status = s
    for (const h of this.statusHandlers) h(s)
  }

  onEvent(handler: QQEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onStatus(handler: (status: QQClientStatus) => void): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  connect(): void {
    if (this.ws) return
    this.shouldReconnect = true
    this.setStatus("connecting")

    const wsUrl = this.token ? `${this.url}?access_token=${this.token}` : this.url
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.setStatus("connected")
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    }

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))

        // API response (has echo field)
        if (data.echo !== undefined && data.retcode !== undefined) {
          const req = this.pending.get(String(data.echo))
          if (req) {
            clearTimeout(req.timer)
            this.pending.delete(String(data.echo))
            if (data.retcode === 0) {
              req.resolve(data.data)
            } else {
              req.reject(new Error(data.message || `API error ${data.retcode}`))
            }
          }
          return
        }

        // Event
        const event = data as OB11Event
        if (event.self_id) this._selfId = event.self_id
        for (const h of this.handlers) {
          try {
            h(event)
          } catch {}
        }
      } catch {}
    }

    this.ws.onerror = () => {
      this.setStatus("error")
    }

    this.ws.onclose = () => {
      this.ws = null
      this.setStatus("disconnected")
      // Reject all pending
      for (const [key, req] of this.pending) {
        clearTimeout(req.timer)
        req.reject(new Error("connection closed"))
      }
      this.pending.clear()
      // Auto reconnect
      if (this.shouldReconnect && !this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connect()
        }, 3000)
      }
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.setStatus("disconnected")
  }

  // Call OneBot 11 API
  async callApi<T = any>(action: string, params: Record<string, any> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected")
    }
    const echo = String(++this.echoCounter)
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo)
        reject(new Error(`API timeout: ${action}`))
      }, 15000)
      this.pending.set(echo, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ action, params, echo }))
    })
  }

  // Convenience methods
  async sendGroupMsg(groupId: number, message: OB11Segment[]): Promise<{ message_id: number }> {
    return this.callApi("send_group_msg", { group_id: groupId, message })
  }

  async sendPrivateMsg(userId: number, message: OB11Segment[]): Promise<{ message_id: number }> {
    return this.callApi("send_private_msg", { user_id: userId, message })
  }

  async sendMsg(
    type: "private" | "group",
    targetId: number,
    message: OB11Segment[],
  ): Promise<{ message_id: number }> {
    if (type === "group") return this.sendGroupMsg(targetId, message)
    return this.sendPrivateMsg(targetId, message)
  }

  async getLoginInfo(): Promise<{ user_id: number; nickname: string }> {
    return this.callApi("get_login_info")
  }

  async getFriendList(): Promise<Array<{ user_id: number; nickname: string; remark: string }>> {
    return this.callApi("get_friend_list")
  }

  async getGroupList(): Promise<Array<{ group_id: number; group_name: string; member_count: number }>> {
    return this.callApi("get_group_list")
  }

  async getGroupMemberInfo(groupId: number, userId: number): Promise<any> {
    return this.callApi("get_group_member_info", { group_id: groupId, user_id: userId })
  }

  async getMsg(messageId: number): Promise<OB11Message> {
    return this.callApi("get_msg", { message_id: messageId })
  }
}
