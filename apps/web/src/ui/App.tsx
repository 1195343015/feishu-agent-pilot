import {
  CheckCircle2,
  CircleOff,
  Cloud,
  CloudOff,
  FileCheck2,
  Image,
  MessageSquareText,
  Mic,
  Play,
  Plus,
  Presentation,
  Table2,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkspaceSync } from "../sync/useWorkspaceSync";

export function App() {
  const {
    workspaceId,
    userId,
    syncUrl,
    connection,
    onlineUsers,
    documentText,
    slides,
    messages,
    steps,
    delivery,
    task,
    agentStatus,
    connect,
    updateDocument,
    sendMessage,
    confirmPlan,
    rehearseSlides,
    createDelivery,
    insertRichBlock,
    addSlideFromPrompt,
    updateSlideTitle
  } = useWorkspaceSync();

  const [prompt, setPrompt] = useState("根据这段讨论生成需求文档和 5 页汇报 PPT");

  useEffect(() => {
    connect();
  }, [connect]);

  const isConnected = connection === "connected";

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Feishu Agent-Pilot</p>
          <h1>多端协同框架 MVP</h1>
        </div>
        <div className="status-strip">
          <span className={`status-pill ${isConnected ? "online" : "offline"}`}>
            {isConnected ? <Cloud size={16} /> : <CloudOff size={16} />}
            {connection}
          </span>
          <span className="status-pill">
            <Users size={16} />
            {onlineUsers} 在线
          </span>
        </div>
      </section>

      <section className="workspace-meta">
        <label>
          Workspace
          <input value={workspaceId} onChange={(event) => connect({ workspaceId: event.target.value })} />
        </label>
        <label>
          User
          <input value={userId} onChange={(event) => connect({ userId: event.target.value })} />
        </label>
        <label>
          Sync Server
          <input value={syncUrl} onChange={(event) => connect({ syncUrl: event.target.value })} />
        </label>
      </section>

      <section className="grid">
        <aside className="panel im-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scene A</p>
              <h2>IM 指令入口</h2>
            </div>
            <MessageSquareText size={20} />
          </div>
          <div className="chat-feed">
            {messages.length === 0 ? (
              <p className="empty-state">输入自然语言指令，或输入“现在进度到哪了？”查询任务状态。</p>
            ) : (
              messages.map((message) => (
                <div className={`chat-message ${message.role}`} key={message.id}>
                  <span>{message.role === "user" ? "用户" : message.role === "agent" ? "Agent" : "系统"}</span>
                  <p>{message.content}</p>
                </div>
              ))
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="@Agent-Pilot 输入自然语言任务"
          />
          <button className="primary-button" onClick={() => sendMessage(prompt)}>
            <Play size={18} />
            发送指令
          </button>
          <div className="task-card">
            <div className="task-icon">{task ? <CheckCircle2 size={20} /> : <CircleOff size={20} />}</div>
            <div>
              <p className="task-title">{task?.title ?? "暂无任务"}</p>
              <p className="task-subtitle">Agent 状态：{agentStatus}</p>
            </div>
          </div>
        </aside>

        <section className="panel planner-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scene B</p>
              <h2>任务规划与编排</h2>
            </div>
            <button className="secondary-button" onClick={confirmPlan}>确认继续</button>
          </div>
          <div className="step-list">
            {steps.length === 0 ? (
              <p className="empty-state">Agent 启动后会生成可组合步骤。</p>
            ) : (
              steps.map((step, index) => (
                <article className={`step-card ${step.status}`} key={step.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.summary}</strong>
                    <p>{step.type} / {step.status}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel editor-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scene C</p>
              <h2>协同文档</h2>
            </div>
            <span>Y.Text + y-indexeddb</span>
          </div>
          <div className="tool-row">
            <button className="secondary-button" onClick={() => insertRichBlock("table")}>
              <Table2 size={16} />
              插入表格
            </button>
            <button className="secondary-button" onClick={() => insertRichBlock("image")}>
              <Image size={16} />
              插入图片占位
            </button>
          </div>
          <textarea
            className="document-editor"
            value={documentText}
            onChange={(event) => updateDocument(event.target.value)}
            placeholder="任一端编辑这里，其他端会实时同步。断网后会写入本地 IndexedDB，恢复后自动合并。"
          />
        </section>

        <section className="panel slides-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scene D</p>
              <h2>PPT / 自由画布</h2>
            </div>
            <div className="panel-actions">
              <button className="icon-button" onClick={rehearseSlides} aria-label="排练">
                <Mic size={18} />
              </button>
              <button className="icon-button" onClick={addSlideFromPrompt} aria-label="新增页面">
                <Plus size={18} />
              </button>
            </div>
          </div>
          <div className="slide-list">
            {slides.length === 0 ? (
              <p className="empty-state">启动 Agent 后会生成 5 页演示稿大纲。</p>
            ) : (
              slides.map((slide, index) => (
                <article className="slide-card" key={slide.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <input value={slide.title} onChange={(event) => updateSlideTitle(slide.id, event.target.value)} />
                  <p>{slide.notes}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel delivery-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scene F</p>
              <h2>总结与交付</h2>
            </div>
            <FileCheck2 size={20} />
          </div>
          <button className="primary-button" onClick={createDelivery}>
            <Presentation size={18} />
            生成交付物
          </button>
          {delivery ? (
            <div className="delivery-card">
              <label>
                飞书文档链接
                <input readOnly value={delivery.docLink} />
              </label>
              <label>
                PPT 文件链接
                <input readOnly value={delivery.deckLink} />
              </label>
              <p>{delivery.archiveSummary}</p>
            </div>
          ) : (
            <p className="empty-state">确认内容后生成飞书文档链接、PPT 文件链接和归档摘要。</p>
          )}
        </section>
      </section>
    </main>
  );
}
