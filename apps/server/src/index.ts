import Fastify from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";

loadDotEnv();

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8787);
const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

type Room = {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Map<WebSocket, Set<number>>;
};

const rooms = new Map<string, Room>();

const app = Fastify({ logger: true });

app.addHook("onRequest", async (_request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
});

app.options("*", async (_request, reply) => {
  reply.code(204);
  return "";
});

app.get("/health", async () => ({
  ok: true,
  service: "agent-pilot-sync",
  llm: process.env.OPENAI_API_KEY ? "configured" : "fallback"
}));

app.post("/api/agent/generate", async (request) => {
  const body = request.body as AgentGenerateRequest | undefined;
  const prompt = body?.prompt?.trim() ?? "";
  const context = body?.context?.trim() ?? "";

  if (!prompt) {
    return createFallbackGeneration("请根据 IM 讨论生成需求文档和汇报 PPT", context);
  }

  if (!process.env.OPENAI_API_KEY) {
    return createFallbackGeneration(prompt, context);
  }

  try {
    return await generateWithOpenAI(prompt, context);
  } catch (error) {
    app.log.error({ error }, "LLM generation failed, using fallback");
    return createFallbackGeneration(prompt, context);
  }
});

app.get("/api/feishu/capabilities", async () => ({
  adapter: "feishu",
  mode: "mvp",
  supports: [
    "event.challenge",
    "im.message.receive_v1",
    "task.start.from_im",
    "delivery.link.placeholder"
  ],
  requiredEnvForRealOpenApi: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"]
}));

app.post("/api/feishu/events", async (request, reply) => {
  const body = request.body as FeishuEventPayload | undefined;

  if (body?.challenge) {
    return { challenge: body.challenge };
  }

  const eventType = body?.header?.event_type;
  if (eventType === "im.message.receive_v1") {
    const message = body?.event?.message;
    const chatId = message?.chat_id ?? "unknown-chat";
    const text = extractFeishuText(message);
    app.log.info({ chatId, text }, "Received Feishu IM event");
    return {
      ok: true,
      action: "task.start.from_im",
      chatId,
      prompt: text,
      note: "MVP adapter accepted the event. Real OpenAPI send is enabled after FEISHU_APP_ID/FEISHU_APP_SECRET are configured."
    };
  }

  reply.code(202);
  return {
    ok: true,
    ignored: eventType ?? "unknown"
  };
});

const server = await app.listen({ host, port });
const wss = new WebSocketServer({ noServer: true });

app.server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    const url = new URL(request.url ?? "/default", server);
    const roomName = decodeURIComponent(url.pathname.slice(1) || "default");
    handleConnection(roomName, ws);
  });
});

app.log.info(`Yjs sync endpoint ready at ws://localhost:${port}/:workspaceId`);

type FeishuEventPayload = {
  challenge?: string;
  header?: {
    event_type?: string;
  };
  event?: {
    message?: {
      chat_id?: string;
      content?: string;
    };
  };
};

type AgentGenerateRequest = {
  prompt?: string;
  context?: string;
};

type GeneratedAgentStep = {
  type: "plan" | "doc_generate" | "doc_review" | "slide_generate" | "rehearsal" | "delivery";
  summary: string;
};

type GeneratedSlide = {
  title: string;
  notes: string;
};

type AgentGeneration = {
  provider: "openai" | "fallback";
  summary: string;
  steps: GeneratedAgentStep[];
  documentMarkdown: string;
  slides: GeneratedSlide[];
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

async function generateWithOpenAI(prompt: string, context: string): Promise<AgentGeneration> {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "你是 Agent-Pilot 的办公协同 Planner。",
            "你需要把用户 IM 指令拆解为可执行步骤，并生成需求文档和 5 页演示稿大纲。",
            "只输出 JSON 对象，不要输出 Markdown 代码围栏。",
            "JSON 字段必须是 summary, steps, documentMarkdown, slides。",
            "steps 每项包含 type 和 summary，type 只能是 plan, doc_generate, doc_review, slide_generate, rehearsal, delivery。",
            "slides 必须是 5 项，每项包含 title 和 notes。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            context,
            requiredOutput: {
              summary: "一句话说明 Agent 如何处理任务",
              steps: [{ type: "plan", summary: "步骤说明" }],
              documentMarkdown: "# 需求文档\n...",
              slides: [{ title: "页面标题", notes: "讲稿备注" }]
            }
          })
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible API failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI-compatible API returned empty content");
  }

  return normalizeGeneration(JSON.parse(content) as Partial<AgentGeneration>, "openai", prompt, context);
}

function createFallbackGeneration(prompt: string, context: string): AgentGeneration {
  const documentMarkdown = [
    "# 需求文档草稿",
    "",
    "## 用户指令",
    prompt,
    "",
    "## 背景与痛点",
    context || "团队从 IM 讨论开始，需要快速沉淀需求文档并生成汇报材料。",
    "",
    "## 目标",
    "- 捕捉 IM 中的业务需求和上下文",
    "- 自动生成可编辑的需求文档",
    "- 根据文档结构生成 5 页汇报 PPT 大纲",
    "- 支持移动端和桌面端实时同步修改",
    "- 最终交付飞书文档链接、PPT 文件和归档摘要",
    "",
    "## 验收标准",
    "- 移动端和桌面端实时看到同一份状态",
    "- 一端修改文档或 PPT 标题，另一端无刷新同步",
    "- Agent 进度、文档、PPT 和交付结果均可查询"
  ].join("\n");

  return {
    provider: "fallback",
    summary: "已基于本地 fallback 生成任务计划、需求文档和 5 页 PPT 大纲。",
    steps: [
      { type: "plan", summary: "理解 IM 指令并拆解任务" },
      { type: "doc_generate", summary: "生成需求文档草稿" },
      { type: "doc_review", summary: "等待用户检查和补充文档" },
      { type: "slide_generate", summary: "生成 5 页汇报 PPT 大纲" },
      { type: "rehearsal", summary: "等待用户确认后进入排练修改" },
      { type: "delivery", summary: "生成飞书文档链接和归档摘要" }
    ],
    documentMarkdown,
    slides: [
      { title: "项目背景与痛点", notes: `说明「${prompt}」来自 IM 讨论，强调跨应用手工整理成本。` },
      { title: "Agent-Pilot 目标", notes: "说明 Agent 主驾驶、GUI 辅助操作台的产品定位。" },
      { title: "多端协同框架", notes: "解释移动端和桌面端通过 Yjs 实时同步状态和内容。" },
      { title: "文档到 PPT 的自动化链路", notes: "展示从 IM 指令到文档，再到演示稿的编排过程。" },
      { title: "交付物与后续计划", notes: "总结飞书文档链接、PPT 文件和归档摘要。" }
    ]
  };
}

function normalizeGeneration(
  value: Partial<AgentGeneration>,
  provider: AgentGeneration["provider"],
  prompt: string,
  context: string
): AgentGeneration {
  const fallback = createFallbackGeneration(prompt, context);
  const steps = Array.isArray(value.steps) ? value.steps.map(normalizeStep).filter(Boolean) as GeneratedAgentStep[] : [];
  const slides = Array.isArray(value.slides) ? value.slides.map(normalizeSlide).filter(Boolean) as GeneratedSlide[] : [];

  return {
    provider,
    summary: typeof value.summary === "string" && value.summary.trim() ? value.summary.trim() : fallback.summary,
    steps: steps.length > 0 ? steps : fallback.steps,
    documentMarkdown:
      typeof value.documentMarkdown === "string" && value.documentMarkdown.trim()
        ? value.documentMarkdown.trim()
        : fallback.documentMarkdown,
    slides: slides.length > 0 ? slides.slice(0, 5) : fallback.slides
  };
}

function normalizeStep(step: unknown): GeneratedAgentStep | null {
  if (!step || typeof step !== "object") return null;
  const candidate = step as Partial<GeneratedAgentStep>;
  const allowed = new Set(["plan", "doc_generate", "doc_review", "slide_generate", "rehearsal", "delivery"]);
  if (!candidate.type || !allowed.has(candidate.type)) return null;
  return {
    type: candidate.type,
    summary: typeof candidate.summary === "string" && candidate.summary.trim() ? candidate.summary.trim() : candidate.type
  };
}

function normalizeSlide(slide: unknown): GeneratedSlide | null {
  if (!slide || typeof slide !== "object") return null;
  const candidate = slide as Partial<GeneratedSlide>;
  if (!candidate.title || typeof candidate.title !== "string") return null;
  return {
    title: candidate.title.trim(),
    notes: typeof candidate.notes === "string" ? candidate.notes.trim() : ""
  };
}

type FeishuMessageEvent = NonNullable<NonNullable<FeishuEventPayload["event"]>["message"]>;

function extractFeishuText(message: FeishuMessageEvent | undefined): string {
  if (!message || typeof message.content !== "string") return "";

  try {
    const parsed = JSON.parse(message.content) as { text?: string };
    return parsed.text ?? message.content;
  } catch {
    return message.content;
  }
}

function getRoom(roomName: string): Room {
  const existing = rooms.get(roomName);
  if (existing) return existing;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);

  const room: Room = {
    doc,
    awareness,
    connections: new Map()
  };

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(room, encoding.toUint8Array(encoder), origin instanceof WebSocket ? origin : null);
  });

  awareness.on(
    "update",
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      );
      broadcast(room, encoding.toUint8Array(encoder), origin instanceof WebSocket ? origin : null);
    }
  );

  rooms.set(roomName, room);
  return room;
}

function handleConnection(roomName: string, ws: WebSocket): void {
  const room = getRoom(roomName);
  room.connections.set(ws, new Set());

  ws.on("message", (data) => {
    handleMessage(room, ws, toUint8Array(data));
  });

  ws.on("close", () => {
    const controlledClients = room.connections.get(ws);
    room.connections.delete(ws);
    if (controlledClients && controlledClients.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(controlledClients), ws);
    }
  });

  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, messageSync);
  syncProtocol.writeSyncStep1(syncEncoder, room.doc);
  send(ws, encoding.toUint8Array(syncEncoder));

  const awarenessStates = Array.from(room.awareness.getStates().keys());
  if (awarenessStates.length > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, awarenessStates)
    );
    send(ws, encoding.toUint8Array(awarenessEncoder));
  }
}

function handleMessage(room: Room, ws: WebSocket, data: Uint8Array): void {
  const decoder = decoding.createDecoder(data);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
      if (encoding.length(encoder) > 1) {
        send(ws, encoding.toUint8Array(encoder));
      }
      break;

    case messageAwareness: {
      const update = decoding.readVarUint8Array(decoder);
      trackAwarenessClients(room, ws, update);
      awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws);
      break;
    }

    case messageQueryAwareness: {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(room.awareness.getStates().keys()))
      );
      send(ws, encoding.toUint8Array(awarenessEncoder));
      break;
    }

    default:
      app.log.warn({ messageType }, "Ignoring unsupported y-websocket message type");
  }
}

function broadcast(room: Room, message: Uint8Array, except: WebSocket | null): void {
  for (const conn of room.connections.keys()) {
    if (conn !== except) {
      send(conn, message);
    }
  }
}

function send(ws: WebSocket, message: Uint8Array): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

function toUint8Array(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }

  return new Uint8Array(data);
}

function trackAwarenessClients(room: Room, ws: WebSocket, update: Uint8Array): void {
  const controlledClients = room.connections.get(ws);
  if (!controlledClients) return;

  const decoder = decoding.createDecoder(update);
  const len = decoding.readVarUint(decoder);
  for (let index = 0; index < len; index += 1) {
    const clientId = decoding.readVarUint(decoder);
    decoding.readVarUint(decoder);
    decoding.readVarString(decoder);
    controlledClients.add(clientId);
  }
}

function loadDotEnv(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../..", ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      process.env[key] ??= value;
    }
    return;
  }
}
