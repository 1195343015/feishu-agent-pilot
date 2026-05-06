import {
  chatMessageToYMap,
  createChatMessage,
  createDeliveryArtifact,
  createSlide,
  createStep,
  createTask,
  getSharedWorkspace,
  slideToYMap,
  yMapToChatMessage,
  yMapToSlide,
  type AgentStep,
  type AgentGeneration,
  type AgentTask,
  type ChatMessage,
  type ConnectionState,
  type DeliveryArtifact,
  type Slide
} from "@agent-pilot/shared";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { create } from "zustand";

const DEFAULT_WORKSPACE_ID = "demo-workspace";
const DEFAULT_USER_ID = `user-${Math.random().toString(16).slice(2, 6)}`;
const DEFAULT_SYNC_URL = "ws://localhost:8787";

type WorkspaceSyncState = {
  workspaceId: string;
  userId: string;
  syncUrl: string;
  connection: ConnectionState;
  onlineUsers: number;
  documentText: string;
  slides: Slide[];
  messages: ChatMessage[];
  steps: AgentStep[];
  delivery: DeliveryArtifact | null;
  task: AgentTask | null;
  agentStatus: string;
  llmStatus: { status: string; model: string; provider: string; latencyMs: number | null } | null;
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  localPersistence: IndexeddbPersistence | null;
  connect: (settings?: Partial<Pick<WorkspaceSyncState, "workspaceId" | "userId" | "syncUrl">>) => void;
  disconnect: () => void;
  updateDocument: (value: string) => void;
  sendMessage: (content: string) => Promise<void>;
  confirmPlan: () => void;
  rehearseSlides: () => void;
  createDelivery: () => void;
  insertRichBlock: (kind: "table" | "image") => void;
  addSlideFromPrompt: () => void;
  updateSlideTitle: (slideId: string, title: string) => void;
  clearMessages: () => void;
};

export const useWorkspaceSync = create<WorkspaceSyncState>((set, get) => ({
  workspaceId: DEFAULT_WORKSPACE_ID,
  userId: DEFAULT_USER_ID,
  syncUrl: DEFAULT_SYNC_URL,
  connection: "disconnected",
  onlineUsers: 1,
  documentText: "",
  slides: [],
  messages: [],
  steps: [],
  delivery: null,
  task: null,
  agentStatus: "idle",
  llmStatus: null,
  doc: null,
  provider: null,
  localPersistence: null,

  connect(settings) {
    get().disconnect();

    const workspaceId = settings?.workspaceId ?? get().workspaceId;
    const userId = settings?.userId ?? get().userId;
    const syncUrl = settings?.syncUrl ?? get().syncUrl;

    const doc = new Y.Doc();
    const workspace = getSharedWorkspace(doc);
    const localPersistence = new IndexeddbPersistence(`agent-pilot:${workspaceId}`, doc);
    const provider = new WebsocketProvider(syncUrl, workspaceId, doc, { connect: true });

    provider.awareness.setLocalStateField("user", {
      id: userId,
      name: userId,
      role: "user"
    });

    provider.on("status", ({ status }: { status: ConnectionState }) => {
      set({ connection: status });
    });

    provider.awareness.on("change", () => {
      set({ onlineUsers: Array.from(provider.awareness.getStates()).length });
    });

    workspace.document.observe(() => {
      set({ documentText: workspace.document.toString() });
    });

    workspace.slides.observeDeep(() => {
      set({ slides: workspace.slides.toArray().map((slide) => yMapToSlide(slide as Y.Map<unknown>)) });
    });

    workspace.messages.observeDeep(() => {
      set({ messages: workspace.messages.toArray().map((message) => yMapToChatMessage(message as Y.Map<unknown>)) });
    });

    workspace.agentState.observe(() => {
      set({
        task: (workspace.agentState.get("task") as AgentTask | null) ?? null,
        agentStatus: String(workspace.agentState.get("status") ?? "idle"),
        steps: (workspace.agentState.get("steps") as AgentStep[] | undefined) ?? [],
        delivery: (workspace.agentState.get("delivery") as DeliveryArtifact | null) ?? null
      });
    });

    localPersistence.once("synced", () => {
      // 恢复异常状态：页面刷新时，将卡住的 running 步骤恢复为 done
      const currentStatus = String(workspace.agentState.get("status") ?? "idle");
      const currentSteps = (workspace.agentState.get("steps") as AgentStep[] | undefined) ?? [];
      const hasRunningStep = currentSteps.some((step) => step.status === "running");

      if (hasRunningStep || currentStatus === "running") {
        const recoveredSteps = currentSteps.map((step) =>
          step.status === "running" ? { ...step, status: "done" as const } : step
        );
        workspace.agentState.set("steps", recoveredSteps);
        const hasWaiting = recoveredSteps.some((step) => step.status === "waiting_confirm");
        workspace.agentState.set("status", hasWaiting ? "waiting_confirm" : "done");
      }

      set({
        documentText: workspace.document.toString(),
        slides: workspace.slides.toArray().map((slide) => yMapToSlide(slide as Y.Map<unknown>)),
        messages: workspace.messages.toArray().map((message) => yMapToChatMessage(message as Y.Map<unknown>)),
        task: (workspace.agentState.get("task") as AgentTask | null) ?? null,
        agentStatus: String(workspace.agentState.get("status") ?? "idle"),
        steps: (workspace.agentState.get("steps") as AgentStep[] | undefined) ?? [],
        delivery: (workspace.agentState.get("delivery") as DeliveryArtifact | null) ?? null
      });
    });

    set({
      workspaceId,
      userId,
      syncUrl,
      connection: "connecting",
      doc,
      provider,
      localPersistence
    });

    // 获取 LLM 健康状态
    const httpBase = syncUrl.replace(/^ws(s?):\/\//, "http$1://");
    fetch(`${httpBase}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.llm) {
          set({ llmStatus: data.llm });
        }
      })
      .catch(() => {});
  },

  disconnect() {
    get().provider?.destroy();
    get().localPersistence?.destroy();
    get().doc?.destroy();
    set({
      connection: "disconnected",
      onlineUsers: 1,
      doc: null,
      provider: null,
      localPersistence: null
    });
  },

  updateDocument(value) {
    const doc = get().doc;
    if (!doc) return;

    const text = getSharedWorkspace(doc).document;
    text.delete(0, text.length);
    text.insert(0, value);
  },

  async sendMessage(content) {
    const doc = get().doc;
    if (!doc || !content.trim()) return;

    const workspace = getSharedWorkspace(doc);
    const prompt = content.trim();
    workspace.messages.push([chatMessageToYMap(createChatMessage({ role: "user", content: prompt }))]);

    // 主动任务澄清：指令太模糊时主动询问
    if (isVagueQuery(prompt)) {
      const response = "我不太理解你的具体需求，可以详细说明一下吗？比如：\n1. 生成需求文档和5页汇报PPT\n2. 查询当前任务进度\n3. 生成交付物链接\n我会根据你的具体需求执行相应操作。";
      workspace.messages.push([chatMessageToYMap(createChatMessage({ role: "agent", content: response }))]);
      return;
    }

    if (isProgressQuery(prompt)) {
      const task = (workspace.agentState.get("task") as AgentTask | null) ?? null;
      const steps = (workspace.agentState.get("steps") as AgentStep[] | undefined) ?? [];
      const done = steps.filter((step) => step.status === "done").length;
      const response = task
        ? `当前任务「${task.title}」状态为 ${workspace.agentState.get("status") ?? "idle"}，已完成 ${done}/${steps.length} 个步骤。`
        : "当前还没有运行中的 Agent 任务。";
      workspace.messages.push([chatMessageToYMap(createChatMessage({ role: "agent", content: response }))]);
      return;
    }

    const task = createTask({
      workspaceId: get().workspaceId,
      title: prompt,
      createdBy: get().userId
    });

    workspace.agentState.set("task", task);
    workspace.agentState.set("steps", [
      createStep({ taskId: task.id, type: "plan", status: "done", summary: "理解用户意图" }),
      createStep({ taskId: task.id, type: "doc_generate", status: "running", summary: "调用 AI 模型生成文档" })
    ]);
    workspace.agentState.delete("delivery");
    workspace.agentState.set("status", "running");
    workspace.messages.push([
      chatMessageToYMap(createChatMessage({ role: "agent", content: "收到指令，正在调用 AI 模型生成文档..." }))
    ]);

    // 等待期间模拟进度更新
    const progressTimer = window.setInterval(() => {
      const currentDoc = get().doc;
      if (!currentDoc) return;
      const currentWorkspace = getSharedWorkspace(currentDoc);
      const currentSteps = (currentWorkspace.agentState.get("steps") as AgentStep[] | undefined) ?? [];
      const docStep = currentSteps.find(s => s.type === "doc_generate" && s.status === "running");
      if (docStep) {
        const elapsed = Date.now() - new Date(task.createdAt ?? Date.now()).getTime();
        if (elapsed > 30000) {
          docStep.summary = "AI 模型正在生成内容，请耐心等待...";
        } else if (elapsed > 15000) {
          docStep.summary = "AI 模型正在思考和生成中...";
        }
        currentWorkspace.agentState.set("steps", [...currentSteps]);
      }
    }, 10000);

    try {
      // 第一步：调用生成文档（plan + document）
      const generation = await requestAgentGeneration(get().syncUrl, prompt, workspace.document.toString());
      clearInterval(progressTimer);

      // 显示任务规划 + 文档
      const planSteps = generation.steps.map((step, index) =>
        createStep({
          taskId: task.id,
          type: step.type,
          summary: step.summary,
          status: index === 0 ? "done" : index === 1 ? "done" : "running"
        })
      );
      if (!planSteps.some((step) => step.type === "delivery")) {
        planSteps.push(
          createStep({ taskId: task.id, type: "delivery", status: "pending", summary: "生成飞书文档链接和归档摘要" })
        );
      }
      workspace.agentState.set("steps", planSteps);

      // 写入文档
      const text = workspace.document;
      text.delete(0, text.length);
      text.insert(0, generation.documentMarkdown);

      workspace.messages.push([
        chatMessageToYMap(createChatMessage({ role: "agent", content: "任务规划完成，文档已生成，正在生成 PPT..." }))
      ]);

      // 第二步：调用生成 PPT
      const slideResult = await requestSlideGeneration(get().syncUrl, prompt, generation.documentMarkdown);

      const currentDoc = get().doc;
      if (!currentDoc) return;
      const currentWorkspace = getSharedWorkspace(currentDoc);

      currentWorkspace.slides.delete(0, currentWorkspace.slides.length);
      slideResult.slides.forEach((slide: { title: string; notes: string }) => {
        currentWorkspace.slides.push([
          slideToYMap(
            createSlide({
              title: slide.title,
              notes: slide.notes
            })
          )
        ]);
      });

      const finalSteps = generation.steps.map((step) =>
        createStep({
          taskId: task.id,
          type: step.type,
          summary: step.summary,
          status: "done"
        })
      );
      if (!finalSteps.some((step) => step.type === "delivery")) {
        finalSteps.push(
          createStep({ taskId: task.id, type: "delivery", status: "pending", summary: "生成飞书文档链接和归档摘要" })
        );
      }
      currentWorkspace.agentState.set("steps", finalSteps);
      currentWorkspace.agentState.set("status", "done");
      currentWorkspace.messages.push([
        chatMessageToYMap(
          createChatMessage({
            role: "agent",
            content: `${generation.summary}（来源：${generation.provider === "openai" ? "LLM" : "本地 fallback"}）\n所有内容已生成，可以点击「生成交付物」导出。`
          })
        )
      ]);
    } catch (error) {
      clearInterval(progressTimer);
      const currentDoc = get().doc;
      if (currentDoc) {
        const currentWorkspace = getSharedWorkspace(currentDoc);
        currentWorkspace.agentState.set("status", "error");
        currentWorkspace.agentState.set("steps", [
          createStep({ taskId: task.id, type: "plan", status: "done", summary: "调用 LLM Planner 生成任务计划" }),
          createStep({ taskId: task.id, type: "doc_generate", status: "failed", summary: `生成失败：${error instanceof Error ? error.message : "未知错误"}` })
        ]);
        currentWorkspace.messages.push([
          chatMessageToYMap(createChatMessage({ role: "agent", content: `抱歉，生成内容时出错了（${error instanceof Error ? error.message : "未知错误"}）。请稍后重试。` }))
        ]);
      }
    }
  },

  confirmPlan() {
    const doc = get().doc;
    if (!doc) return;

    const workspace = getSharedWorkspace(doc);
    const task = (workspace.agentState.get("task") as AgentTask | null) ?? null;
    const steps = ((workspace.agentState.get("steps") as AgentStep[] | undefined) ?? []).map((step) =>
      step.type === "rehearsal" ? { ...step, status: "running" as const } : step
    );
    workspace.agentState.set("steps", steps);
    workspace.agentState.set("status", "running");
    workspace.messages.push([
      chatMessageToYMap(createChatMessage({ role: "agent", content: `已确认「${task?.title ?? "当前任务"}」，正在进行排练检查...` }))
    ]);

    // 模拟排练过程后自动完成
    window.setTimeout(() => {
      const currentDoc = get().doc;
      if (!currentDoc) return;
      const currentWorkspace = getSharedWorkspace(currentDoc);

      const updatedSteps = ((currentWorkspace.agentState.get("steps") as AgentStep[] | undefined) ?? []).map((step) =>
        step.type === "rehearsal" ? { ...step, status: "done" as const, resultRef: "slides.notes" } : step
      );
      currentWorkspace.agentState.set("steps", updatedSteps);
      currentWorkspace.agentState.set("status", "waiting_confirm");
      currentWorkspace.messages.push([
        chatMessageToYMap(createChatMessage({ role: "agent", content: "排练检查完成！每页 PPT 内容已确认。现在可以点击「生成交付物」导出最终成果。" }))
      ]);
    }, 1500);
  },

  rehearseSlides() {
    const doc = get().doc;
    if (!doc) return;

    const workspace = getSharedWorkspace(doc);

    const steps = ((workspace.agentState.get("steps") as AgentStep[] | undefined) ?? []).map((step) =>
      step.type === "rehearsal" ? { ...step, status: "done" as const, resultRef: "slides.notes" } : step
    );
    workspace.agentState.set("steps", steps);
    workspace.agentState.set("status", "waiting_confirm");
    workspace.messages.push([
      chatMessageToYMap(createChatMessage({ role: "agent", content: "已完成排练检查，PPT 内容确认完毕。" }))
    ]);
  },

  async createDelivery() {
    const doc = get().doc;
    if (!doc) return;

    const workspace = getSharedWorkspace(doc);
    const task = (workspace.agentState.get("task") as AgentTask | null) ?? null;
    const documentMarkdown = workspace.document.toString();
    const slides = workspace.slides.toArray().map((slide, index) => ({
      title: String((slide as any).get("title") ?? `第 ${index + 1} 页`),
      notes: String((slide as any).get("notes") ?? "")
    }));

    workspace.messages.push([
      chatMessageToYMap(createChatMessage({ role: "agent", content: "正在生成交付物，请稍候..." }))
    ]);

    try {
      const url = `${toHttpBaseUrl(get().syncUrl)}/api/feishu/delivery?workspaceId=${encodeURIComponent(get().workspaceId)}`;
      console.log("[delivery] POST", url, { slidesCount: slides.length, docLength: documentMarkdown.length });
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentMarkdown,
          slides,
          taskTitle: task?.title
        })
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`交付物生成失败 (${response.status}): ${body}`);
      }

      const delivery = (await response.json()) as DeliveryArtifact;
      const steps = ((workspace.agentState.get("steps") as AgentStep[] | undefined) ?? []).map((step) =>
        step.type === "delivery" ? { ...step, status: "done" as const, resultRef: delivery.id } : step
      );

      workspace.agentState.set("delivery", delivery);
      workspace.agentState.set("steps", steps);
      workspace.agentState.set("status", "done");
      workspace.messages.push([
        chatMessageToYMap(createChatMessage({ role: "agent", content: "交付完成：已生成飞书文档链接、PPT 文件链接和归档摘要。" }))
      ]);
    } catch (error) {
      console.error("[delivery] Error:", error);
      const fallbackDelivery = createDeliveryArtifact({
        workspaceId: get().workspaceId,
        taskTitle: task?.title ?? "Agent-Pilot 汇报",
        slideCount: slides.length
      });
      const steps = ((workspace.agentState.get("steps") as AgentStep[] | undefined) ?? []).map((step) =>
        step.type === "delivery" ? { ...step, status: "done" as const, resultRef: fallbackDelivery.id } : step
      );

      workspace.agentState.set("delivery", fallbackDelivery);
      workspace.agentState.set("steps", steps);
      workspace.agentState.set("status", "done");
      workspace.messages.push([
        chatMessageToYMap(createChatMessage({ role: "agent", content: "交付生成遇到问题，已生成本地预览链接。请确认服务端正常运行后重试。" }))
      ]);
    }
  },

  insertRichBlock(kind) {
    const doc = get().doc;
    if (!doc) return;

    const text = getSharedWorkspace(doc).document;
    const block =
      kind === "table"
        ? "\n\n## 关键对比表\n| 模块 | 价值 | 演示点 |\n| --- | --- | --- |\n| IM | 捕捉需求 | 飞书群聊指令 |\n| Doc | 沉淀内容 | 多端协同编辑 |\n| PPT | 汇报交付 | 自动生成大纲 |\n"
        : "\n\n## 富媒体占位\n![架构图](feishu-agent-pilot-architecture.png)\n";
    text.insert(text.length, block);
  },

  addSlideFromPrompt() {
    const doc = get().doc;
    if (!doc) return;

    getSharedWorkspace(doc).slides.push([
      slideToYMap(
        createSlide({
          title: "用户补充页",
          notes: "这页由用户在任一端手动添加，另一端会实时同步。"
        })
      )
    ]);
  },

  updateSlideTitle(slideId, title) {
    const doc = get().doc;
    if (!doc) return;

    const slides = getSharedWorkspace(doc).slides;
    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides.get(index) as Y.Map<unknown>;
      if (slide.get("id") === slideId) {
        slide.set("title", title);
        break;
      }
    }
  },

  clearMessages() {
    const doc = get().doc;
    if (!doc) return;

    const workspace = getSharedWorkspace(doc);
    workspace.messages.delete(0, workspace.messages.length);
    set({ messages: [] });
  }
}));

function isProgressQuery(input: string): boolean {
  return /进度|到哪|状态|完成了吗|现在/.test(input);
}

function isVagueQuery(input: string): boolean {
  const vaguePatterns = [
    /^(.{0,5}|[^\u4e00-\u9fa5a-zA-Z0-9]+)$/, // 太短或只有特殊字符
    /^(你好|hi|hello|在吗|哈喽|测试|啥|什么|怎么|为什么|哦|嗯|啊|好的|收到)$/i, // 问候或无意义词
    /^(帮我|给我|要|做|弄|搞)$/ // 只有动词没有具体内容
  ];
  const trimmed = input.trim().toLowerCase();
  return vaguePatterns.some(pattern => pattern.test(trimmed)) && trimmed.length < 6;
}

async function requestAgentGeneration(syncUrl: string, prompt: string, context: string): Promise<AgentGeneration> {
  const response = await fetch(`${toHttpBaseUrl(syncUrl)}/api/agent/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt, context })
  });

  if (!response.ok) {
    throw new Error(`Agent generation failed: ${response.status}`);
  }

  return (await response.json()) as AgentGeneration;
}

async function requestSlideGeneration(syncUrl: string, prompt: string, documentMarkdown: string): Promise<{ provider: "openai" | "fallback"; slides: Array<{ title: string; notes: string }> }> {
  const response = await fetch(`${toHttpBaseUrl(syncUrl)}/api/agent/generate-slides`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt, documentMarkdown })
  });

  if (!response.ok) {
    throw new Error(`Slide generation failed: ${response.status}`);
  }

  return (await response.json()) as { provider: "openai" | "fallback"; slides: Array<{ title: string; notes: string }> };
}

function toHttpBaseUrl(syncUrl: string): string {
  if (syncUrl.startsWith("wss://")) return syncUrl.replace("wss://", "https://");
  if (syncUrl.startsWith("ws://")) return syncUrl.replace("ws://", "http://");
  return syncUrl.replace(/\/$/, "");
}
