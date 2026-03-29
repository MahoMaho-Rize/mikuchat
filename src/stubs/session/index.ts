export const Session = {
  create: async () => ({}) as any,
  get: async (_id: string) => ({}) as any,
  list: async () => [] as any[],
  chat: async () => ({}) as any,
  isDefaultTitle: (title: string) => !title || title === "New Session",
  Event: {
    Deleted: { type: "session.deleted" as const },
    Error: { type: "session.error" as const },
    Updated: { type: "session.updated" as const },
    Created: { type: "session.created" as const },
  },
};
