import z from "zod"

export type SessionID = string & { __brand: "SessionID" }
export const SessionID = {
  zod: z.string(),
} as any

export type MessageID = string & { __brand: "MessageID" }
export const MessageID = {
  zod: z.string(),
} as any

export type PartID = string & { __brand: "PartID" }
export const PartID = {
  zod: z.string(),
} as any
