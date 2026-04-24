import { CheckCircle2, CircleOff, Cloud, CloudOff, Play, Plus, Users } from "lucide-react";
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
    task,
    agentStatus,
    connect,
    updateDocument,
    startAgentTask,
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
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="@Agent-Pilot 输入自然语言任务"
          />
          <button className="primary-button" onClick={() => startAgentTask(prompt)}>
            <Play size={18} />
            启动 Agent 任务
          </button>
          <div className="task-card">
            <div className="task-icon">{task ? <CheckCircle2 size={20} /> : <CircleOff size={20} />}</div>
            <div>
              <p className="task-title">{task?.title ?? "暂无任务"}</p>
              <p className="task-subtitle">Agent 状态：{agentStatus}</p>
            </div>
          </div>
        </aside>

        <section className="panel editor-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scene C</p>
              <h2>协同文档</h2>
            </div>
            <span>Y.Text + y-indexeddb</span>
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
            <button className="icon-button" onClick={addSlideFromPrompt} aria-label="新增页面">
              <Plus size={18} />
            </button>
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
      </section>
    </main>
  );
}
