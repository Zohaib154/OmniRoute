"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
  ConnectionMode,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PlasmaProvider, Plasma } from "@cruxgarden/plasma-ui";
import Icon from "@/shared/components/Icon";
import Button from "@/shared/components/Button";

export type TeamNodeType = "agent" | "planner" | "worker" | "memory";
export type NodeStatus = "ready" | "active" | "idle" | "running";

export interface TeamNodeData {
  id: string;
  type: TeamNodeType;
  name: string;
  model: string;
  command: string;
  specialty?: string;
  systemPrompt?: string;
  status: NodeStatus;
  themeColor: string;
  [key: string]: unknown;
}

export interface TeamNodeConfig {
  id: string;
  type: TeamNodeType;
  name: string;
  model: string;
  command: string;
  specialty?: string;
  systemPrompt?: string;
  x: number;
  y: number;
  status?: NodeStatus;
}

export interface TeamConnectionConfig {
  from: string;
  to: string;
  fromHandle?: string;
  toHandle?: string;
}

export interface TeamConfig {
  id: string;
  name: string;
  slug: string;
  nodes: TeamNodeConfig[];
  connections: TeamConnectionConfig[];
}

export const NODE_THEMES: Record<
  TeamNodeType,
  {
    label: string;
    sublabel: string;
    tint: string;
    border: string;
    glow: string;
    bgBadge: string;
    textBadge: string;
    icon: string;
    defaultModel: string;
    defaultCommand: string;
  }
> = {
  agent: {
    label: "Frontline Agent",
    sublabel: "Orchestrator & Synthesizer",
    tint: "#f59e0b",
    border: "border-amber-500/50",
    glow: "rgba(245, 158, 11, 0.35)",
    bgBadge: "bg-amber-500/15",
    textBadge: "text-amber-400",
    icon: "smart_toy",
    defaultModel: "claude-sonnet-4-6",
    defaultCommand: "/agent",
  },
  planner: {
    label: "Boss / Planner",
    sublabel: "Task Decomposition",
    tint: "#3b82f6",
    border: "border-blue-500/50",
    glow: "rgba(59, 130, 246, 0.35)",
    bgBadge: "bg-blue-500/15",
    textBadge: "text-blue-400",
    icon: "psychology",
    defaultModel: "gemini-2.5-pro",
    defaultCommand: "/boss",
  },
  worker: {
    label: "Parallel Worker",
    sublabel: "Sub-task Execution",
    tint: "#10b981",
    border: "border-emerald-500/50",
    glow: "rgba(16, 185, 129, 0.35)",
    bgBadge: "bg-emerald-500/15",
    textBadge: "text-emerald-400",
    icon: "terminal",
    defaultModel: "deepseek-v3.2",
    defaultCommand: "/worker",
  },
  memory: {
    label: "Memory / Brain",
    sublabel: "Decisions & State Store",
    tint: "#a855f7",
    border: "border-purple-500/50",
    glow: "rgba(168, 85, 247, 0.35)",
    bgBadge: "bg-purple-500/15",
    textBadge: "text-purple-400",
    icon: "memory",
    defaultModel: "gemini-2.5-flash",
    defaultCommand: "/memory",
  },
};

const DEFAULT_TEAM_CONFIG: TeamConfig = {
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
      specialty: "Orchestrator",
      systemPrompt:
        "You are the frontline agent. Receive user prompts, coordinate execution, and deliver the final integrated response.",
      x: 80,
      y: 220,
      status: "ready",
    },
    {
      id: "boss-1",
      type: "planner",
      name: "Boss-1 (Planner)",
      model: "gemini-2.5-pro",
      command: "/boss",
      specialty: "JSON Execution Planner",
      systemPrompt:
        "Analyze the user prompt and generate an optimal JSON sub-task execution plan.",
      x: 380,
      y: 220,
      status: "ready",
    },
    {
      id: "worker-1",
      type: "worker",
      name: "Worker-1 (Backend)",
      model: "deepseek-v3.2",
      command: "/worker",
      specialty: "backend",
      systemPrompt: "Execute backend and logic sub-tasks thoroughly.",
      x: 680,
      y: 90,
      status: "ready",
    },
    {
      id: "worker-2",
      type: "worker",
      name: "Worker-2 (Frontend)",
      model: "gpt-5-mini",
      command: "/worker",
      specialty: "frontend",
      systemPrompt: "Execute frontend, UI/UX and styling components.",
      x: 680,
      y: 350,
      status: "ready",
    },
    {
      id: "memory-1",
      type: "memory",
      name: "Memory-1 (Brain)",
      model: "gemini-2.5-flash",
      command: "/memory",
      specialty: "Knowledge Store",
      systemPrompt:
        "Record architecture decisions and task learnings to .brain/brain.json.",
      x: 980,
      y: 220,
      status: "ready",
    },
  ],
  connections: [
    { from: "agent-1", to: "boss-1", fromHandle: "source-right", toHandle: "target-left" },
    { from: "boss-1", to: "worker-1", fromHandle: "source-right", toHandle: "target-left" },
    { from: "boss-1", to: "worker-2", fromHandle: "source-right", toHandle: "target-left" },
    { from: "worker-1", to: "memory-1", fromHandle: "source-right", toHandle: "target-left" },
    { from: "worker-2", to: "memory-1", fromHandle: "source-right", toHandle: "target-left" },
    { from: "memory-1", to: "agent-1", fromHandle: "source-bottom", toHandle: "target-bottom" },
  ],
};

function configNodesToFlow(nodes: TeamNodeConfig[]): Node<TeamNodeData>[] {
  return nodes.map((n) => {
    const theme = NODE_THEMES[n.type] || NODE_THEMES.worker;
    return {
      id: n.id,
      type: "teamNode",
      position: { x: n.x, y: n.y },
      data: {
        id: n.id,
        type: n.type,
        name: n.name,
        model: n.model,
        command: n.command,
        specialty: n.specialty,
        systemPrompt: n.systemPrompt,
        status: n.status || "ready",
        themeColor: theme.tint,
      },
    };
  });
}

function configConnectionsToFlow(connections: TeamConnectionConfig[]): Edge[] {
  return connections.map((c, idx) => {
    const isReturn = (c.from.includes("memory") && c.to.includes("agent")) || c.fromHandle === "source-bottom";
    const strokeColor = isReturn ? "#a855f7" : "#3b82f6";
    return {
      id: `edge-${c.from}-${c.to}-${idx}`,
      source: c.from,
      target: c.to,
      sourceHandle: c.fromHandle || (isReturn ? "source-bottom" : "source-right"),
      targetHandle: c.toHandle || (isReturn ? "target-bottom" : "target-left"),
      type: "smoothstep",
      animated: true,
      style: {
        stroke: strokeColor,
        strokeWidth: 2.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: strokeColor,
      },
    };
  });
}

// ── Custom Team Node Component ─────────────────────────────────────────────

function TeamNodeComponent({ data, selected }: NodeProps<Node<TeamNodeData>>) {
  const theme = NODE_THEMES[data.type] || NODE_THEMES.worker;
  const isSelected = selected;

  const statusColor =
    data.status === "active" || data.status === "running"
      ? "#10b981"
      : data.status === "idle"
        ? "#f59e0b"
        : "#3b82f6";

  return (
    <div
      className={`relative min-w-[210px] max-w-[250px] rounded-2xl border transition-all duration-200 select-none cursor-grab active:cursor-grabbing bg-surface/90 backdrop-blur-md shadow-lg ${
        isSelected
          ? "border-primary ring-2 ring-primary/50 shadow-[0_0_24px_rgba(59,130,246,0.35)] scale-[1.02]"
          : "border-border/80 hover:border-border hover:shadow-xl hover:scale-[1.01]"
      }`}
      style={{
        boxShadow: isSelected
          ? `0 0 24px ${theme.glow}`
          : "0 4px 20px -2px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Target Handles (Inputs) */}
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        title="Input: Connect here (Left)"
        className="!size-3.5 !-left-2 !rounded-full !bg-surface !border-2 hover:!scale-125 !transition-all"
        style={{ borderColor: theme.tint }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        title="Top Input"
        className="!size-3.5 !-top-2 !rounded-full !bg-surface !border-2 hover:!scale-125 !transition-all"
        style={{ borderColor: theme.tint }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        title="Bottom Input: Loop return from Memory"
        className="!size-3.5 !-bottom-2 !rounded-full !bg-surface !border-2 hover:!scale-125 !transition-all"
        style={{ left: "35%", borderColor: theme.tint }}
      />

      {/* Source Handles (Outputs) */}
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        title="Output: Drag to connect forward"
        className="!size-3.5 !-right-2 !rounded-full !border-2 !border-surface hover:!scale-125 !transition-all cursor-crosshair"
        style={{ backgroundColor: theme.tint }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        title="Bottom Output: Loop back to Frontline Agent"
        className="!size-3.5 !-bottom-2 !rounded-full !border-2 !border-surface hover:!scale-125 !transition-all cursor-crosshair"
        style={{ left: "65%", backgroundColor: theme.tint }}
      />

      {/* Plasma Liquid Refraction Backdrop */}
      <Plasma
        tint={theme.tint}
        frost={0.15}
        opacity={0.25}
        radius={16}
        className="p-3.5 flex flex-col gap-2.5"
      >
        {/* Header: Icon + Name + Role + Status */}
        <div className="flex items-center gap-2.5">
          <div
            className="size-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
            style={{ backgroundColor: theme.tint }}
          >
            <Icon name={theme.icon} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-text-main truncate">
                {data.name}
              </span>
            </div>
            <span className="text-[10px] text-text-muted font-medium truncate block">
              {theme.label}
            </span>
          </div>

          {/* Status Dot with pulse */}
          <div className="flex items-center gap-1 shrink-0" title={`Status: ${data.status}`}>
            <span
              className={`inline-block size-2.5 rounded-full ${
                data.status === "active" || data.status === "running"
                  ? "animate-pulse ring-2 ring-emerald-400/40"
                  : ""
              }`}
              style={{ backgroundColor: statusColor }}
            />
          </div>
        </div>

        {/* Model & Command Pills */}
        <div className="flex items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-white/10">
          <span
            className="font-mono text-text-muted truncate max-w-[125px] px-1.5 py-0.5 rounded bg-surface-muted/60 border border-border/40 text-[10px]"
            title={data.model}
          >
            {data.model}
          </span>
          <span
            className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
            style={{ color: theme.tint, backgroundColor: `${theme.tint}18` }}
          >
            {data.command}
          </span>
        </div>

        {/* Specialty Tag (for workers or configured nodes) */}
        {data.specialty && (
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-text-muted text-[9px] uppercase tracking-wider font-medium">Specialty:</span>
            <span className="px-1.5 py-0.2 rounded-full bg-surface-muted text-text-main font-mono text-[10px] border border-border/40 truncate">
              {data.specialty}
            </span>
          </div>
        )}

        {/* Directive Preview */}
        {data.systemPrompt && (
          <div
            className="text-[10px] text-text-muted line-clamp-1 italic bg-surface-muted/30 px-1.5 py-0.5 rounded border border-border/20"
            title={data.systemPrompt}
          >
            &quot;{data.systemPrompt}&quot;
          </div>
        )}
      </Plasma>
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  teamNode: React.memo(TeamNodeComponent),
};

const MODEL_PRESETS = [
  "claude-sonnet-4-6",
  "gemini-2.5-pro",
  "deepseek-v3.2",
  "gpt-5-mini",
  "gemini-2.5-flash",
  "gpt-4o",
];

const SPECIALTY_PRESETS = ["backend", "frontend", "fullstack", "security", "tests", "data", "planner"];

// ── Main Component ─────────────────────────────────────────────────────────

export default function TeamPageClient() {
  const [team, setTeam] = useState<TeamConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("omniroute_active_team");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.nodes && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            return parsed;
          }
        }
      } catch {
        // fallback
      }
    }
    return DEFAULT_TEAM_CONFIG;
  });

  const [nodes, setNodes] = useState<Node<TeamNodeData>[]>(() =>
    configNodesToFlow(team.nodes)
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    configConnectionsToFlow(team.connections)
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("agent-1");
  const [linkMode, setLinkMode] = useState<boolean>(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationStep, setSimulationStep] = useState<string | null>(null);

  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const simulationTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronize state changes to localStorage
  useEffect(() => {
    try {
      const updatedTeam: TeamConfig = {
        ...team,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: (n.data.type as TeamNodeType) || "worker",
          name: n.data.name as string,
          model: n.data.model as string,
          command: n.data.command as string,
          specialty: n.data.specialty as string | undefined,
          systemPrompt: n.data.systemPrompt as string | undefined,
          status: n.data.status as NodeStatus,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        })),
        connections: edges.map((e) => ({
          from: e.source,
          to: e.target,
          fromHandle: e.sourceHandle ?? undefined,
          toHandle: e.targetHandle ?? undefined,
        })),
      };
      localStorage.setItem("omniroute_active_team", JSON.stringify(updatedTeam));
    } catch {
      // ignore
    }
  }, [team, nodes, edges]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      simulationTimerRef.current.forEach(clearTimeout);
    };
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId)?.data || null,
    [nodes, selectedNodeId]
  );

  // React Flow Handlers
  const onNodesChange: OnNodesChange<Node<TeamNodeData>> = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const color = sourceNode?.data?.themeColor || "#3b82f6";
      const isReturn =
        (connection.source.includes("memory") && connection.target.includes("agent")) ||
        connection.sourceHandle === "source-bottom";

      const strokeColor = isReturn ? "#a855f7" : color;

      const newEdge: Edge = {
        id: `edge-${connection.source}-${connection.target}-${Date.now().toString().slice(-4)}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: strokeColor,
          strokeWidth: 2.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: strokeColor,
        },
      };

      setEdges((eds) => addEdge(newEdge, eds));
    },
    [nodes]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (linkMode) {
        if (!linkSource) {
          setLinkSource(node.id);
        } else if (linkSource !== node.id) {
          onConnect({
            source: linkSource,
            target: node.id,
            sourceHandle: "source-right",
            targetHandle: "target-left",
          });
          setLinkSource(null);
          setLinkMode(false);
        }
      } else {
        setSelectedNodeId(node.id);
      }
    },
    [linkMode, linkSource, onConnect]
  );

  const addNode = useCallback(
    (type: TeamNodeType) => {
      const typeCount = nodes.filter((n) => n.data.type === type).length + 1;
      const newId = `${type}-${Date.now().toString().slice(-4)}`;
      const theme = NODE_THEMES[type];

      let defaultX = 200;
      let defaultY = 200;
      if (type === "agent") {
        defaultX = 80;
        defaultY = 160 + typeCount * 60;
      } else if (type === "planner") {
        defaultX = 380;
        defaultY = 160 + typeCount * 60;
      } else if (type === "worker") {
        defaultX = 680;
        defaultY = 80 + (typeCount - 1) * 140;
      } else if (type === "memory") {
        defaultX = 980;
        defaultY = 160 + typeCount * 60;
      }

      const rolePrefix =
        type === "agent" ? "Agent" : type === "planner" ? "Boss" : type === "worker" ? "Worker" : "Memory";

      const newNode: Node<TeamNodeData> = {
        id: newId,
        type: "teamNode",
        position: { x: defaultX, y: defaultY },
        data: {
          id: newId,
          type,
          name: `${rolePrefix}-${typeCount}`,
          model: theme.defaultModel,
          command: theme.defaultCommand,
          specialty: type === "worker" ? "general" : undefined,
          systemPrompt: `Directive for ${theme.label}. Execute role according to pipeline instructions.`,
          status: "ready",
          themeColor: theme.tint,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newId);
    },
    [nodes]
  );

  const updateSelectedNode = useCallback(
    (patch: Partial<TeamNodeData>) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === selectedNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            };
          }
          return node;
        })
      );
    },
    [selectedNodeId]
  );

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const duplicateSelectedNode = useCallback(() => {
    if (!selectedNodeId || !selectedNode) return;
    const parentNode = nodes.find((n) => n.id === selectedNodeId);
    const newId = `${selectedNode.type}-${Date.now().toString().slice(-4)}`;
    const newX = (parentNode?.position.x ?? 100) + 40;
    const newY = (parentNode?.position.y ?? 100) + 40;

    const newNode: Node<TeamNodeData> = {
      id: newId,
      type: "teamNode",
      position: { x: newX, y: newY },
      data: {
        ...selectedNode,
        id: newId,
        name: `${selectedNode.name} (Copy)`,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newId);
  }, [selectedNodeId, selectedNode, nodes]);

  const resetToDefault = useCallback(() => {
    setTeam(DEFAULT_TEAM_CONFIG);
    setNodes(configNodesToFlow(DEFAULT_TEAM_CONFIG.nodes));
    setEdges(configConnectionsToFlow(DEFAULT_TEAM_CONFIG.connections));
    setSelectedNodeId("agent-1");
    reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 400 });
  }, []);

  const fitCanvas = useCallback(() => {
    reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 300 });
  }, []);

  const simulatePipeline = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);

    simulationTimerRef.current.forEach(clearTimeout);
    simulationTimerRef.current = [];

    const setNodeStatus = (nodeId: string, status: NodeStatus) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status } } : n))
      );
    };

    // Step 1: Agent Frontline
    setSimulationStep("1. Frontline Agent: Receiving prompt and coordinating...");
    setNodeStatus("agent-1", "running");

    // Step 2: Boss Planner
    const t1 = setTimeout(() => {
      setNodeStatus("agent-1", "active");
      setNodeStatus("boss-1", "running");
      setSimulationStep("2. Boss / Planner: Generating JSON sub-task plan...");
    }, 1200);

    // Step 3: Parallel Workers
    const t2 = setTimeout(() => {
      setNodeStatus("boss-1", "active");
      setNodeStatus("worker-1", "running");
      setNodeStatus("worker-2", "running");
      setSimulationStep("3. Parallel Workers: Executing backend & frontend subtasks...");
    }, 2500);

    // Step 4: Memory / Brain
    const t3 = setTimeout(() => {
      setNodeStatus("worker-1", "active");
      setNodeStatus("worker-2", "active");
      setNodeStatus("memory-1", "running");
      setSimulationStep("4. Memory (Brain): Writing decisions to .brain/brain.json...");
    }, 4200);

    // Step 5: Return to Agent
    const t4 = setTimeout(() => {
      setNodeStatus("memory-1", "active");
      setNodeStatus("agent-1", "running");
      setSimulationStep("5. Loop Return: Frontline Agent synthesizes final integrated response!");
    }, 5600);

    // Step 6: Complete
    const t5 = setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) => ({ ...n, data: { ...n.data, status: "ready" } }))
      );
      setSimulationStep("Pipeline execution complete! Response delivered.");
      setIsSimulating(false);
    }, 7200);

    simulationTimerRef.current = [t1, t2, t3, t4, t5];
  }, [isSimulating]);

  if (!mounted) {
    return (
      <div className="flex h-[calc(100dvh-5.5rem)] min-h-[640px] items-center justify-center p-4">
        <div className="text-sm text-text-muted flex items-center gap-2">
          <Icon name="progress_activity" size={18} className="animate-spin text-primary" />
          Loading Team Orchestrator...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-5.5rem)] min-h-[640px] p-4 gap-3 bg-bg text-text-main">
      {/* Top Bar with Team Identity & Toolbar Actions */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-surface/70 backdrop-blur-md shadow-sm flex-wrap gap-2.5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Icon name="groups" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={team.name}
                onChange={(e) => setTeam((t) => ({ ...t, name: e.target.value }))}
                className="bg-transparent font-bold text-base text-text-main hover:border-b border-border/80 focus:outline-none focus:border-primary transition-colors"
                title="Click to rename team"
              />
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                omniroute/team/{team.slug}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Interactive React Flow / Plasma UI canvas for multi-agent pipeline orchestration.
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-surface-muted/60 p-1 rounded-xl border border-border/50">
            <Button size="sm" variant="secondary" onClick={() => addNode("agent")}>
              + Agent
            </Button>
            <Button size="sm" variant="secondary" onClick={() => addNode("planner")}>
              + Boss
            </Button>
            <Button size="sm" variant="secondary" onClick={() => addNode("worker")}>
              + Worker
            </Button>
            <Button size="sm" variant="secondary" onClick={() => addNode("memory")}>
              + Memory
            </Button>
          </div>

          <Button
            size="sm"
            variant={linkMode ? "default" : "outline"}
            onClick={() => {
              setLinkMode(!linkMode);
              setLinkSource(null);
            }}
          >
            {linkMode
              ? linkSource
                ? "Target [Click Node]..."
                : "Source [Click Node]..."
              : "Link Nodes"}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={simulatePipeline}
            disabled={isSimulating}
          >
            <span className="flex items-center gap-1.5">
              <Icon name="play_arrow" size={14} />
              {isSimulating ? "Running..." : "Simulate"}
            </span>
          </Button>

          <Button size="sm" variant="ghost" onClick={fitCanvas} title="Fit View">
            <Icon name="refresh" size={16} />
          </Button>

          <Button size="sm" variant="ghost" onClick={resetToDefault} title="Reset Pipeline">
            Reset
          </Button>
        </div>
      </div>

      {/* Main Studio Area */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* React Flow / Plasma Canvas Container */}
        <div className="flex-1 relative rounded-2xl border border-border/70 overflow-hidden bg-gradient-to-br from-[#0c0c0e] via-[#141418] to-[#0f1115] shadow-inner">
          <PlasmaProvider mood="tidal" theme="dark" blend={30} viscosity={0.3} elevation={0.3}>
            <ReactFlow
              className="omniroute-flow"
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedNodeId(null)}
              connectionMode={ConnectionMode.Loose}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              onInit={(instance) => {
                reactFlowInstanceRef.current = instance;
              }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={true}
              nodesConnectable={true}
              elementsSelectable={true}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.2}
                color="rgba(255, 255, 255, 0.08)"
              />
              <Controls showInteractive={false} />

              {/* Simulation Status Banner */}
              {simulationStep && (
                <Panel position="top-center">
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface/90 border border-primary/50 text-xs font-medium text-text-main backdrop-blur-md shadow-xl animate-fade-in">
                    <span className="size-2 rounded-full bg-primary animate-ping" />
                    <span>{simulationStep}</span>
                  </div>
                </Panel>
              )}

              {/* Floating Canvas Legend */}
              <Panel position="bottom-left">
                <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-surface/80 border border-border/60 backdrop-blur-md text-[11px] text-text-muted shadow-sm">
                  <span>{nodes.length} Nodes</span>
                  <span>•</span>
                  <span>{edges.length} Connections</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-medium">Pipeline Active</span>
                </div>
              </Panel>
            </ReactFlow>
          </PlasmaProvider>
        </div>

        {/* Inspector Panel on Right */}
        <div className="w-[330px] shrink-0 rounded-2xl border border-border bg-surface/90 p-4 backdrop-blur-md flex flex-col gap-3.5 shadow-xl overflow-y-auto">
          {selectedNode ? (
            <>
              {/* Selected Node Header */}
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="size-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: NODE_THEMES[selectedNode.type]?.tint }}
                  >
                    <Icon name={NODE_THEMES[selectedNode.type]?.icon} size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-text-main truncate block">
                      {selectedNode.name}
                    </span>
                    <span className="text-[10px] text-text-muted capitalize">
                      {NODE_THEMES[selectedNode.type]?.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedNodeId(null)}
                    title="Close Inspector"
                  >
                    <Icon name="close" size={14} />
                  </Button>
                </div>
              </div>

              {/* Node Status Selector */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted">Node Status</label>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  {(["ready", "active", "idle"] as NodeStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => updateSelectedNode({ status: st })}
                      className={`px-2 py-1 text-[11px] rounded-lg border font-medium capitalize transition-all ${
                        selectedNode.status === st
                          ? "bg-primary/15 border-primary text-primary"
                          : "border-border bg-bg text-text-muted hover:border-border/80"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Node Name */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted">Node Label</label>
                <input
                  type="text"
                  value={selectedNode.name}
                  onChange={(e) => updateSelectedNode({ name: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Model Selection */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted">Model ID</label>
                <input
                  type="text"
                  value={selectedNode.model}
                  onChange={(e) => updateSelectedNode({ model: e.target.value })}
                  placeholder="e.g. claude-sonnet-4-6, gpt-4o"
                  className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary transition-colors font-mono"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {MODEL_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateSelectedNode({ model: m })}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-all ${
                        selectedNode.model === m
                          ? "bg-primary/20 text-primary border-primary/40 font-bold"
                          : "bg-surface-muted/60 text-text-muted border-border/40 hover:text-text-main"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Command Trigger */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted">Command Trigger</label>
                <input
                  type="text"
                  value={selectedNode.command}
                  onChange={(e) => updateSelectedNode({ command: e.target.value })}
                  placeholder="/agent, /boss, /worker..."
                  className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary transition-colors font-mono"
                />
              </div>

              {/* Specialty (Worker or configurable) */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted">Specialty</label>
                <input
                  type="text"
                  value={selectedNode.specialty || ""}
                  onChange={(e) => updateSelectedNode({ specialty: e.target.value })}
                  placeholder="e.g. backend, frontend, security, tests"
                  className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary transition-colors"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {SPECIALTY_PRESETS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => updateSelectedNode({ specialty: sp })}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                        selectedNode.specialty === sp
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                          : "bg-surface-muted/60 text-text-muted border-border/40 hover:text-text-main"
                      }`}
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              </div>

              {/* System Directive */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted">System Directive</label>
                <textarea
                  rows={4}
                  value={selectedNode.systemPrompt || ""}
                  onChange={(e) => updateSelectedNode({ systemPrompt: e.target.value })}
                  className="w-full mt-1 p-2 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary transition-colors resize-none"
                  placeholder="Enter specific instructions and behavior directives for this node..."
                />
              </div>

              {/* Node Actions */}
              <div className="pt-2 border-t border-border flex items-center justify-between gap-2 mt-auto">
                <Button size="sm" variant="secondary" onClick={duplicateSelectedNode}>
                  Duplicate
                </Button>
                <Button size="sm" variant="danger" onClick={deleteSelectedNode}>
                  Delete
                </Button>
              </div>
            </>
          ) : (
            /* Team Pipeline Summary when no node is selected */
            <div className="flex flex-col gap-3.5 h-full text-xs">
              <div className="pb-2 border-b border-border">
                <span className="font-bold text-sm text-text-main flex items-center gap-1.5">
                  <Icon name="groups" size={18} />
                  Pipeline Architecture
                </span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Multi-agent team executing at <code className="text-primary font-mono font-semibold">omniroute/team/{team.slug}</code>
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400">
                    <Icon name="smart_toy" size={14} />
                    <span>1. Frontline Agent</span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Receives client prompt, handles single-step requests directly, or invokes the Boss for task planning.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/5">
                  <div className="flex items-center gap-1.5 font-bold text-blue-400">
                    <Icon name="psychology" size={14} />
                    <span>2. Boss / Planner</span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Decomposes complex requests into a structured JSON execution plan with specialized sub-tasks.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <Icon name="terminal" size={14} />
                    <span>3. Parallel Workers</span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Workers execute backend, frontend, security, and logic sub-tasks concurrently with specialized models.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl border border-purple-500/30 bg-purple-500/5">
                  <div className="flex items-center gap-1.5 font-bold text-purple-400">
                    <Icon name="memory" size={14} />
                    <span>4. Memory & Brain</span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Records decisions, task outputs, and architecture learnings to durable knowledge store.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400">
                    <Icon name="refresh" size={14} />
                    <span>5. Return to Frontline Agent</span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Synthesizes worker results into a coherent final response delivered back to client.
                  </p>
                </div>
              </div>

              <div className="mt-auto p-3 rounded-xl border border-border bg-bg flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-text-muted">Canvas Tips</span>
                <ul className="text-[11px] text-text-muted space-y-1 list-disc list-inside">
                  <li>Drag any node to arrange the pipeline layout.</li>
                  <li>Drag from right/bottom handles to connect nodes.</li>
                  <li>Click any node to edit model, directive, and command.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

