// 从环境变量读取配置，提供默认值

/** 上游 API 地址 (文本模型，用于最终处理) */
export const UPSTREAM_URL =
  process.env.UPSTREAM_URL || "https://token-plan-cn.xiaomimimo.com/anthropic"

/** 视觉模型 API 地址 (用于图片描述，默认与 UPSTREAM_URL 相同) */
export const VISION_UPSTREAM_URL =
  process.env.VISION_UPSTREAM_URL || UPSTREAM_URL

/** 文本模型名 (不支持图片) */
export const PRO_MODEL = process.env.PRO_MODEL || "mimo-v2.5-pro"

/** 视觉模型名 (支持图片识别) */
export const VISION_MODEL = process.env.VISION_MODEL || "mimo-v2.5"

/** API 密钥 */
export const API_KEY = process.env.API_KEY || ""

/** 代理服务器端口 */
export const PORT = parseInt(process.env.PORT || "3001", 10)

/** 代理请求路径 */
export const PROXY_PATH = "/v1/messages"

/** mimo-v2.5 请求超时时间 (ms) */
export const VISION_TIMEOUT_MS = parseInt(
  process.env.VISION_TIMEOUT_MS || "60000",
  10
)

/** 描述图片时的系统提示词 */
export const VISION_SYSTEM_PROMPT =
  process.env.VISION_SYSTEM_PROMPT ||
  "请详细描述以下图片/PDF的内容。保留所有关键信息，包括文字、数据、图表、布局等。描述应当足够详细，使得仅通过文字描述就能理解图片的全部内容。"

/** 日志前缀 */
export const LOG_PREFIX = "[mimo-media-proxy]"
