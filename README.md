# Mimo Media Proxy

解决 Claude Code 使用 mimo-v2.5-pro 模型时无法上传图片/PDF 的问题。

## 问题背景

mimo-v2.5-pro 不支持图片识别，当在 Claude Code 对话框中上传图片或 PDF 时会报错：

```
There's an issue with the selected model (mimo-v2.5-pro).
It may not exist or you may not have access to it.
```

mimo-v2.5 支持图片识别，但 Claude Code 无法同时使用两个模型。

## 解决方案

部署一个本地 API 代理服务器，拦截 Claude Code 的请求：

1. 检测请求中是否包含图片/PDF
2. 将图片/PDF 发送给 mimo-v2.5 生成文字描述
3. 用文字描述替换原始图片/PDF
4. 将纯文本请求转发给 mimo-v2.5-pro

对 Claude Code 完全透明，无需修改使用习惯。

## 工作原理

```
┌─────────────┐      ┌──────────────────┐      ┌──────────────┐
│  Claude Code │─────>│  Media Proxy     │─────>│  LLM API     │
│  (客户端)    │      │  localhost:3001  │      │  (上游)      │
└─────────────┘      └──────────────────┘      └──────────────┘
                            │
                            │ 检测到图片/PDF?
                            │
                            ├─ 无 → 直接透传给 mimo-v2.5-pro
                            │
                            └─ 有 → 发给 mimo-v2.5 生成描述
                                     → 替换图片为文字
                                     → 转发给 mimo-v2.5-pro
```

### 图片处理策略

| 场景 | 处理方式 |
|------|---------|
| 新提问包含图片 | 调用 mimo-v2.5 生成详细描述，替换图片 |
| 历史消息中有图片 | 替换为占位文本 `[图片已在之前的对话中描述]` |
| 新提问无图片且历史无图片 | 直接透传，不经过任何处理 |

历史图片只替换为占位文本，不重复调用 mimo-v2.5，避免性能浪费。上下文中已有 AI 之前的回复（包含图片描述），不影响对话连贯性。

## 快速开始

### 前置要求

- Node.js >= 18
- pnpm

### 安装

```bash
cd mimo-media-proxy
pnpm install
```

### 配置

编辑 `.env` 文件：

```env
# 上游 API 地址（你的 LLM 服务地址）
UPSTREAM_URL=https://your-api-endpoint.com

# mimo-v2.5-pro 模型名（不支持图片，最终处理模型）
PRO_MODEL=mimo-v2.5-pro

# mimo-v2.5 模型名（支持图片识别，用于生成描述）
VISION_MODEL=mimo-v2.5

# 代理端口
PORT=3001

# 图片描述请求超时（毫秒）
VISION_TIMEOUT_MS=60000
```

### 构建与启动

```bash
# 构建
pnpm build

# 启动
pnpm start

# 开发模式（自动重载）
pnpm dev
```

启动成功后会显示：

```
[mimo-media-proxy] Server started on port 3001
[mimo-media-proxy] Proxying Anthropic Messages API with automatic image/PDF handling
[mimo-media-proxy] Health check: http://localhost:3001/health
```

### 配置 Claude Code

修改 `~/.claude/settings.json`，将 API 地址指向代理：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:3001"
  }
}
```

其余配置保持不变。修改后需重启 Claude Code 生效。

> **重要**：必须先启动代理服务，再修改 Claude Code 配置。否则 Claude Code 将无法连接 API。

### 恢复原始配置

如需取消代理，将 `ANTHROPIC_BASE_URL` 改回原始地址即可：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-original-api-endpoint.com"
  }
}
```

## 验证

### 健康检查

```bash
curl http://localhost:3001/health
# 返回: {"status":"ok","service":"mimo-media-proxy"}
```

### 功能测试

1. 启动代理服务
2. 配置 Claude Code 指向代理
3. 在 Claude Code 中上传一张图片并提问
4. 观察代理日志，应显示图片被检测并发送给 mimo-v2.5 处理

## 日志说明

代理运行时会输出详细日志：

```
# 无图片，直接透传
[mimo-media-proxy] No media detected, forwarding directly. model=mimo-v2.5-pro, messages=3, stream=true

# 检测到图片，处理中
[mimo-media-proxy] Media detected: 1 new, 0 historical
[mimo-media-proxy] Calling mimo-v2.5 for 1 new image(s)
[mimo-media-proxy] Got description (2773 chars) from mimo-v2.5
[mimo-media-proxy] Processing completed in 35863ms, forwarding to mimo-v2.5-pro

# 历史图片被清理
[mimo-media-proxy] Media detected: 0 new, 2 historical
[mimo-media-proxy] Processing completed in 5ms, forwarding to mimo-v2.5-pro
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `UPSTREAM_URL` | `https://token-plan-cn.xiaomimimo.com/anthropic` | 文本模型 API 地址 |
| `VISION_UPSTREAM_URL` | 与 `UPSTREAM_URL` 相同 | 视觉模型 API 地址（可选，留空则与文本模型相同） |
| `PRO_MODEL` | `mimo-v2.5-pro` | 文本模型名（不支持图片） |
| `VISION_MODEL` | `mimo-v2.5` | 视觉模型名（支持图片识别） |
| `PORT` | `3001` | 代理端口 |
| `VISION_TIMEOUT_MS` | `60000` | 图片描述请求超时（毫秒） |
| `VISION_SYSTEM_PROMPT` | (内置提示词) | 调用视觉模型时的系统提示词 |

### 使用不同服务商的模型

文本模型和视觉模型可以来自不同服务商，只需分别配置 endpoint：

```env
# 文本模型：服务商 A
UPSTREAM_URL=https://api-provider-a.com/v1
PRO_MODEL=model-a

# 视觉模型：服务商 B
VISION_UPSTREAM_URL=https://api-provider-b.com/v1
VISION_MODEL=model-b
```

如果两个模型使用同一个 API 地址，只需配置 `UPSTREAM_URL`，`VISION_UPSTREAM_URL` 会自动复用。

## 项目结构

```
mimo-media-proxy/
├── package.json
├── tsconfig.json
├── .env                  # 环境变量配置
├── src/
│   ├── index.ts          # Express 代理服务器入口
│   ├── proxy.ts          # 代理核心逻辑（拦截/转发）
│   ├── media-detector.ts # 图片/PDF 检测与替换
│   ├── media-processor.ts# 调用 mimo-v2.5 生成描述
│   ├── types.ts          # Anthropic API 类型定义
│   └── constants.ts      # 配置常量
└── dist/                 # 编译输出
```

## 技术细节

- API 格式：Anthropic Messages API (`/v1/messages`)
- 认证透传：从请求的 `Authorization: Bearer <token>` 中提取 API Key
- 流式响应：支持 SSE 流式转发
- 请求体限制：100MB（支持大图片）
- 仅处理新增图片，历史图片替换为占位文本，避免重复调用视觉模型
