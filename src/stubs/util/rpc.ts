export const Rpc = {
  client: <T>(_worker: any) => {
    return {
      call: async (_method: string, ..._args: any[]) => ({} as any),
      on: <E>(_event: string, _handler: (data: E) => void) => () => {},
    } as any
  },
  server: (_methods: any) => _methods,
}
