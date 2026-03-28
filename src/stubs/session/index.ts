export const Session = {
  create: async () => ({} as any),
  get: async (_id: string) => ({} as any),
  list: async () => [] as any[],
  chat: async () => ({} as any),
  isDefaultTitle: (title: string) => !title || title === "New Session",
  Event: {
    Deleted: { type: "session.deleted" },
    Error: { type: "session.error" },
    Updated: { type: "session.updated" },
    Created: { type: "session.created" },
  },
}
