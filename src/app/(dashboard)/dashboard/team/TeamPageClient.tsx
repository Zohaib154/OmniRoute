"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { PlasmaProvider, Plasma, PlasmaButton } from "@cruxgarden/plasma-ui";
import Icon from "@/shared/components/Icon";
import Button from "@/shared/components/Button";

interface TeamNode {
  id: string;
  type: "agent" | "planner" | "worker" | "memory";
  name: string;
  model: string;
  command: string;
  specialty?: string;
  systemPrompt?: string;
  x: number;
  y: number;
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

const DEFAULT_TEAM: Team = {
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
      systemPrompt: "You are the frontline agent. Receive user prompts, coordinate execution, and deliver the final integrated response.",
      x: 60,
      y: 160,
    },
    {
      id: "boss-1",
      type: "planner",
      name: "Boss-1 (Planner)",
      model: "gemini-2.5-pro",
      command: "/boss",
      systemPrompt: "Analyze the user prompt and generate an optimal JSON sub-task execution plan.",
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
      systemPrompt: "Record architecture decisions and task learnings to .brain/brain.json.",
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

const NODE_THEMES: Record<string, { label: string; tint: string; ring: string; icon: string }> = {
  agent: { label: "Agent", tint: "#f59e0b", ring: "border-amber-500/60", icon: "support_agent" },
  planner: { label: "Boss / Planner", tint: "#3b82f6", ring: "border-blue-500/60", icon: "psychology" },
  worker: { label: "Worker", tint: "#22c55e", ring: "border-emerald-500/60", icon: "terminal" },
  memory: { label: "Memory", tint: "#a855f7", ring: "border-purple-500/60", icon: "memory" },
};

export default function TeamPageClient() {
  const [team, setTeam] = useState<Team>(DEFAULT_TEAM);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("agent-1");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("omniroute_active_team");
      if (saved) {
        setTeam(JSON.parse(saved));
      }
    } catch {
      // fallback to default
    }
  }, []);

  const saveTeam = (updated: Team) => {
    setTeam(updated);
    try {
      localStorage.setItem("omniroute_active_team", JSON.stringify(updated));
    } catch {}
  };

  const selectedNode = useMemo(
    () => team.nodes.find((n) => n.id === selectedNodeId) || null,
    [team.nodes, selectedNodeId]
  );

  const handleNodeClick = (id: string) => {
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(id);
      } else if (connectFrom !== id) {
        const exists = team.connections.some((c) => c.from === connectFrom && c.to === id);
        if (!exists) {
          saveTeam({
            ...team,
            connections: [...team.connections, { from: connectFrom, to: id }],
          });
        }
        setConnectFrom(null);
        setConnectMode(false);
      }
    } else {
      setSelectedNodeId(id);
    }
  };

  const deleteConnection = (index: number) => {
    const updated = [...team.connections];
    updated.splice(index, 1);
    saveTeam({ ...team, connections: updated });
  };

  const addNode = (type: "agent" | "planner" | "worker" | "memory") => {
    const count = team.nodes.filter((n) => n.type === type).length + 1;
    const id = `${type}-${Date.now().toString().slice(-4)}`;
    const newNode: TeamNode = {
      id,
      type,
      name: `${NODE_THEMES[type].label}-${count}`,
      model: "auto",
      command: `/${type}`,
      x: 100 + team.nodes.length * 35,
      y: 120 + team.nodes.length * 25,
    };
    saveTeam({ ...team, nodes: [...team.nodes, newNode] });
    setSelectedNodeId(id);
  };

  const updateSelectedNode = (patch: Partial<TeamNode>) => {
    if (!selectedNodeId) return;
    saveTeam({
      ...team,
      nodes: team.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n)),
    });
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    saveTeam({
      ...team,
      nodes: team.nodes.filter((n) => n.id !== selectedNodeId),
      connections: team.connections.filter((c) => c.from !== selectedNodeId && c.to !== selectedNodeId),
    });
    setSelectedNodeId(null);
  };

  // Node coordinate lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, TeamNode>();
    team.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [team.nodes]);

  return (
    <div className="flex flex-col h-[calc(100dvh-5.5rem)] min-h-[640px] p-4 gap-3 bg-bg text-text-main">
      {/* Top Bar with Plasma Actions */}
      <div className="flex items-center justify-between p-3 rounded-2xl border border-border bg-surface/70 backdrop-blur-md shadow-sm flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Icon name="groups" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={team.name}
                onChange={(e) => saveTeam({ ...team, name: e.target.value })}
                className="bg-transparent font-bold text-base text-text-main hover:border-b border-border/80 focus:outline-none"
              />
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                omniroute/team/{team.slug}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Multi-model team workflow with Plasma UI visual canvas.
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
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

          <Button
            size="sm"
            variant={connectMode ? "default" : "outline"}
            onClick={() => {
              setConnectMode(!connectMode);
              setConnectFrom(null);
            }}
          >
            {connectMode
              ? connectFrom
                ? `Link to [Click target]...`
                : "Select Source..."
              : "Link Nodes"}
          </Button>
        </div>
      </div>

      {/* Main Studio Area */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* Plasma Canvas Area */}
        <div className="flex-1 relative rounded-2xl border border-border/70 overflow-hidden bg-gradient-to-br from-[#0c0c0e] via-[#141418] to-[#0f1115] shadow-inner">
          <PlasmaProvider mood="tidal" theme="dark" blend={40} viscosity={0.4} elevation={0.4}>
            {/* SVG Connecting Flow Lines & Arrows */}
            <svg className="absolute inset-0 size-full pointer-events-none z-10">
              <defs>
                <marker id="plasma-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6" />
                </marker>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              {team.connections.map((conn, idx) => {
                const src = nodeMap.get(conn.from);
                const dst = nodeMap.get(conn.to);
                if (!src || !dst) return null;

                const x1 = src.x + 100;
                const y1 = src.y + 40;
                const x2 = dst.x + 100;
                const y2 = dst.y + 40;

                const dx = (x2 - x1) / 2;
                const d = `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;

                return (
                  <g key={`${conn.from}-${conn.to}-${idx}`}>
                    <path
                      d={d}
                      stroke="transparent"
                      strokeWidth="18"
                      fill="none"
                      className="pointer-events-auto cursor-pointer"
                      onClick={() => deleteConnection(idx)}
                    >
                      <title>Click to delete connection</title>
                    </path>
                    <path
                      d={d}
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      fill="none"
                      markerEnd="url(#plasma-arrow)"
                      opacity="0.85"
                      filter="url(#glow)"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Render Liquid Plasma Panels for each Node */}
            <div className="absolute inset-0 size-full z-20 pointer-events-auto">
              {team.nodes.map((node) => {
                const info = NODE_THEMES[node.type];
                const isSelected = selectedNodeId === node.id;
                const isConnectSource = connectFrom === node.id;

                return (
                  <div
                    key={node.id}
                    style={{
                      position: "absolute",
                      left: `${node.x}px`,
                      top: `${node.y}px`,
                    }}
                    onClick={() => handleNodeClick(node.id)}
                    className="cursor-pointer select-none"
                  >
                    <Plasma
                      draggable
                      tint={info.tint}
                      frost={0.15}
                      opacity={0.35}
                      radius={18}
                      className={`w-[200px] p-3 rounded-2xl border transition-all ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/40 shadow-lg scale-105"
                          : isConnectSource
                            ? "border-cyan-400 ring-2 ring-cyan-400/50 animate-pulse"
                            : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div
                          className="size-7 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: info.tint }}
                        >
                          <Icon name={info.icon} size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{node.name}</p>
                          <p className="text-[10px] text-text-muted capitalize">{info.label}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/10">
                        <span className="font-mono text-white/80 truncate max-w-[120px]">
                          {node.model}
                        </span>
                        <span className="text-[10px] text-primary font-mono">{node.command}</span>
                      </div>
                    </Plasma>
                  </div>
                );
              })}
            </div>
          </PlasmaProvider>
        </div>

        {/* Node Inspector Panel */}
        {selectedNode && (
          <div className="w-[310px] shrink-0 rounded-2xl border border-border bg-surface/90 p-4 backdrop-blur-md flex flex-col gap-3 shadow-md overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-bold text-sm text-text-main flex items-center gap-1.5">
                <Icon name={NODE_THEMES[selectedNode.type].icon} size={18} />
                {selectedNode.name}
              </span>
              <Button size="sm" variant="danger" onClick={deleteSelectedNode}>
                Delete
              </Button>
            </div>

            <div>
              <label className="text-xs font-semibold text-text-muted">Node Label</label>
              <input
                type="text"
                value={selectedNode.name}
                onChange={(e) => updateSelectedNode({ name: e.target.value })}
                className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-muted">Model ID</label>
              <input
                type="text"
                value={selectedNode.model}
                onChange={(e) => updateSelectedNode({ model: e.target.value })}
                placeholder="e.g. claude-sonnet-4-6, gpt-4o, gemini-2.5-pro"
                className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-muted">Command Trigger</label>
              <input
                type="text"
                value={selectedNode.command}
                onChange={(e) => updateSelectedNode({ command: e.target.value })}
                placeholder="/agent, /boss, /worker..."
                className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary"
              />
            </div>

            {selectedNode.type === "worker" && (
              <div>
                <label className="text-xs font-semibold text-text-muted">Specialty</label>
                <input
                  type="text"
                  value={selectedNode.specialty || ""}
                  onChange={(e) => updateSelectedNode({ specialty: e.target.value })}
                  placeholder="e.g. backend, frontend, security, tests"
                  className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-text-muted">System Directive</label>
              <textarea
                rows={4}
                value={selectedNode.systemPrompt || ""}
                onChange={(e) => updateSelectedNode({ systemPrompt: e.target.value })}
                className="w-full mt-1 p-2 text-xs rounded-lg border border-border bg-bg text-text-main focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
