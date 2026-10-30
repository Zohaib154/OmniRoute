/**
 * Multi-Node Team Orchestration Pipeline.
 *
 * Port of the "Agent -> Boss/Planner -> Parallel Workers -> Memory -> Agent"
 * orchestration pattern. Exposed as a standard model via the
 * `omniroute/team/<slug>` prefix so any OpenAI-compatible client can invoke a
 * whole team as if it were a single model.
 *
 * See docs: OMNIROUTE_TEAM_FEATURE.md (Module A).
 */
import fs from "node:fs";
import path from "node:path";

export const TEAM_PREFIX = "omniroute/team/";

export const DEFAULT_TEAM_RULES = [
  "Priority order: 1. Code & file integrity, 2. Safety limits, 3. Pipeline rules, 4. Attribution sign-off.",
  "Roles: Agent-1 -> Boss-1 -> Workers (parallel) -> Memory-1 -> Agent-1.",
  "Boss rules: Output ONLY JSON plan: [{\"id\":\"t1\",\"part\":\"...\",\"specialty\":\"...\",\"files\":[\"path\"]}]. Max 6 parts.",
  "Worker rules: Complete assigned part only. Output JSON: {\"id\":\"t1\",\"status\":\"ok\",\"output\":\"...\",\"files_changed\":[]}.",
  "Boss Takeover: If any worker fails twice, Boss executes that part sequentially.",
  "Final Answer: Agent-1 merges worker outputs into one clean, executable response.",
];

export type TeamNode = {
  id?: string;
  type?: string;
  model?: string;
  specialty?: string;
  [key: string]: unknown;
};

export type TeamDefinition = {
  id?: string;
  slug?: string;
  name?: string;
  nodes?: TeamNode[];
  rules?: string[];
  [key: string]: unknown;
};

export type TeamRunContext = {
  callModel: (
    model: string,
    prompt: string,
    options?: { systemPrompt?: string }
  ) => unknown | Promise<unknown>;
  onStreamChunk?: (chunk: string) => void;
  workspaceDir?: string;
};

export type TeamWorkerResult = {
  taskId: string;
  workerId: string;
  model: string;
  result: string;
  success?: boolean;
  takeover?: boolean;
};

export type TeamRunResult = {
  final: string;
  plan: unknown[];
  workerResults: TeamWorkerResult[];
  nodes?: Array<{ id: string; type: string; text: string }>;
};

function streamChunk(ctx: TeamRunContext, chunk: string): void {
  if (typeof ctx?.onStreamChunk === "function" && chunk) {
    try {
      ctx.onStreamChunk(chunk);
    } catch {
      /* ignore streaming errors */
    }
  }
}

async function normalizeModelResult(raw: unknown): Promise<string> {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);

  // Response-like object (fetch Response or similar)
  if (typeof (raw as { json?: unknown })?.json === "function") {
    try {
      const cloned =
        typeof (raw as { clone?: unknown }).clone === "function"
          ? (raw as { clone: () => unknown }).clone()
          : raw;
      const json = await (cloned as { json: () => Promise<unknown> }).json();
      const rec = json as Record<string, unknown> | null | undefined;
      const choices = Array.isArray(rec?.choices) ? (rec.choices as Array<Record<string, unknown>>) : undefined;
      const firstChoice = choices?.[0];
      const message = firstChoice?.message as Record<string, unknown> | undefined;
      const content =
        message?.content ??
        firstChoice?.text ??
        rec?.text ??
        rec?.content ??
        rec?.output ??
        rec?.result;
      if (typeof content === "string") return content;
      if (content != null) return String(content);
    } catch {
      /* fall through */
    }
    try {
      const text = await (raw as { text: () => Promise<string> }).text();
      if (typeof text === "string") return text;
    } catch {
      /* fall through */
    }
  }

  if (typeof (raw as { text?: unknown })?.text === "string") {
    return (raw as { text: string }).text;
  }
  if (typeof (raw as { content?: unknown })?.content === "string") {
    return (raw as { content: string }).content;
  }
  if (typeof (raw as { output?: unknown })?.output === "string") {
    return (raw as { output: string }).output;
  }
  if (typeof (raw as { result?: unknown })?.result === "string") {
    return (raw as { result: string }).result;
  }
  if (Array.isArray((raw as { choices?: unknown[] })?.choices)) {
    const c = (
      raw as {
        choices: Array<{
          message?: { content?: unknown };
          text?: unknown;
          delta?: { content?: unknown };
        }>;
      }
    ).choices[0];
    const content = c?.message?.content ?? c?.text ?? c?.delta?.content;
    if (typeof content === "string") return content;
  }
  try {
    return String(raw);
  } catch {
    return "";
  }
}

async function invokeModel(
  ctx: TeamRunContext,
  model: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const raw = await ctx.callModel(model, prompt, { systemPrompt });
  return await normalizeModelResult(raw);
}

export function hasMultipleParts(prompt: unknown): boolean {
  if (!prompt) return false;
  const text = typeof prompt === "string" ? prompt : String(prompt);
  return /\b(1[\.\)]|step 1|and also|part 1|multi-part)\b/i.test(text);
}

export function buildNodeSystemPrompt(team: TeamDefinition | null | undefined, node: TeamNode | null | undefined): string {
  const rules =
    Array.isArray(team?.rules) && team.rules.length > 0 ? team.rules : DEFAULT_TEAM_RULES;
  const safeNode = node || ({} as TeamNode);
  return `Role: ${safeNode.type ?? "unknown"} (${safeNode.id ?? ""})\nModel: ${safeNode.model ?? ""}\nRules:\n${rules.join("\n")}`;
}

export async function runTeam(
  team: TeamDefinition | null | undefined,
  userPrompt: unknown,
  ctx: TeamRunContext
): Promise<TeamRunResult> {
  const safeCtx: TeamRunContext = ctx || ({} as TeamRunContext);
  const nodes: TeamNode[] = Array.isArray(team?.nodes) ? team.nodes : [];
  const agentNode: TeamNode =
    nodes.find((n) => n?.type === "agent") || nodes[0] || ({ id: "agent-1", type: "agent", model: "" } as TeamNode);
  const bossNode: TeamNode | undefined = nodes.find((n) => n?.type === "planner");
  const workerNodes: TeamNode[] = nodes.filter((n) => n?.type === "worker");
  const memoryNode: TeamNode | undefined = nodes.find((n) => n?.type === "memory");

  const promptText = typeof userPrompt === "string" ? userPrompt : String(userPrompt ?? "");

  const stream = (chunk: string) => streamChunk(safeCtx, chunk);

  // Heuristic: simple task or chat -> Agent answers directly
  const isComplex =
    hasMultipleParts(promptText) || promptText.trim().startsWith("/team");
  if (!isComplex || !bossNode || workerNodes.length === 0) {
    const text = await invokeModel(
      safeCtx,
      agentNode.model ?? "",
      promptText,
      buildNodeSystemPrompt(team, agentNode)
    );
    return {
      final: text,
      plan: [],
      workerResults: [],
      nodes: [{ id: String(agentNode.id ?? "agent"), type: "agent", text }],
    };
  }

  // 1. BOSS / PLANNER BREAKDOWN
  stream("📋 [Boss] Analyzing request and creating execution plan...\n\n");
  const planPrompt = `Task: ${promptText}\n\nProduce a JSON plan array splitting this task into up to ${workerNodes.length} independent parts: [{"id":"t1","part":"description","specialty":"general|ui|backend","files":[]}]`;

  const planText = await invokeModel(
    safeCtx,
    bossNode.model ?? "",
    planPrompt,
    buildNodeSystemPrompt(team, bossNode)
  );

  let plan: unknown[] = [];
  try {
    const jsonMatch = planText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    plan = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    if (!Array.isArray(plan)) plan = [];
  } catch {
    plan = [{ id: "t1", part: promptText, specialty: "general", files: [] }];
  }
  if (plan.length === 0) {
    plan = [{ id: "t1", part: promptText, specialty: "general", files: [] }];
  }

  // 2. PARALLEL WORKER EXECUTION
  stream(`⚡ [Team] Dispatching ${plan.length} sub-tasks to parallel workers...\n\n`);
  const workerPromises = plan.map(async (task, idx: number) => {
    const worker = workerNodes[idx % workerNodes.length];
    const taskId = task?.id ?? `t${idx + 1}`;
    const part = task?.part ?? promptText;
    const files = Array.isArray(task?.files) ? task.files : [];
    const workerPrompt = `Assigned Sub-Task ${taskId}: ${part}\nTarget Files: ${files.join(", ")}`;

    try {
      const resultText = await invokeModel(
        safeCtx,
        worker?.model ?? "",
        workerPrompt,
        buildNodeSystemPrompt(team, worker)
      );
      if (!resultText || !resultText.trim()) {
        throw new Error("empty worker output");
      }
      stream(`✓ [Worker ${worker?.id ?? idx}] Finished ${taskId}\n`);
      return {
        taskId: String(taskId),
        workerId: String(worker?.id ?? `worker-${idx}`),
        model: String(worker?.model ?? ""),
        result: resultText,
        success: true,
      } as TeamWorkerResult;
    } catch {
      // Boss Takeover fallback
      stream(
        `⚠️ [Boss Takeover] Worker ${worker?.id ?? idx} failed on ${taskId}. Boss executing fallback...\n`
      );
      const takeoverText = await invokeModel(
        safeCtx,
        bossNode.model ?? "",
        `Takeover task: ${part}`,
        buildNodeSystemPrompt(team, bossNode)
      );
      return {
        taskId: String(taskId),
        workerId: String(bossNode.id ?? "boss"),
        model: String(bossNode.model ?? ""),
        result: takeoverText,
        takeover: true,
        success: true,
      } as TeamWorkerResult;
    }
  });

  const workerResults = await Promise.all(workerPromises);

  // 3. MEMORY CONTEXT SAVE
  if (memoryNode) {
    stream("🧠 [Memory] Recording task results to project memory...\n\n");
    try {
      if (safeCtx.workspaceDir) {
        const brainDir = path.join(safeCtx.workspaceDir, ".brain");
        fs.mkdirSync(brainDir, { recursive: true });
        const summary = {
          team: team?.name || team?.slug || team?.id || null,
          userPrompt: promptText,
          plan,
          results: workerResults.map((r) => ({
            taskId: r.taskId,
            workerId: r.workerId,
            model: r.model,
            result: r.result,
          })),
          timestamp: new Date().toISOString(),
        };
        fs.writeFileSync(
          path.join(brainDir, "brain.json"),
          JSON.stringify(summary, null, 2),
          "utf8"
        );
      }
    } catch {
      /* best-effort memory persistence */
    }
  }

  // 4. AGENT MERGE & FINAL RESPONSE
  stream("✨ [Agent] Merging all sub-task deliverables into final response...\n\n");
  const mergePrompt =
    `User Prompt: ${promptText}\n\nSub-Task Deliverables:\n` +
    workerResults
      .map((r) => `--- Task ${r.taskId} (${r.workerId}) ---\n${r.result}`)
      .join("\n\n") +
    `\n\nMerge the above into one clear, production-ready, complete final answer.`;

  const finalText = await invokeModel(
    safeCtx,
    agentNode.model ?? "",
    mergePrompt,
    buildNodeSystemPrompt(team, agentNode)
  );

  return {
    final: finalText,
    plan,
    workerResults,
    nodes: [
      { id: String(agentNode.id ?? "agent"), type: "agent", text: finalText },
      ...workerResults.map((r) => ({
        id: r.workerId,
        type: "worker",
        text: r.result,
      })),
    ],
  };
}

export const runTeamPipeline = runTeam;
export const executeTeam = runTeam;
export const runTeamOrchestration = runTeam;
export default runTeam;
export { TEAM_PREFIX as teamPrefix };

export const DEFAULT_TEAM: TeamDefinition = {
  id: "team-default",
  name: "Multi-Agent Engineering Team",
  slug: "dev-team",
  nodes: [
    {
      id: "agent-1",
      type: "agent",
      name: "Agent-1 (Frontline)",
      model: "claude-sonnet-4-6",
      command: "/agent",
      systemPrompt:
        "You are the frontline agent. Receive user prompts, coordinate execution, and deliver the final integrated response.",
      x: 60,
      y: 160,
    },
    {
      id: "boss-1",
      type: "planner",
      name: "Boss-1 (Planner)",
      model: "gemini-2.5-pro",
      command: "/boss",
      systemPrompt:
        "Analyze the user prompt and generate an optimal JSON sub-task execution plan.",
      x: 320,
      y: 160,
    },
    {
      id: "worker-1",
      type: "worker",
      name: "Worker-1 (Backend)",
      model: "deepseek-v3.2",
      command: "/worker",
      specialty: "backend",
      systemPrompt: "Execute backend and logic sub-tasks thoroughly.",
      x: 580,
      y: 80,
    },
    {
      id: "worker-2",
      type: "worker",
      name: "Worker-2 (Frontend)",
      model: "gpt-5-mini",
      command: "/worker",
      specialty: "frontend",
      systemPrompt: "Execute frontend, UI/UX and styling components.",
      x: 580,
      y: 240,
    },
    {
      id: "memory-1",
      type: "memory",
      name: "Memory-1 (Brain)",
      model: "gemini-2.5-flash",
      command: "/memory",
      systemPrompt:
        "Record architecture decisions and task learnings to .brain/brain.json.",
      x: 840,
      y: 160,
    },
  ],
  connections: [
    { from: "agent-1", to: "boss-1" },
    { from: "boss-1", to: "worker-1" },
    { from: "boss-1", to: "worker-2" },
    { from: "worker-1", to: "memory-1" },
    { from: "worker-2", to: "memory-1" },
    { from: "memory-1", to: "agent-1" },
  ],
};

const teamsRegistry = new Map<string, TeamDefinition>();
teamsRegistry.set(DEFAULT_TEAM.slug ?? "dev-team", DEFAULT_TEAM);
teamsRegistry.set(DEFAULT_TEAM.id ?? "team-default", DEFAULT_TEAM);

export function registerTeam(team: TeamDefinition): void {
  if (team.slug) teamsRegistry.set(team.slug, team);
  if (team.id) teamsRegistry.set(team.id, team);
}

export function getRegisteredTeams(): TeamDefinition[] {
  const seen = new Set<string>();
  const list: TeamDefinition[] = [];
  for (const team of teamsRegistry.values()) {
    const key = team.id || team.slug || "";
    if (key && !seen.has(key)) {
      seen.add(key);
      list.push(team);
    }
  }
  return list;
}

export function getTeam(slugOrId: string): TeamDefinition | null {
  if (!slugOrId) return null;
  const normalized = slugOrId.trim();
  const direct = teamsRegistry.get(normalized);
  if (direct) return direct;

  for (const team of teamsRegistry.values()) {
    if (team.slug === normalized || team.id === normalized) {
      return team;
    }
  }

  // Synthesize default team configured for this slug
  return {
    ...DEFAULT_TEAM,
    id: `team-${normalized}`,
    slug: normalized,
    name: `${normalized.charAt(0).toUpperCase() + normalized.slice(1)} Team`,
  };
}

export function extractLastUserMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  if (typeof b.prompt === "string" && b.prompt) return b.prompt;

  const messages = Array.isArray(b.messages)
    ? (b.messages as Array<Record<string, unknown>>)
    : Array.isArray(b.input)
      ? (b.input as Array<Record<string, unknown>>)
      : [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && (msg.role === "user" || !msg.role)) {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        const textParts = (msg.content as Array<Record<string, unknown>>)
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .filter(Boolean);
        if (textParts.length > 0) return textParts.join("\n");
      }
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (typeof msg?.content === "string" && msg.content) return msg.content;
  }
  return "";
}

export type HandleTeamChatOptions = {
  team: TeamDefinition;
  body: Record<string, unknown>;
  isStreaming?: boolean;
  callModel?: (model: string, prompt: string, opts?: { systemPrompt?: string }) => Promise<unknown>;
  workspaceDir?: string;
  onStreamChunk?: (chunk: string) => void;
};

export async function handleTeamChatCompletion(options: HandleTeamChatOptions): Promise<Response> {
  const { team, body, isStreaming = false, callModel, workspaceDir, onStreamChunk } = options;
  const userMessage = extractLastUserMessage(body);

  if (isStreaming) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendSse = (chunk: string) => {
          if (typeof onStreamChunk === "function") {
            try {
              onStreamChunk(chunk);
            } catch {
              /* ignore */
            }
          }
          const sseData = `data: ${JSON.stringify({
            id: `chatcmpl-team-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: (body.model as string) || `${TEAM_PREFIX}${team.slug}`,
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: null,
              },
            ],
          })}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        };

        try {
          const result = await runTeam(team, userMessage, {
            callModel:
              callModel ||
              (async (m, p) => ({ text: `[${m}] Processed: ${p.slice(0, 80)}` })),
            onStreamChunk: sendSse,
            workspaceDir: workspaceDir || process.cwd(),
          });

          // Deliver final answer chunk if not already streamed
          const isComplex = hasMultipleParts(userMessage) || userMessage.trim().startsWith("/team");
          const finalContent = isComplex ? `\n\n${result.final}` : result.final;
          const finalSse = `data: ${JSON.stringify({
            id: `chatcmpl-team-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: (body.model as string) || `${TEAM_PREFIX}${team.slug}`,
            choices: [
              {
                index: 0,
                delta: { content: finalContent },
                finish_reason: "stop",
              },
            ],
          })}\n\n`;
          controller.enqueue(encoder.encode(finalSse));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Team execution error";
          const errSse = `data: ${JSON.stringify({
            error: {
              message,
              type: "team_error",
            },
          })}\n\n`;
          controller.enqueue(encoder.encode(errSse));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-OmniRoute-Team": team.slug || "team",
      },
    });
  }

  // Non-streaming response
  const result = await runTeam(team, userMessage, {
    callModel:
      callModel ||
      (async (m, p) => ({ text: `[${m}] Processed: ${p.slice(0, 80)}` })),
    onStreamChunk,
    workspaceDir: workspaceDir || process.cwd(),
  });

  return new Response(
    JSON.stringify({
      id: `chatcmpl-team-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: (body.model as string) || `${TEAM_PREFIX}${team.slug}`,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.final,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      team: {
        id: team.id,
        slug: team.slug,
        plan: result.plan,
        workerResults: result.workerResults,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-OmniRoute-Team": team.slug || "team",
      },
    }
  );
}

