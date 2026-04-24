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
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  localPersistence: IndexeddbPersistence | null;
  connect: (settings?: Partial<Pick<WorkspaceSyncState, "workspaceId" | "userId" | "syncUrl">>) => void;
  disconnect: () => void;
  updateDocument: (value: string) => void;
  sendMessage: (content: string) => void;
  confirmPlan: () => void;
  rehearseSlides: () => void;
  createDelivery: () => void;
  insertRichBlock: (kind: "table" | "image") => void;
  addSlideFromPrompt: () => void;
  updateSlideTitle: (slideId: string, title: string) => void;
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

  sendMessage(content) {
    const doc = get().doc;
    if (!doc || !content.trim()) return;

    const workspace = getSharedWorkspace(doc);
    const prompt = content.trim();
    workspace.messages.push([chatMessageToYMap(createChatMessage({ role: "user", content: prompt }))]);

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
    const steps: AgentStep[] = [
      createStep({ taskId: task.id, type: "plan", status: "done", summary: "理解 IM 指令并拆解任务" }),
      createStep({ taskId: task.id, type: "doc_generate", status: "done", summary: "生成需求文档草稿" }),
      createStep({ taskId: task.id, type: "slide_generate", status: "done", summary: "生成 5 页汇报 PPT 大纲" }),
      createStep({ taskId: task.id, type: "rehearsal", status: "waiting_confirm", summary: "等待用户确认后进入排练修改" }),
      createStep({ taskId: task.id, type: "delivery", status: "pending", summary: "生成飞书文档链接和归档摘要" })
    ];

    workspace.agentState.set("task", task);
    workspace.agentState.set("steps", steps);
    workspace.agentState.delete("delivery");
    workspace.agentState.set("status", "planning");
    workspace.messages.push([
      chatMessageToYMap(createChatMessage({ role: "agent", content: "收到，我会先生成需求文档，再整理为演示稿大纲。" }))
    ]);

    const generated = [
      "# 需求文档草稿",
      "",
      `## 用户指令`,
      prompt,
      "",
      "## Agent 初步拆解",
      "- 捕捉 IM 中的业务需求和上下文",
      "- 生成需求背景、目标、核心流程和验收标准",
      "- 根据文档结构生成 5 页汇报 PPT 大纲",
      "- 支持用户在移动端或桌面端继续修改",
      "- 等待确认后排练并交付到飞书",
      "",
      "## 验收标准",
      "- 移动端和桌面端实时看到同一份状态",
      "- 一端修改文档或 PPT 标题，另一端无刷新同步",
      "- Agent 进度、文档、PPT 和交付结果均可查询"
    ].join("\n");

    const text = workspace.document;
    text.delete(0, text.length);
    text.insert(0, generated);

    workspace.slides.delete(0, workspace.slides.length);
    [
      "项目背景与痛点",
      "Agent-Pilot 目标",
      "多端协同框架",
      "文档到 PPT 的自动化链路",
      "交付物与后续计划"
    ].forEach((title) => {
      workspace.slides.push([
        slideToYMap(
          createSlide({
            title,
            notes: `围绕「${prompt}」生成的演示页。`
          })
        )
      ]);
    });

    window.setTimeout(() => {
      const currentDoc = get().doc;
      if (!currentDoc) return;
      const currentWorkspace = getSharedWorkspace(currentDoc);
      currentWorkspace.agentState.set("status", "waiting_confirm");
      currentWorkspace.messages.push([
        chatMessageToYMap(createChatMessage({ role: "agent", content: "文档和 PPT 大纲已生成。确认后我可以进入排练修改或生成交付物。" }))
      ]);
    }, 800);
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
      chatMessageToYMap(createChatMessage({ role: "agent", content: `已确认「${task?.title ?? "当前任务"}」，开始排练检查。` }))
    ]);
  },

  rehearseSlides() {
    const doc = get().doc;
    if (!doc) return;

    const workspace = getSharedWorkspace(doc);
    const slides = workspace.slides;
    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides.get(index) as Y.Map<unknown>;
      const title = String(slide.get("title") ?? "");
      slide.set("notes", `${title}：建议控制在 45 秒内讲完，先讲结论，再补充关键证据。`);
    }

    const steps = ((workspace.agentState.get("steps") as AgentStep[] | undefined) ?? []).map((step) =>
      step.type === "rehearsal" ? { ...step, status: "done" as const, resultRef: "slides.notes" } : step
    );
    workspace.agentState.set("steps", steps);
    workspace.agentState.set("status", "waiting_confirm");
    workspace.messages.push([
      chatMessageToYMap(createChatMessage({ role: "agent", content: "已完成排练检查，并为每页补充了讲稿提示。" }))
    ]);
  },

  createDelivery() {
    const doc = get().doc;
    if (!doc) return;

    const workspace = getSharedWorkspace(doc);
    const task = (workspace.agentState.get("task") as AgentTask | null) ?? null;
    const delivery = createDeliveryArtifact({
      workspaceId: get().workspaceId,
      taskTitle: task?.title ?? "Agent-Pilot 汇报",
      slideCount: workspace.slides.length
    });
    const steps = ((workspace.agentState.get("steps") as AgentStep[] | undefined) ?? []).map((step) =>
      step.type === "delivery" ? { ...step, status: "done" as const, resultRef: delivery.id } : step
    );

    workspace.agentState.set("delivery", delivery);
    workspace.agentState.set("steps", steps);
    workspace.agentState.set("status", "done");
    workspace.messages.push([
      chatMessageToYMap(createChatMessage({ role: "agent", content: "交付完成：已生成飞书文档链接、PPT 文件链接和归档摘要。" }))
    ]);
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
  }
}));

function isProgressQuery(input: string): boolean {
  return /进度|到哪|状态|完成了吗|现在/.test(input);
}
