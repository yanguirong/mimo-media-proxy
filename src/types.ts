// Anthropic Messages API 类型定义

/** 文本内容块 */
export interface TextContentBlock {
  type: "text"
  text: string
}

/** 图片内容块 (base64) */
export interface ImageContentBlock {
  type: "image"
  source: {
    type: "base64"
    media_type: string
    data: string
  }
}

/** 图片 URL 内容块 */
export interface ImageUrlContentBlock {
  type: "image_url"
  url: string
}

/** 文档内容块 (PDF 等) */
export interface DocumentContentBlock {
  type: "document"
  source: {
    type: "base64"
    media_type: string
    data: string
  }
}

/** 所有内容块类型的联合 */
export type ContentBlock =
  | TextContentBlock
  | ImageContentBlock
  | ImageUrlContentBlock
  | DocumentContentBlock

/** 消息 */
export interface Message {
  role: "user" | "assistant"
  content: string | ContentBlock[]
}

/** Anthropic Messages API 请求体 */
export interface AnthropicRequest {
  model: string
  messages: Message[]
  max_tokens: number
  system?: string | Array<{ type: "text"; text: string }>
  temperature?: number
  top_p?: number
  top_k?: number
  stream?: boolean
  stop_sequences?: string[]
  [key: string]: unknown
}

/** 提取出的媒体块及其在消息中的位置 */
export interface MediaBlockInfo {
  messageIndex: number
  blockIndex: number
  block: ImageContentBlock | ImageUrlContentBlock | DocumentContentBlock
  /** 媒体类型分类 */
  mediaKind: "image" | "document"
}
