import * as Y from "yjs";
import type { AgentStep, AgentTask, ChatMessage, DeliveryArtifact, Slide, SlideElement } from "./types";

export const YDOC_KEYS = {
  agentState: "agentState",
  document: "document",
  slides: "slides",
  messages: "messages",
  operations: "operations"
} as const;

export type SharedWorkspace = {
  agentState: Y.Map<unknown>;
  document: Y.Text;
  slides: Y.Array<Y.Map<unknown>>;
  messages: Y.Array<Y.Map<unknown>>;
  operations: Y.Array<Y.Map<unknown>>;
};

export function getSharedWorkspace(doc: Y.Doc): SharedWorkspace {
  return {
    agentState: doc.getMap(YDOC_KEYS.agentState),
    document: doc.getText(YDOC_KEYS.document),
    slides: doc.getArray(YDOC_KEYS.slides),
    messages: doc.getArray(YDOC_KEYS.messages),
    operations: doc.getArray(YDOC_KEYS.operations)
  };
}

export function createTask(input: {
  workspaceId: string;
  title: string;
  createdBy: string;
  sourceMessageId?: string;
}): AgentTask {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    sourceMessageId: input.sourceMessageId,
    status: "planning",
    title: input.title,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now
  };
}

export function createStep(input: {
  taskId: string;
  type: AgentStep["type"];
  summary: string;
  status?: AgentStep["status"];
}): AgentStep {
  return {
    id: crypto.randomUUID(),
    taskId: input.taskId,
    type: input.type,
    status: input.status ?? "pending",
    summary: input.summary
  };
}

export function createChatMessage(input: { role: ChatMessage["role"]; content: string }): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString()
  };
}

export function createSlide(input: {
  title: string;
  notes?: string;
  elements?: SlideElement[];
}): Slide {
  return {
    id: crypto.randomUUID(),
    title: input.title,
    notes: input.notes ?? "",
    elements: input.elements ?? []
  };
}

export function createDeliveryArtifact(input: {
  workspaceId: string;
  taskTitle: string;
  slideCount: number;
}): DeliveryArtifact {
  const now = new Date().toISOString();
  const slug = encodeURIComponent(input.workspaceId);
  return {
    id: crypto.randomUUID(),
    docLink: `https://feishu.example/docs/${slug}`,
    deckLink: `https://feishu.example/files/${slug}-deck.pptx`,
    archiveSummary: `已归档「${input.taskTitle}」：包含 1 份需求文档、${input.slideCount} 页演示材料和 Agent 执行摘要。`,
    createdAt: now
  };
}

export function chatMessageToYMap(message: ChatMessage): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("id", message.id);
  map.set("role", message.role);
  map.set("content", message.content);
  map.set("createdAt", message.createdAt);
  return map;
}

export function yMapToChatMessage(map: Y.Map<unknown>): ChatMessage {
  return {
    id: String(map.get("id") ?? ""),
    role: (map.get("role") as ChatMessage["role"] | undefined) ?? "system",
    content: String(map.get("content") ?? ""),
    createdAt: String(map.get("createdAt") ?? "")
  };
}

export function slideToYMap(slide: Slide): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("id", slide.id);
  map.set("title", slide.title);
  map.set("notes", slide.notes);
  map.set("elements", slide.elements);
  return map;
}

export function yMapToSlide(map: Y.Map<unknown>): Slide {
  return {
    id: String(map.get("id") ?? ""),
    title: String(map.get("title") ?? ""),
    notes: String(map.get("notes") ?? ""),
    elements: (map.get("elements") as SlideElement[] | undefined) ?? []
  };
}
