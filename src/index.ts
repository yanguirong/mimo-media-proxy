import express from "express"
import { PORT } from "./constants.js"
import { logger } from "./logger.js"
import { handleMessages } from "./proxy.js"

const app = express()

// 解析 JSON body（需要足够大以容纳 base64 图片）
app.use(express.json({ limit: "100mb" }))

// 健康检查
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mimo-media-proxy" })
})

// 拦截 Anthropic Messages API 请求
app.post("/v1/messages", handleMessages)

// 所有其他请求直接返回提示
app.all("*", (_req, res) => {
  res.status(404).json({
    error: "This proxy only handles POST /v1/messages requests",
  })
})

app.listen(PORT, () => {
  logger.log(`Server started on port ${PORT}`)
  logger.log(`Proxying Anthropic Messages API with automatic image/PDF handling`)
  logger.log(`Health check: http://localhost:${PORT}/health`)
})
