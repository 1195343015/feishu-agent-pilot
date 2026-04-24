# Feishu Agent-Pilot

基于 IM 的办公协同智能助手，从 IM 对话到演示稿的一键智能闭环。

## 赛题背景

在团队协作中，一个需求往往始于一次 IM 对话，历经文档撰写、多方讨论、方案修改，最终沉淀为一份正式的演示文稿。Feishu Agent-Pilot 旨在通过 AI Agent 驱动，将这些步骤自动串联，实现全链路自动化。

## 核心理念

**AI Agent 是主驾驶（Pilot），GUI 界面是仪表盘与辅助操作台（Co-pilot）。**

用户通过自然语言（语音或文本）下达指令，Agent 负责理解、拆解任务并驱动各端应用完成核心操作。

## 场景模块

| 场景 | 描述 |
|------|------|
| A. 意图入口 | IM 群聊/单聊，支持文本/语音，捕捉用户意图并启动任务 |
| B. 任务规划 | LLM/Planner 将用户意图拆解为可执行的子任务与步骤 |
| C. 文档生成 | 围绕需求自动生成并迭代核心文档或白板内容 |
| D. 演示稿生成 | 将已沉淀内容结构化为演示材料，支持演练与修改 |
| E. 多端协作 | 移动端 + 桌面端实时同步，保证跨端状态一致性 |
| F. 总结交付 | 输出面向汇报/归档的成果（分享链接、导出文件等） |

## Tech Stack

- React + TypeScript + Vite：桌面 Web 与移动端共用 UI
- Capacitor：将同一套 Web 应用打包到 iOS / Android
- Yjs + y-websocket：协同内容实时同步
- y-indexeddb：端侧离线持久化和重连合并
- Node.js + Fastify：同步服务与后端服务入口
- PostgreSQL / Supabase：后续承载任务、消息、权限、交付物等结构化状态
- lark-cli：飞书 OpenAPI 开发、授权、权限检查和调试工具

## 快速开始

```bash
npm install
npm run dev
```

如需启用真实 LLM Planner，复制 `.env.example` 并配置：

```bash
OPENAI_API_KEY=你的 API Key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

没有配置 `OPENAI_API_KEY` 时，后端会自动使用本地 fallback，演示链路仍可完整运行。

启动后：

- Web 客户端：http://localhost:5173
- Yjs 同步服务：ws://localhost:8787
- 健康检查：http://localhost:8787/health

多端协同验证方式：

1. 在两个浏览器窗口打开 http://localhost:5173。
2. 保持相同 `Workspace`。
3. 在任一窗口启动 Agent 任务或编辑文档。
4. 另一窗口会实时看到文档和 PPT 大纲同步。

当前 MVP 可演示：

- Scene A：IM 风格自然语言入口，支持输入任务和“进度到哪了”查询
- Scene B：Agent 任务规划步骤与确认继续
- Scene C：协同文档生成、编辑、表格/图片占位插入
- Scene D：PPT 大纲生成、标题修改、排练备注生成
- Scene E：移动端和桌面端通过 Yjs 实时同步，离线编辑后重连合并
- Scene F：生成飞书文档链接、PPT 文件链接和归档摘要

飞书机器人当前支持的自然语言指令：

- 启动任务：`根据刚才讨论生成需求文档和 5 页汇报 PPT`
- 查询进度：`现在进度到哪了？`
- 生成交付物：`生成交付物` / `生成文档链接` / `归档一下`

飞书 Adapter MVP：

- `GET http://localhost:8787/api/feishu/capabilities`
- `POST http://localhost:8787/api/feishu/events`
- `POST http://localhost:8787/api/agent/generate`

`/api/feishu/events` 支持飞书 URL verification 的 `challenge` 回显，也接受 `im.message.receive_v1` 消息事件。收到飞书 IM 消息后，后端会把 `chat_id` 映射为 `feishu-{chat_id}` workspace，调用 Agent Planner，并把任务、文档、PPT 大纲写入对应的 Yjs workspace。配置真实 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 后，后端会尝试向原飞书群聊/单聊回发任务启动消息。

`/api/agent/generate` 会在配置 `OPENAI_API_KEY` 时调用 OpenAI 兼容 Chat Completions 接口，返回 Agent 计划、需求文档 Markdown 和 5 页 PPT 大纲；未配置时返回本地 fallback。

本地模拟飞书 IM 事件：

```powershell
$body = @{
  header = @{ event_type = "im.message.receive_v1" }
  event = @{
    sender = @{ sender_id = @{ user_id = "demo-user" } }
    message = @{
      message_id = "msg-demo"
      chat_id = "oc_demo"
      content = '{"text":"根据这段讨论生成需求文档和 5 页汇报 PPT"}'
    }
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post `
  -Uri http://localhost:8787/api/feishu/events `
  -ContentType "application/json" `
  -Body $body
```

然后在 Web 客户端把 `Workspace` 改为：

```text
feishu-oc_demo
```

即可看到由飞书事件触发的 Agent 任务、文档和 PPT 大纲。

### 飞书机器人正式接入

1. 在飞书开放平台创建企业自建应用，并开启机器人能力。
2. 在 `.env` 中配置：

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_EVENT_MODE=webhook
FEISHU_VERIFICATION_TOKEN=xxx
FEISHU_ENCRYPT_KEY=xxx
FEISHU_DOC_BASE_URL=https://你的企业域名.feishu.cn/docx
FEISHU_DOC_FOLDER_TOKEN=可选的云空间文件夹 token
```

`FEISHU_ENCRYPT_KEY` 只有在事件订阅开启“加密推送”时必填；建议正式演示时开启。配置后重启后端：

```bash
npm run dev:server
```

3. 给应用申请并发布至少以下权限：

- 接收群聊/单聊消息事件：`im.message.receive_v1`
- 发送消息：`im:message`
- 创建新版文档：`docx:document`
- 编辑新版文档块：`docx:document.block`（可选，用于把内容写入文档正文；未开通时仍会创建文档并返回链接）

4. 在飞书开放平台的“事件订阅”中配置请求地址：

```text
https://你的公网域名/api/feishu/events
```

本地演示可使用 Cloudflare Tunnel 暴露 8787：

```bash
cloudflared tunnel --url http://localhost:8787
```

然后把生成的 `https://xxx.trycloudflare.com/api/feishu/events` 填到飞书事件订阅里。

5. 订阅事件 `im.message.receive_v1`，保存并发布应用版本。把机器人拉入单聊或群聊后，发送自然语言指令，例如：

```text
根据刚才讨论生成需求文档和 5 页汇报 PPT
```

后端会把飞书 `chat_id` 映射为 `feishu-{chat_id}` workspace，自动启动 Agent 任务、写入协同文档和 PPT 大纲，并向原飞书会话回发任务启动消息。Web 客户端切换到对应 workspace 后即可看到结果。

当用户在同一飞书会话中发送“现在进度到哪了”时，后端会读取该会话对应 workspace 的任务状态、文档长度、PPT 页数和交付状态并直接回复；发送“生成交付物”时，后端会尝试调用飞书新版文档 OpenAPI 创建真实文档，并把文档链接写回 workspace 和飞书会话。

### 使用飞书长连接接收事件

飞书也支持“使用长连接接收事件”。该模式更适合本地开发：无需公网域名、无需 Cloudflare Tunnel、无需配置加密策略。项目已接入飞书官方 Node SDK，开启方式如下：

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_EVENT_MODE=ws
FEISHU_DOC_BASE_URL=https://你的企业域名.feishu.cn/docx
```

然后重启后端：

```bash
npm run dev:server
```

在飞书开发者后台进入“事件与回调”或“事件订阅”，选择“使用长连接接收事件”，保持本地后端运行，然后点击“验证连接状态”。验证通过后订阅 `im.message.receive_v1` 并发布应用版本。

长连接模式下不需要填写 `FEISHU_VERIFICATION_TOKEN` 和 `FEISHU_ENCRYPT_KEY`；这两个变量只用于 Webhook 回调模式。机器人回发消息仍然需要 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。

## 飞书 CLI 辅助开发

本项目运行时不依赖 `lark-cli`，运行时仍由 `apps/server` 的 Feishu Adapter 负责接收事件和调用 OpenAPI。`lark-cli` 用作开发和调试工具，适合完成应用初始化、OAuth 登录、权限检查、接口 dry-run 和 schema 查询。

安装：

```bash
npm install -g @larksuite/cli
```

常用命令：

```bash
# 创建/配置飞书应用凭据
npm run feishu:config

# 推荐权限登录
npm run feishu:login

# 查看登录状态
npm run feishu:status

# 查看可申请权限
npm run feishu:scopes
```

调试当前项目会用到的能力：

```bash
# 发送 IM 消息 dry-run，避免误发
lark-cli im +messages-send --chat-id oc_xxx --text "Agent-Pilot test" --dry-run

# 创建飞书文档，Markdown 输入适合对接当前 Yjs 文档导出
lark-cli docs +create --api-version v2 --doc-format markdown --content "# Agent-Pilot\n\n- 多端协同\n- 文档生成\n- PPT 交付"

# 直接调用原始 OpenAPI，用于验证 Feishu Adapter 后续要接的接口
lark-cli api POST /open-apis/im/v1/messages --params '{"receive_id_type":"chat_id"}' --data '{"receive_id":"oc_xxx","msg_type":"text","content":"{\"text\":\"Hello\"}"}'
```

建议用法：

1. 用 `lark-cli config init --new` 创建或绑定飞书自建应用。
2. 用 `lark-cli auth login --recommend` 完成授权。
3. 用 `lark-cli auth status` 确认 Messenger、Docs、Drive、Slides 相关权限。
4. 用 dry-run 验证发消息、建文档、上传文件等接口参数。
5. 把验证通过的参数和权限同步到 `.env`，再由 `apps/server` 的 Feishu Adapter 实现正式运行时调用。

移动端打包准备：

```bash
npm run build -w @agent-pilot/web
npm run mobile:add:android -w @agent-pilot/web
npm run mobile:sync -w @agent-pilot/web
```

iOS 同理使用：

```bash
npm run mobile:add:ios -w @agent-pilot/web
npm run mobile:sync -w @agent-pilot/web
```

## 项目结构

```text
apps/
  server/        # Fastify + y-websocket 同步服务
  web/           # React 多端共用客户端，Capacitor 移动端入口
packages/
  shared/        # 共享类型、Yjs workspace 建模
docs/
  architecture.md
```

## License

MIT
