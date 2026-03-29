export const Provider = {
  list: () => [] as any[],
  get: (_id: string) => undefined as any,
  AuthMethod: {} as any,
  parseModel: (model: string) => {
    const parts = model.split("/");
    return { providerID: parts[0], modelID: parts.slice(1).join("/") };
  },
};
