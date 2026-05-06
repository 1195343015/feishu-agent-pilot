import {
  CheckCircle2,
  CircleOff,
  Cloud,
  CloudOff,
  Download,
  FileCheck2,
  FileText,
  Image,
  ListChecks,
  Loader2,
  MessageSquareText,
  Mic,
  Play,
  Plus,
  Presentation,
  Settings,
  Table2,
  Trash2,
  Users,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceSync } from "../sync/useWorkspaceSync";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

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
    llmStatus,
    connect,
    updateDocument,
    sendMessage,
    createDelivery,
    insertRichBlock,
    addSlideFromPrompt,
    updateSlideTitle,
    clearMessages
  } = useWorkspaceSync();

  const [prompt, setPrompt] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const chatFeedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.lang = 'zh-CN';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setPrompt(transcript);
        setIsRecording(false);
      };

      rec.onerror = () => {
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      setRecognition(rec);
    }

    return () => {
      recognition?.abort();
    };
  }, []);

  const toggleRecording = () => {
    if (!recognition) return;

    if (isRecording) {
      recognition.stop();
    } else {
      setIsRecording(true);
      recognition.start();
    }
  };

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [messages]);

  const isConnected = connection === "connected";

  return (
    <main className="shell">
      {/* ===== 顶栏 ===== */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">AP</span>
          <div>
            <p className="topbar-title">Agent-Pilot</p>
            <p className="topbar-subtitle">从 IM 对话到演示稿的一键智能闭环</p>
          </div>
        </div>
        <div className="status-strip">
          {llmStatus && (
            <span className={`status-pill ${llmStatus.status === "ok" ? "online" : llmStatus.status === "error" ? "offline" : ""}`}>
              {llmStatus.status === "ok" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {llmStatus.model}
              {llmStatus.latencyMs != null && ` · ${llmStatus.latencyMs}ms`}
            </span>
          )}
          <span className={`status-pill ${isConnected ? "online" : "offline"}`}>
            {isConnected ? <Cloud size={14} /> : <CloudOff size={14} />}
            {isConnected ? "已连接" : connection}
          </span>
          <span className="status-pill">
            <Users size={14} />
            {onlineUsers}
          </span>
          <button className={`icon-button settings-btn ${showSettings ? "active" : ""}`} onClick={() => setShowSettings(!showSettings)}>
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* ===== 设置弹出面板 ===== */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>连接设置</h2>
              <button className="icon-button" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="settings-body">
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
            </div>
          </div>
        </div>
      )}

      {/* ===== 上方三列：IM / 任务规划 / 协同文档 ===== */}
      <section className="grid-top">
        {/* IM 指令入口 */}
        <aside className="panel im-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <MessageSquareText size={18} className="panel-icon" />
              <h2>对话指令</h2>
            </div>
            <div className="panel-actions">
              {messages.length > 0 && (
                <button className="icon-button" onClick={clearMessages} title="清空对话">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="chat-feed" ref={chatFeedRef}>
            {messages.length === 0 ? (
              <p className="empty-state">输入自然语言指令启动任务，如"生成一份需求文档和5页PPT"</p>
            ) : (
              messages.map((message) => (
                <div className={`chat-message ${message.role}`} key={message.id}>
                  <span>{message.role === "user" ? "用户" : "Agent"}</span>
                  <p>{message.content}</p>
                </div>
              ))
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="输入指令，或点击麦克风语音输入..."
            rows={2}
          />
          <div className="input-actions">
            <button
              className={`icon-button ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              disabled={!recognition}
              title={recognition ? "语音输入" : "浏览器不支持语音输入"}
            >
              <Mic size={16} />
            </button>
            <button className="primary-button" onClick={() => sendMessage(prompt)}>
              <Play size={15} />
              发送
            </button>
          </div>
          <div className={`task-card ${agentStatus}`}>
            <div className={`task-icon ${agentStatus}`}>
              {agentStatus === "running" ? <Loader2 size={18} className="spin" />
                : agentStatus === "done" ? <CheckCircle2 size={18} />
                : agentStatus === "failed" ? <XCircle size={18} />
                : agentStatus === "waiting_confirm" ? <CheckCircle2 size={18} />
                : <CircleOff size={18} />}
            </div>
            <div>
              <p className="task-title">{task?.title ?? "等待指令"}</p>
              <p className="task-subtitle">
                {agentStatus === "running" ? "Agent 正在执行..."
                  : agentStatus === "waiting_confirm" ? "请检查内容后确认"
                  : agentStatus === "done" ? "已完成"
                  : agentStatus === "failed" ? "执行出错"
                  : "输入指令开始"}
              </p>
            </div>
          </div>
        </aside>

        {/* 任务规划 */}
        <section className="panel planner-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <ListChecks size={18} className="panel-icon" />
              <h2>任务编排</h2>
            </div>
          </div>
          <div className="step-list">
            {steps.length === 0 ? (
              <p className="empty-state">发送指令后，Agent 会自动生成任务步骤</p>
            ) : (
              steps.map((step, index) => {
                const statusIcon = step.status === "done" ? <CheckCircle2 size={14} />
                  : step.status === "running" ? <Loader2 size={14} className="spin" />
                  : step.status === "failed" ? <XCircle size={14} />
                  : step.status === "waiting_confirm" ? "⏳"
                  : <span>{index + 1}</span>;
                return (
                  <article className={`step-card ${step.status}`} key={step.id}>
                    <span>{statusIcon}</span>
                    <div>
                      <strong>{step.summary}</strong>
                      <p className="step-status-label">
                        {step.status === "done" ? "已完成"
                          : step.status === "running" ? "进行中..."
                          : step.status === "failed" ? "出错"
                          : step.status === "waiting_confirm" ? "等待确认"
                          : "待执行"}
                      </p>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* 协同文档 */}
        <section className="panel editor-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <FileText size={18} className="panel-icon" />
              <h2>协同文档</h2>
            </div>
            <div className="panel-actions">
              <button className="secondary-button" onClick={() => insertRichBlock("table")}>
                <Table2 size={14} />
                表格
              </button>
              <button className="secondary-button" onClick={() => insertRichBlock("image")}>
                <Image size={14} />
                图片
              </button>
            </div>
          </div>
          <textarea
            className="document-editor"
            value={documentText}
            onChange={(event) => updateDocument(event.target.value)}
            placeholder="文档内容会由 Agent 自动生成，也可以手动编辑。多端实时同步。"
          />
        </section>
      </section>

      {/* ===== 下方两列：演示稿 / 交付 ===== */}
      <section className="grid-bottom">
        {/* PPT / 画布 */}
        <section className="panel slides-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Presentation size={18} className="panel-icon" />
              <h2>演示稿</h2>
            </div>
            <div className="panel-actions">
              <button className="icon-button" onClick={addSlideFromPrompt} title="新增页面">
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div className="slide-list">
            {slides.length === 0 ? (
              <p className="empty-state">Agent 启动后会自动生成演示稿</p>
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

        {/* 总结与交付 */}
        <section className="panel delivery-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <FileCheck2 size={18} className="panel-icon" />
              <h2>交付物</h2>
            </div>
          </div>
          <div className="delivery-actions">
            <button className="primary-button" onClick={createDelivery}>
              <Presentation size={15} />
              生成交付物
            </button>
            <button className="secondary-button" onClick={() => {
              const base = syncUrl.replace(/^ws(s?):\/\//, "http$1://");
              window.open(`${base}/api/feishu/delivery/download-doc?workspaceId=${encodeURIComponent(workspaceId)}`, "_blank");
            }}>
              <Download size={15} />
              下载文档
            </button>
            <button className="secondary-button" onClick={() => {
              const base = syncUrl.replace(/^ws(s?):\/\//, "http$1://");
              window.open(`${base}/api/feishu/delivery/download-ppt?workspaceId=${encodeURIComponent(workspaceId)}`, "_blank");
            }}>
              <Download size={15} />
              下载 PPT
            </button>
          </div>
          {delivery ? (
            <div className="delivery-card">
              <label>
                飞书文档
                <input readOnly value={delivery.docLink} />
              </label>
              <label>
                PPT 文件
                <input readOnly value={delivery.deckLink} />
              </label>
              <p>{delivery.archiveSummary}</p>
            </div>
          ) : (
            <p className="empty-state">确认内容后生成飞书文档链接和 PPT 下载</p>
          )}
        </section>
      </section>
    </main>
  );
}
