import Fastify from "fastify";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";

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

app.get("/health", async () => ({
  ok: true,
  service: "agent-pilot-sync"
}));

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
