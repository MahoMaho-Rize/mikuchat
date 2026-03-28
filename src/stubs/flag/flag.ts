export const Flag: Record<string, any> = new Proxy({} as any, {
  get: () => false,
})
