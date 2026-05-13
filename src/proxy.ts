import type { Request, Response } from "express"
import {
  UPSTREAM_URL,
  PRO_MODEL,
  VISION_MODEL,
  LOG_PREFIX,
} from "./constants.js"
import {
  extractMediaBlocks,
  replaceMediaWithDescriptions,
} from "./media-detector.js"
import { generateDescriptions } from "./media-processor.js"
import type { AnthropicRequest } from "./types.js"

/**
 * 转发请求到上游 API 并将响应流式返回给客户端
 */
async function forwardToUpstream(
  body: AnthropicRequest,
  req: Request,
  res: Response
): Promise<void> {
  const url = `${UPSTREAM_URL}/v1/messages`

  // 透传原始请求头中与 API 相关的字段
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version":
      (req.headers["anthropic-version"] as string) || "2023-06-01",
  }
  if (req.headers["x-api-key"]) {
    headers["x-api-key"] = req.headers["x-api-key"] as string
  }
  if (req.headers["authorization"]) {
    headers["authorization"] = req.headers["authorization"] as string
  }

  const isStream = body.stream === true

  try {
    const upstreamRes = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        ...(isStream ? { accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify(body),
    })

    console.log(`${LOG_PREFIX} Upstream response: ${upstreamRes.status} ${upstreamRes.statusText}`)

    // 设置响应状态码和头
    res.status(upstreamRes.status)
    const contentType = upstreamRes.headers.get("content-type")
    if (contentType) {
      res.setHeader("content-type", contentType)
    }

    if (isStream && upstreamRes.body) {
      // 流式响应：直接 pipe
      console.log(`${LOG_PREFIX} Streaming response, piping to client`)
      res.setHeader("cache-control", "no-cache")
      res.setHeader("connection", "keep-alive")

      const reader = (upstreamRes.body as any).getReader?.()
      if (reader) {
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(typeof value === "string" ? value : decoder.decode(value, { stream: true }))
          }
        } finally {
          reader.releaseLock()
        }
        res.end()
      } else {
        const nodeStream = upstreamRes.body as any
        if (nodeStream.pipe) {
          nodeStream.pipe(res)
        } else {
          const text = await upstreamRes.text()
          res.send(text)
        }
      }
    } else {
      // 非流式响应：读取完整 body 返回
      const text = await upstreamRes.text()
      if (upstreamRes.status >= 400) {
        console.log(`${LOG_PREFIX} Upstream error body:`, text.substring(0, 500))
      } else {
        console.log(`${LOG_PREFIX} Non-stream response, ${text.length} bytes`)
      }
      res.send(text)
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Forward error:`, error)
    if (!res.headersSent) {
      res.status(502).json({
        type: "error",
        error: {
          type: "proxy_error",
          message: `Failed to forward request to upstream: ${error instanceof Error ? error.message : String(error)}`,
        },
      })
    }
  }
}

/**
 * Express 中间件：拦截 /v1/messages 请求，处理图片/PDF
 */
export async function handleMessages(req: Request, res: Response): Promise<void> {
  const startTime = Date.now()
  const body = req.body as AnthropicRequest

  // 基本验证
  if (!body || !body.messages || !Array.isArray(body.messages)) {
    res.status(400).json({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Invalid request: missing or invalid messages array",
      },
    })
    return
  }

  // 提取媒体内容（区分新增和历史）
  const extraction = extractMediaBlocks(body)

  if (!extraction.hasMedia) {
    // 完全没有媒体内容，直接透传
    console.log(`${LOG_PREFIX} No media detected, forwarding directly. model=${body.model}, messages=${body.messages.length}, stream=${body.stream}`)
    await forwardToUpstream(body, req, res)
    return
  }

  console.log(
    `${LOG_PREFIX} Media detected: ${extraction.newMedia.length} new, ${extraction.historicalMedia.length} historical`
  )

  // 只对新增图片调用 mimo-v2.5 生成描述
  const authHeader = req.headers["authorization"] as string || ""
  const apiKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.headers["x-api-key"] as string) || ""

  let descriptions = new Map<string, string>()

  if (extraction.newMedia.length > 0) {
    console.log(
      `${LOG_PREFIX} Calling ${VISION_MODEL} for ${extraction.newMedia.length} new image(s)`
    )
    descriptions = await generateDescriptions(extraction.newMedia, apiKey)

    if (descriptions.size === 0) {
      console.warn(`${LOG_PREFIX} Description generation failed, forwarding original request as fallback`)
      await forwardToUpstream(body, req, res)
      return
    }
  }

  // 替换所有媒体内容：新增的用描述，历史的用占位文本
  const modifiedBody = replaceMediaWithDescriptions(body, descriptions, extraction.historicalMedia)
  modifiedBody.model = PRO_MODEL

  const elapsed = Date.now() - startTime
  console.log(
    `${LOG_PREFIX} Processing completed in ${elapsed}ms, forwarding to ${PRO_MODEL}`
  )

  await forwardToUpstream(modifiedBody, req, res)
}
