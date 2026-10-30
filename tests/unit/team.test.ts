import assert from "node:assert/strict";
import test from "node:test";
import { runTeam, DEFAULT_TEAM_RULES, hasMultipleParts } from "../../open-sse/services/team.ts";

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
