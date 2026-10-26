import "server-only";
import { callTool, toolList, type ToolContext } from "./tools";
import { formatWhen, offsetLabel } from "../time-zone";

/*
 * AILI's MCP server, the "connector" Claude and ChatGPT talk to. It speaks
 * JSON-RPC over plain HTTP POST and keeps no session between requests
 * (MCP's Streamable HTTP transport, answering with JSON rather than a stream).
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

type RpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export interface ServerContext extends ToolContext {
  timeZone: string;
}

function instructions(ctx: ServerContext): string {
  const now = new Date();
  return [
    "AILI is the user's LinkedIn outreach inbox. Use it to read their LinkedIn conversations, draft replies, and write, schedule or publish their LinkedIn posts.",
    "Messages: save_draft puts a message in the conversation's message box in AILI; the user clicks Send (or Schedule) there, so nothing reaches anyone without that click. " +
      "You can schedule messages: asked \"send it at 10 am\" or \"in 3 minutes\", pass send_at or send_in_minutes; for \"and a second one 3 minutes later\" pass second_text and second_after_minutes, and a third goes in third_text with third_after_minutes (never several messages in one text). AILI shows them all with one Send all or Schedule button, so the user clicks once. Never tell the user you can't schedule, and never hand messages over one at a time.",
    "Posts: show the user the final text and time before create_post schedules or publishes it. Articles are saved with save_article; the user publishes them in LinkedIn.",
    "Connections: when the user pastes their LinkedIn connections page or says who accepted, sent or withdrew a request, record it with update_connections, one entry per person with the date LinkedIn shows (and the profile link when the paste has one). It only records in AILI. Then say who was updated, who already was, and who isn't in AILI.",
    "Progress: get_progress gives the week's or month's numbers against the user's goals, with a recap and the wins.",
    "Planning: get_plan shows the user's content plan, row by row, and what needs them now. Write a row with create_post or save_article and its plan_row_id; add rows with add_plan_rows.",
    `The user's time zone is ${ctx.timeZone} (${offsetLabel(now, ctx.timeZone)}). It was ${formatWhen(now, ctx.timeZone)} there when this connection started.`,
  ].join("\n");
}

async function handleOne(req: RpcRequest, ctx: ServerContext): Promise<RpcResponse | null> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;
  const ok = (result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") return isNotification ? null : fail(-32600, "Invalid request");
  // Notifications (initialized, cancelled, ...) need no answer.
  if (isNotification) return null;

  switch (req.method) {
    case "initialize": {
      const asked = typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : "";
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "aili", title: "AILI", version: "1.0.0" },
        instructions: instructions(ctx),
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: toolList() });
    case "tools/call": {
      const name = typeof req.params?.name === "string" ? req.params.name : "";
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      return ok(await callTool(name, typeof args === "object" && args ? args : {}, ctx));
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return fail(-32601, `Method not found: ${req.method}`);
  }
}

/** One JSON-RPC message or a batch. Null when there is nothing to answer (only notifications). */
export async function handleMcp(payload: unknown, ctx: ServerContext): Promise<unknown | null> {
  if (Array.isArray(payload)) {
    const answers = (await Promise.all(payload.map((p) => handleOne((p ?? {}) as RpcRequest, ctx)))).filter(Boolean);
    return answers.length ? answers : null;
  }
  if (!payload || typeof payload !== "object") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  }
  return handleOne(payload as RpcRequest, ctx);
}
