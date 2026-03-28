export const NamedError = {
  create(name: string, _schema?: any) {
    return class extends Error {
      constructor(data?: any) {
        super(name)
        this.name = name
      }
    }
  },
}
