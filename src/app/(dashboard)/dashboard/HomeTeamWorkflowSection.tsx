"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Card } from "@/shared/components";
import Icon from "@/shared/components/Icon";

interface TeamNode {
  id: string;
  type: "agent" | "planner" | "worker" | "memory";
  name: string;
  model: string;
  command: string;
  specialty?: string;
  systemPrompt?: string;
}

interface TeamConnection {
  from: string;
  to: string;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  nodes: TeamNode[];
  connections: TeamConnection[];
}

const DEFAULT_NODES: TeamNode[] = [
  {
    id: "agent-1",
    type: "agent",
    name: "Agent-1 (Frontline)",
    model: "claude-sonnet-4-6",
    command: "/agent",
    systemPrompt: "Frontline coordinator receiving user prompts and integrating results.",
  },
  {
    id: "boss-1",
    type: "planner",
    name: "Boss-1 (Planner)",
    model: "gemini-2.5-pro",
    command: "/boss",
    systemPrompt: "Analyzes requirements and generates optimal sub-task execution plan.",
  },
  {
    id: "worker-1",
    type: "worker",
    name: "Worker-1 (Backend)",
    model: "deepseek-v3.2",
    command: "/worker",
    specialty: "backend",
    systemPrompt: "Executes backend logic, database, and system architecture tasks.",
  },
  {
    id: "worker-2",
    type: "worker",
    name: "Worker-2 (Frontend)",
    model: "gpt-5-mini",
    command: "/worker",
    specialty: "frontend",
    systemPrompt: "Executes UI/UX, styling, and interactive frontend components.",
  },
  {
    id: "memory-1",
    type: "memory",
    name: "Memory-1 (Brain)",
    model: "gemini-2.5-flash",
    command: "/memory",
    systemPrompt: "Persists architectural decisions and context in .brain/brain.json.",
  },
];

const NODE_THEMES: Record<string, { label: string; tint: string; ring: string; icon: string; bg: string }> = {
  agent: {
    label: "Frontline Agent",
    tint: "#f59e0b",
    ring: "border-amber-500/40 hover:border-amber-500/80 shadow-amber-500/10",
    icon: "support_agent",
    bg: "bg-amber-500/10 text-amber-500",
  },
  planner: {
    label: "Boss / Planner",
    tint: "#3b82f6",
    ring: "border-blue-500/40 hover:border-blue-500/80 shadow-blue-500/10",
    icon: "psychology",
    bg: "bg-blue-500/10 text-blue-500",
  },
  worker: {
    label: "Parallel Worker",
    tint: "#22c55e",
    ring: "border-emerald-500/40 hover:border-emerald-500/80 shadow-emerald-500/10",
    icon: "terminal",
    bg: "bg-emerald-500/10 text-emerald-500",
  },
  memory: {
    label: "Shared Brain",
    tint: "#a855f7",
    ring: "border-purple-500/40 hover:border-purple-500/80 shadow-purple-500/10",
    icon: "memory",
    bg: "bg-purple-500/10 text-purple-500",
  },
};

const emptySubscribe = () => () => {};

export function HomeTeamWorkflowSection() {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const nodes = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        const saved = localStorage.getItem("omniroute_active_team");
        if (saved) {
          const parsed: Team = JSON.parse(saved);
          if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            return parsed.nodes;
          }
        }
      } catch {
        // Keep defaults
      }
      return DEFAULT_NODES;
    },
    () => DEFAULT_NODES
  );

  const agentNode = nodes.find((n) => n.type === "agent") || DEFAULT_NODES[0];
  const bossNode = nodes.find((n) => n.type === "planner") || DEFAULT_NODES[1];
  const workerNodes = nodes.filter((n) => n.type === "worker");
  const workers = workerNodes.length > 0 ? workerNodes : DEFAULT_NODES.filter((n) => n.type === "worker");
  const memoryNode = nodes.find((n) => n.type === "memory") || DEFAULT_NODES[4];

  return (
    <Card className="mt-4 overflow-hidden border border-border">
      {/* Header bar matching Provider Topology */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 rounded-lg bg-primary/10 items-center justify-center text-primary">
              <Icon name="groups" size={20} />
            </span>
            <h2 className="text-base font-semibold">Team Workflow</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Pipeline: <span className="font-semibold text-text">Agent-1</span> (Frontline) →{" "}
            <span className="font-semibold text-text">Boss-1</span> (Planner) →{" "}
            <span className="font-semibold text-text">Workers</span> (Parallel) →{" "}
            <span className="font-semibold text-text">Memory</span> (Brain)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/dashboard/team"
            prefetch={false}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 transition-opacity shadow-sm"
          >
            <Icon name="groups" size={16} />
            Open Team
          </Link>
        </div>
      </div>

      {/* Sleek Live Canvas Preview */}
      <div className="relative w-full rounded-xl border border-border/80 bg-gradient-to-br from-[#0c0c0e] via-[#141418] to-[#0f1115] p-5 shadow-inner overflow-hidden select-none">
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #3b82f6 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Dynamic SVG Connection Layer */}
        <svg
          className="absolute inset-0 size-full pointer-events-none z-10 hidden md:block"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="35%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#22c55e" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
            </linearGradient>
            <filter id="canvas-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Flow Line 1: Agent to Boss */}
          <path
            d="M 230 110 C 270 110, 280 110, 320 110"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
            opacity="0.8"
            className="animate-pulse"
          />

          {/* Flow Line 2: Boss to Worker 1 */}
          <path
            d="M 480 110 C 510 110, 520 60, 550 60"
            stroke="#22c55e"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
            opacity="0.8"
          />

          {/* Flow Line 3: Boss to Worker 2 */}
          <path
            d="M 480 110 C 510 110, 520 160, 550 160"
            stroke="#06b6d4"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
            opacity="0.8"
          />

          {/* Flow Line 4: Worker 1 to Memory */}
          <path
            d="M 710 60 C 740 60, 750 110, 780 110"
            stroke="#a855f7"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
            opacity="0.8"
          />

          {/* Flow Line 5: Worker 2 to Memory */}
          <path
            d="M 710 160 C 740 160, 750 110, 780 110"
            stroke="#a855f7"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
            opacity="0.8"
          />

          {/* Feedback loop: Memory back to Agent */}
          <path
            d="M 850 145 C 850 205, 160 205, 160 145"
            stroke="#a855f7"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            fill="none"
            opacity="0.35"
          />
        </svg>

        {/* Visual Pipeline Grid (Interactive Node Cards) */}
        <div className="relative z-20 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          {/* Stage 1: Frontline Agent */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-amber-400 animate-ping" />
              Stage 1: Ingestion
            </div>
            <NodeCard
              node={agentNode}
              theme={NODE_THEMES.agent}
              isHovered={hoveredNodeId === agentNode.id}
              onMouseEnter={() => setHoveredNodeId(agentNode.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            />
          </div>

          {/* Stage 2: Planner Boss */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1.5 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-blue-400" />
              Stage 2: Planning
            </div>
            <NodeCard
              node={bossNode}
              theme={NODE_THEMES.planner}
              isHovered={hoveredNodeId === bossNode.id}
              onMouseEnter={() => setHoveredNodeId(bossNode.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            />
          </div>

          {/* Stage 3: Parallel Workers */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-0.5 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Stage 3: Execution ({workers.length} Workers)
            </div>
            <div className="w-full flex flex-col gap-2">
              {workers.slice(0, 2).map((worker, index) => (
                <NodeCard
                  key={worker.id}
                  node={worker}
                  theme={index === 0 ? NODE_THEMES.worker : { ...NODE_THEMES.worker, tint: "#06b6d4", icon: "code" }}
                  compact
                  isHovered={hoveredNodeId === worker.id}
                  onMouseEnter={() => setHoveredNodeId(worker.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                />
              ))}
            </div>
          </div>

          {/* Stage 4: Memory System */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1.5 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-purple-400" />
              Stage 4: Synthesis & Brain
            </div>
            <NodeCard
              node={memoryNode}
              theme={NODE_THEMES.memory}
              isHovered={hoveredNodeId === memoryNode.id}
              onMouseEnter={() => setHoveredNodeId(memoryNode.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            />
          </div>
        </div>

        {/* Canvas Bottom Status Bar */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-text-muted gap-2 relative z-20">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-white/80">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <strong className="text-white font-mono">{nodes.length}</strong> Nodes in Topology
            </span>
            <span className="hidden sm:inline text-white/40">•</span>
            <span className="hidden sm:inline text-white/70">
              Auto-Routing Cascade Active
            </span>
          </div>

          <Link
            href="/dashboard/team"
            prefetch={false}
            className="text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            Launch Interactive Orchestration Studio →
          </Link>
        </div>
      </div>
    </Card>
  );
}

function NodeCard({
  node,
  theme,
  compact = false,
  isHovered = false,
  onMouseEnter,
  onMouseLeave,
}: {
  node: TeamNode;
  theme: { label: string; tint: string; ring: string; icon: string; bg: string };
  compact?: boolean;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`w-full rounded-xl border bg-black/50 backdrop-blur-md transition-all duration-200 cursor-pointer ${
        compact ? "p-2.5" : "p-3.5"
      } ${
        isHovered
          ? "scale-[1.03] shadow-lg ring-1 ring-white/30"
          : "hover:scale-[1.01]"
      } ${theme.ring}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${theme.bg}`}
          style={{ backgroundColor: `${theme.tint}20`, color: theme.tint }}
        >
          <Icon name={theme.icon} size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate">{node.name}</p>
          <p className="text-[10px] text-text-muted truncate capitalize">{theme.label}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/10 font-mono">
        <span className="text-white/70 truncate max-w-[110px]" title={node.model}>
          {node.model}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-bold"
          style={{ backgroundColor: `${theme.tint}25`, color: theme.tint }}
        >
          {node.command}
        </span>
      </div>
    </div>
  );
}

export default HomeTeamWorkflowSection;
