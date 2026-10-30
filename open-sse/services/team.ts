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
      const content =
        (json as any)?.choices?.[0]?.message?.content ??
        (json as any)?.choices?.[0]?.text ??
        (json as any)?.text ??
        (json as any)?.content ??
        (json as any)?.output ??
        (json as any)?.result;
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
    const c = (raw as { choices: any[] }).choices[0];
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
  const workerPromises = (plan as any[]).map(async (task: any, idx: number) => {
    const worker = workerNodes[idx % workerNodes.length];
    const taskId = task?.id ?? `t${idx + 1}`;
    const part = task?.part ?? task?.description ?? promptText;
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
