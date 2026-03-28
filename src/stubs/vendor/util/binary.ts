export const Binary = {
  search<T>(arr: T[], target: any, key: (item: T) => any): { found: boolean; index: number } {
    let low = 0
    let high = arr.length - 1
    while (low <= high) {
      const mid = (low + high) >>> 1
      const val = key(arr[mid])
      if (val === target) return { found: true, index: mid }
      if (val < target) low = mid + 1
      else high = mid - 1
    }
    return { found: false, index: low }
  },
}
