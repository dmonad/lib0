
export const isNode = typeof process !== 'undefined' && /node|io\.js/.test(process.release.name)
export const isBrowser = typeof window !== undefined && !isNode