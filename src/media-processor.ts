import {
  VISION_UPSTREAM_URL,
  VISION_MODEL,
  VISION_SYSTEM_PROMPT,
  VISION_TIMEOUT_MS,
  API_KEY,
  LOG_PREFIX,
} from "./constants.js"
import type {
  ContentBlock,
  ImageContentBlock,
  ImageUrlContentBlock,
  DocumentContentBlock,
  MediaBlockInfo,
} from "./types.js"

/**
 * 将单个媒体块转换为 Anthropic API 可接受的 content block
 */
function toApiContentBlock(
  block: ImageContentBlock | ImageUrlContentBlock | DocumentContentBlock
): ContentBlock {
  // Anthropic API 直接接受 image 和 document 类型，直接透传
  return block as ContentBlock
}

/**
 * 调用 mimo-v2.5 模型，为一组媒体内容生成文字描述。
 *
 * @param mediaInfos - 同一条消息中的媒体块信息列表
 * @returns Map<位置key, 描述文本>  位置key格式 "messageIndex:blockIndex"
 */
export async function generateDescriptions(
  mediaInfos: MediaBlockInfo[],
  apiKey?: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  if (mediaInfos.length === 0) return result

  // 将媒体块转换为 API content blocks
  const contentBlocks: ContentBlock[] = mediaInfos.map((info) =>
    toApiContentBlock(info.block)
  )

  // 添加文本提示
  contentBlocks.push({
    type: "text",
    text: "请详细描述以上所有图片/PDF的内容，保留关键信息。如果有多个图片/PDF，请分别描述。",
  })

  // 构造 Anthropic Messages API 请求
  const requestBody = {
    model: VISION_MODEL,
    max_tokens: 4096,
    system: VISION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: contentBlocks,
      },
    ],
  }

  const url = `${VISION_UPSTREAM_URL}/v1/messages`
  console.log(
    `${LOG_PREFIX} Calling ${VISION_MODEL} at ${url} with ${mediaInfos.length} media block(s)`
  )

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  }
  const key = apiKey || API_KEY
  console.log(`${LOG_PREFIX} API key source: ${apiKey ? "from request header" : API_KEY ? "from env var" : "NONE"}`)
  console.log(`${LOG_PREFIX} API key value: ${key ? key.substring(0, 10) + "..." : "(empty)"}`)
  if (key) {
    headers["x-api-key"] = key
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Vision API returned ${response.status}: ${errorText}`
      )
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
    }

    // 提取文本描述
    const description =
      data.content
        ?.filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n") || ""

    if (!description) {
      console.warn(`${LOG_PREFIX} Vision model returned empty description`)
    }

    // 将描述映射回每个媒体块
    for (const info of mediaInfos) {
      result.set(`${info.messageIndex}:${info.blockIndex}`, description)
    }

    console.log(
      `${LOG_PREFIX} Got description (${description.length} chars) from ${VISION_MODEL}`
    )
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(
        `${LOG_PREFIX} Vision API request timed out after ${VISION_TIMEOUT_MS}ms`
      )
    } else {
      console.error(`${LOG_PREFIX} Vision API error:`, error)
    }
    // 出错时不填充描述，让调用方决定降级策略
  } finally {
    clearTimeout(timeout)
  }

  return result
}
