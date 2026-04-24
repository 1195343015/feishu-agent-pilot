export type ActorType = "user" | "agent" | "system";

export type AgentTaskStatus =
  | "idle"
  | "planning"
  | "running"
  | "waiting_confirm"
  | "done"
  | "failed";

export type AgentStepStatus =
  | "pending"
  | "running"
  | "waiting_confirm"
  | "done"
  | "failed";

export type AgentStepType =
  | "plan"
  | "doc_generate"
  | "doc_review"
  | "slide_generate"
  | "rehearsal"
  | "delivery";

export type OperationType =
  | "task.start"
  | "task.step.update"
  | "task.step.confirm"
  | "doc.patch"
  | "slide.patch"
  | "canvas.patch"
  | "delivery.create";

export type Operation = {
  opId: string;
  workspaceId: string;
  actorId: string;
  actorType: ActorType;
  deviceId?: string;
  type: OperationType;
  targetId: string;
  payload: unknown;
  createdAt: string;
};

export type AgentTask = {
  id: string;
  workspaceId: string;
  sourceMessageId?: string;
  status: AgentTaskStatus;
  title: string;
  currentStepId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentStep = {
  id: string;
  taskId: string;
  type: AgentStepType;
  status: AgentStepStatus;
  summary: string;
  resultRef?: string;
};

export type SlideElementType = "text" | "image" | "table" | "shape";

export type SlideElement = {
  id: string;
  type: SlideElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  updatedBy: string;
  updatedAt: string;
};

export type Slide = {
  id: string;
  title: string;
  notes: string;
  elements: SlideElement[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: string;
};

export type DeliveryArtifact = {
  id: string;
  docLink: string;
  deckLink: string;
  archiveSummary: string;
  createdAt: string;
};

export type GeneratedAgentStep = {
  type: AgentStepType;
  summary: string;
};

export type GeneratedSlide = {
  title: string;
  notes: string;
};

export type AgentGeneration = {
  provider: "openai" | "fallback";
  summary: string;
  steps: GeneratedAgentStep[];
  documentMarkdown: string;
  slides: GeneratedSlide[];
};

export type ConnectionState = "connecting" | "connected" | "disconnected";
