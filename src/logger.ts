import { LOG_PREFIX } from "./constants.js"

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "")
}

export const logger = {
  log(...args: unknown[]) {
    console.log(`${timestamp()} ${LOG_PREFIX}`, ...args)
  },
  warn(...args: unknown[]) {
    console.warn(`${timestamp()} ${LOG_PREFIX} [WARN]`, ...args)
  },
  error(...args: unknown[]) {
    console.error(`${timestamp()} ${LOG_PREFIX} [ERROR]`, ...args)
  },
}
