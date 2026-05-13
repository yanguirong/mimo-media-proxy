import type {
  AnthropicRequest,
  ContentBlock,
  ImageContentBlock,
  ImageUrlContentBlock,
  DocumentContentBlock,
  MediaBlockInfo,
  Message,
  TextContentBlock,
} from "./types.js"

/**
 * 判断 content block 是否为媒体类型 (图片或 PDF)
 */
function isMediaBlock(
  block: ContentBlock
): block is ImageContentBlock | ImageUrlContentBlock | DocumentContentBlock {
  if (block.type === "image" || block.type === "image_url") return true
  if (
    block.type === "document" &&
    "source" in block &&
    block.source.media_type === "application/pdf"
  )
    return true
  return false
}

/**
 * 判断 content block 是否为图片类型
 */
function isImageBlock(
  block: ContentBlock
): block is ImageContentBlock | ImageUrlContentBlock {
  return block.type === "image" || block.type === "image_url"
}

/**
 * 找到最后一条用户消息的索引
 */
function findLastUserMessageIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i
  }
  return -1
}

/**
 * 提取结果：区分新增图片和历史图片
 */
export interface MediaExtractionResult {
  /** 需要调用 mimo-v2.5 生成描述的新增图片 */
  newMedia: MediaBlockInfo[]
  /** 只需要替换为占位文本的历史图片 */
  historicalMedia: MediaBlockInfo[]
  /** 是否有任何媒体内容 */
  hasMedia: boolean
}

/**
 * 从请求中提取媒体内容块，区分新增和历史。
 *
 * - 最后一条用户消息中的图片 → newMedia（需要调用视觉模型）
 * - 其他消息中的图片 → historicalMedia（直接替换为占位文本）
 */
export function extractMediaBlocks(request: AnthropicRequest): MediaExtractionResult {
  const newMedia: MediaBlockInfo[] = []
  const historicalMedia: MediaBlockInfo[] = []
  const lastUserIdx = findLastUserMessageIndex(request.messages)

  for (let mi = 0; mi < request.messages.length; mi++) {
    const msg = request.messages[mi]
    if (typeof msg.content === "string") continue

    for (let bi = 0; bi < msg.content.length; bi++) {
      const block = msg.content[bi]
      if (isMediaBlock(block)) {
        const info: MediaBlockInfo = {
          messageIndex: mi,
          blockIndex: bi,
          block,
          mediaKind: isImageBlock(block) ? "image" : "document",
        }
        if (mi === lastUserIdx) {
          newMedia.push(info)
        } else {
          historicalMedia.push(info)
        }
      }
    }
  }

  return {
    newMedia,
    historicalMedia,
    hasMedia: newMedia.length > 0 || historicalMedia.length > 0,
  }
}

/**
 * 将 messages 中的媒体块替换为文字。
 *
 * - newMedia: 替换为 mimo-v2.5 生成的详细描述
 * - historicalMedia: 替换为占位文本（上下文中已有描述）
 */
export function replaceMediaWithDescriptions(
  request: AnthropicRequest,
  descriptions: Map<string, string>,
  historicalMedia: MediaBlockInfo[]
): AnthropicRequest {
  // 构建历史图片的占位文本集合
  const historicalKeys = new Set(
    historicalMedia.map((h) => `${h.messageIndex}:${h.blockIndex}`)
  )

  const messages = request.messages.map((msg, mi) => {
    if (typeof msg.content === "string") return msg

    const newBlocks: ContentBlock[] = []
    const mediaTexts: string[] = []

    for (let bi = 0; bi < msg.content.length; bi++) {
      const block = msg.content[bi]
      if (isMediaBlock(block)) {
        const key = `${mi}:${bi}`
        const desc = descriptions.get(key)
        if (desc) {
          // 新增图片：使用 mimo-v2.5 生成的详细描述
          const label =
            block.type === "document" ? "[PDF 内容描述]" : "[图片内容描述]"
          mediaTexts.push(`${label}:\n${desc}`)
        } else if (historicalKeys.has(key)) {
          // 历史图片：使用占位文本
          mediaTexts.push(block.type === "document"
            ? "[PDF 已在之前的对话中分析]"
            : "[图片已在之前的对话中描述]")
        }
      } else {
        newBlocks.push(block)
      }
    }

    // 如果有媒体描述，作为文本块插入到最前面
    if (mediaTexts.length > 0) {
      const descBlock: TextContentBlock = {
        type: "text",
        text: mediaTexts.join("\n\n"),
      }
      newBlocks.unshift(descBlock)
    }

    return { ...msg, content: newBlocks }
  })

  return { ...request, messages: messages as Message[] }
}
