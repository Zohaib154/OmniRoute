import assert from "node:assert/strict";
import test from "node:test";
import { runTeam, hasMultipleParts } from "../../open-sse/services/team.ts";

test("simple query answered directly by agent", async () => {
  const calls: string[] = [];
  const team = {
    nodes: [
      { id: "agent-1", type: "agent", model: "m/agent" },
      { id: "boss-1", type: "planner", model: "m/boss" },
      { id: "w1", type: "worker", model: "m/worker" },
    ],
  };
  const res = await runTeam(team, "hello", {
    callModel: async (model) => {
      calls.push(model);
      return { text: "direct answer" };
    },
  });
  assert.equal(res.final, "direct answer");
  assert.deepEqual(calls, ["m/agent"]);
});

test("complex task runs boss plan + workers + merge", async () => {
  const calls: string[] = [];
  const chunks: string[] = [];
  const team = {
    nodes: [
      { id: "agent-1", type: "agent", model: "m/agent" },
      { id: "boss-1", type: "planner", model: "m/boss" },
      { id: "w1", type: "worker", model: "m/worker1" },
      { id: "w2", type: "worker", model: "m/worker2" },
    ],
  };
  const res = await runTeam(team, "step 1 do x and also y", {
    callModel: async (model, prompt) => {
      calls.push(model);
      if (model === "m/boss" && /Produce a JSON plan/.test(prompt)) {
        return { text: '[{"id":"t1","part":"backend","files":["a.ts"]},{"id":"t2","part":"frontend","files":["b.ts"]}]' };
      }
      if (model === "m/worker1") return { text: "backend done" };
      if (model === "m/worker2") return { text: "frontend done" };
      if (model === "m/boss") return { text: "takeover" };
      return { text: "merged final" };
    },
    onStreamChunk: (c) => chunks.push(c),
  });
  assert.equal(res.final, "merged final");
  assert.equal(res.plan.length, 2);
  assert.equal(res.workerResults.length, 2);
  assert.ok(chunks.some((c) => c.includes("Dispatching")));
});

test("boss takeover on worker failure", async () => {
  const team = {
    nodes: [
      { id: "agent-1", type: "agent", model: "m/agent" },
      { id: "boss-1", type: "planner", model: "m/boss" },
      { id: "w1", type: "worker", model: "m/worker" },
    ],
  };
  const res = await runTeam(team, "step 1 do x", {
    callModel: async (model, prompt) => {
      if (model === "m/boss" && /Produce a JSON plan/.test(prompt)) {
        return { text: '[{"id":"t1","part":"task"}]' };
      }
      if (model === "m/worker") throw new Error("boom");
      if (model === "m/boss") return { text: "boss result" };
      return { text: "final" };
    },
  });
  assert.equal(res.workerResults[0].takeover, true);
  assert.equal(res.workerResults[0].result, "boss result");
});

test("hasMultipleParts", () => {
  assert.equal(hasMultipleParts("hello"), false);
  assert.equal(hasMultipleParts("step 1 do"), true);
});

test("DEFAULT_TEAM has valid orchestration nodes and connections", async () => {
  const { DEFAULT_TEAM } = await import("../../open-sse/services/team.ts");
  assert.equal(DEFAULT_TEAM.slug, "dev-team");
  assert.ok(Array.isArray(DEFAULT_TEAM.nodes));
  assert.ok(DEFAULT_TEAM.nodes!.length >= 4);
  const agent = DEFAULT_TEAM.nodes!.find((n) => n.type === "agent");
  const planner = DEFAULT_TEAM.nodes!.find((n) => n.type === "planner");
  const workers = DEFAULT_TEAM.nodes!.filter((n) => n.type === "worker");
  const memory = DEFAULT_TEAM.nodes!.find((n) => n.type === "memory");
  assert.ok(agent, "agent node should exist");
  assert.ok(planner, "planner node should exist");
  assert.ok(workers.length >= 2, "workers should exist");
  assert.ok(memory, "memory node should exist");
});

test("getTeam resolves default, registered, and synthesized teams", async () => {
  const { getTeam, registerTeam } = await import("../../open-sse/services/team.ts");
  const devTeam = getTeam("dev-team");
  assert.ok(devTeam);
  assert.equal(devTeam?.slug, "dev-team");

  registerTeam({
    id: "custom-alpha",
    slug: "alpha-team",
    name: "Alpha Squad",
    nodes: [{ id: "a1", type: "agent", model: "test/m1" }],
  });
  const custom = getTeam("alpha-team");
  assert.ok(custom);
  assert.equal(custom?.name, "Alpha Squad");

  const synth = getTeam("qa-auto");
  assert.ok(synth);
  assert.equal(synth?.slug, "qa-auto");
  assert.equal(synth?.name, "Qa-auto Team");
});

test("extractLastUserMessage extracts content across various body shapes", async () => {
  const { extractLastUserMessage } = await import("../../open-sse/services/team.ts");

  // String prompt
  assert.equal(extractLastUserMessage({ prompt: "do task" }), "do task");

  // OpenAI messages
  assert.equal(
    extractLastUserMessage({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hello user" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "follow up" },
      ],
    }),
    "follow up"
  );

  // Content array parts
  assert.equal(
    extractLastUserMessage({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "part 1" },
            { type: "text", text: "part 2" },
          ],
        },
      ],
    }),
    "part 1\npart 2"
  );

  // Fallback to any content
  assert.equal(
    extractLastUserMessage({
      messages: [{ role: "assistant", content: "only assistant" }],
    }),
    "only assistant"
  );

  // Empty
  assert.equal(extractLastUserMessage({}), "");
  assert.equal(extractLastUserMessage(null), "");
});

test("handleTeamChatCompletion returns non-streaming JSON response", async () => {
  const { handleTeamChatCompletion, getTeam } = await import("../../open-sse/services/team.ts");
  const team = getTeam("dev-team")!;

  const resp = await handleTeamChatCompletion({
    team,
    body: {
      model: "omniroute/team/dev-team",
      messages: [{ role: "user", content: "hello quick task" }],
    },
    isStreaming: false,
    callModel: async () => ({ text: "team answer completed" }),
  });

  assert.equal(resp.status, 200);
  assert.equal(resp.headers.get("Content-Type"), "application/json");
  const json = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
  assert.equal(json.choices[0].message.content, "team answer completed");
});

test("handleTeamChatCompletion streams SSE chunks", async () => {
  const { handleTeamChatCompletion, getTeam } = await import("../../open-sse/services/team.ts");
  const team = getTeam("dev-team")!;

  const resp = await handleTeamChatCompletion({
    team,
    body: {
      model: "omniroute/team/dev-team",
      messages: [{ role: "user", content: "step 1 plan and also step 2 execute" }],
      stream: true,
    },
    isStreaming: true,
    callModel: async (_m, prompt) => {
      if (/JSON plan/.test(prompt)) {
        return { text: '[{"id":"t1","part":"work"}]' };
      }
      return { text: "worker done" };
    },
  });

  assert.equal(resp.status, 200);
  assert.ok(resp.headers.get("Content-Type")?.includes("text/event-stream"));

  const text = await resp.text();
  assert.ok(text.includes("chat.completion.chunk"));
  assert.ok(text.includes("[DONE]"));
});

test("handleChat routes omniroute/team/<slug> to team execution", async () => {
  const { handleChat } = await import("../../src/sse/handlers/chat.ts");
  const request = new Request("http://localhost:20128/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "omniroute/team/dev-team",
      messages: [{ role: "user", content: "hello quick query" }],
    }),
  });

  const response = await handleChat(request, null, {
    model: "omniroute/team/dev-team",
    messages: [{ role: "user", content: "hello quick query" }],
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-OmniRoute-Team"), "dev-team");
  const json = (await response.json()) as {
    model: string;
    choices: Array<{ message: { content: string } }>;
  };
  assert.equal(json.model, "omniroute/team/dev-team");
  assert.ok(json.choices[0].message.content.length > 0);
});

test("handleChat routes streaming omniroute/team/<slug> to SSE stream", async () => {
  const { handleChat } = await import("../../src/sse/handlers/chat.ts");
  const request = new Request("http://localhost:20128/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "omniroute/team/dev-team",
      messages: [{ role: "user", content: "step 1 plan and also step 2 execute" }],
      stream: true,
    }),
  });

  const response = await handleChat(request, null, {
    model: "omniroute/team/dev-team",
    messages: [{ role: "user", content: "step 1 plan and also step 2 execute" }],
    stream: true,
  });

  assert.equal(response.status, 200);
  assert.ok(response.headers.get("Content-Type")?.includes("text/event-stream"));
  const text = await response.text();
  assert.ok(text.includes("chat.completion.chunk"));
  assert.ok(text.includes("[DONE]"));
});



