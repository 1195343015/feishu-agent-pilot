import {
  createSlide,
  createTask,
  getSharedWorkspace,
  slideToYMap,
  yMapToSlide,
  type AgentTask,
  type ConnectionState,
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
  task: AgentTask | null;
  agentStatus: string;
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  localPersistence: IndexeddbPersistence | null;
  connect: (settings?: Partial<Pick<WorkspaceSyncState, "workspaceId" | "userId" | "syncUrl">>) => void;
  disconnect: () => void;
  updateDocument: (value: string) => void;
  startAgentTask: (prompt: string) => void;
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

    workspace.agentState.observe(() => {
      set({
        task: (workspace.agentState.get("task") as AgentTask | null) ?? null,
        agentStatus: String(workspace.agentState.get("status") ?? "idle")
      });
    });

    localPersistence.once("synced", () => {
      set({
        documentText: workspace.document.toString(),
        slides: workspace.slides.toArray().map((slide) => yMapToSlide(slide as Y.Map<unknown>)),
        task: (workspace.agentState.get("task") as AgentTask | null) ?? null,
        agentStatus: String(workspace.agentState.get("status") ?? "idle")
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

  startAgentTask(prompt) {
    const doc = get().doc;
    if (!doc || !prompt.trim()) return;

    const workspace = getSharedWorkspace(doc);
    const task = createTask({
      workspaceId: get().workspaceId,
      title: prompt.trim(),
      createdBy: get().userId
    });

    workspace.agentState.set("task", task);
    workspace.agentState.set("status", "planning");

    const generated = [
      "# 需求文档草稿",
      "",
      `## 用户指令`,
      prompt.trim(),
      "",
      "## Agent 初步拆解",
      "- 捕捉 IM 中的业务需求和上下文",
      "- 生成需求背景、目标、核心流程和验收标准",
      "- 根据文档结构生成 5 页汇报 PPT 大纲",
      "- 等待用户确认后导出并交付到飞书"
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
            notes: `围绕「${prompt.trim()}」生成的演示页。`
          })
        )
      ]);
    });

    window.setTimeout(() => {
      const currentDoc = get().doc;
      if (!currentDoc) return;
      getSharedWorkspace(currentDoc).agentState.set("status", "waiting_confirm");
    }, 800);
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
