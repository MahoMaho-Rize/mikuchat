export const Locale = {
  pluralize: (count: number, singular: string, plural: string) => {
    const template = count === 1 ? singular : plural
    return template.replace("{}", String(count))
  },
  number: (n: number) => n.toLocaleString(),
  bytes: (n: number) => {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  },
  titlecase: (str: string) => {
    if (!str) return ""
    return str.charAt(0).toUpperCase() + str.slice(1)
  },
  truncate: (str: string, max: number) => {
    if (!str || str.length <= max) return str || ""
    return str.slice(0, max - 1) + "\u2026"
  },
  truncateMiddle: (str: string, max: number) => {
    if (!str || str.length <= max) return str || ""
    const half = Math.floor((max - 1) / 2)
    return str.slice(0, half) + "\u2026" + str.slice(str.length - half)
  },
  duration: (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    const s = ms / 1000
    if (s < 60) return `${s.toFixed(1)}s`
    const m = Math.floor(s / 60)
    const rs = Math.floor(s % 60)
    return `${m}m${rs}s`
  },
  time: (date: Date | number) => {
    const d = typeof date === "number" ? new Date(date) : date
    return d.toLocaleTimeString()
  },
  datetime: (date: Date | number) => {
    const d = typeof date === "number" ? new Date(date) : date
    return d.toLocaleString()
  },
  todayTimeOrDateTime: (date: Date | number) => {
    const d = typeof date === "number" ? new Date(date) : date
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString()
    }
    return d.toLocaleString()
  },
  relativeTime: (date: Date | number) => {
    const d = typeof date === "number" ? new Date(date) : date
    const diff = Date.now() - d.getTime()
    const s = Math.floor(diff / 1000)
    if (s < 60) return "just now"
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const days = Math.floor(h / 24)
    return `${days}d ago`
  },
}
