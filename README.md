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

## 快速开始

```bash
npm install
npm run dev
```

启动后：

- Web 客户端：http://localhost:5173
- Yjs 同步服务：ws://localhost:8787
- 健康检查：http://localhost:8787/health

多端协同验证方式：

1. 在两个浏览器窗口打开 http://localhost:5173。
2. 保持相同 `Workspace`。
3. 在任一窗口启动 Agent 任务或编辑文档。
4. 另一窗口会实时看到文档和 PPT 大纲同步。

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
