// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("@xyflow/react", async () => {
  const actual = (await vi.importActual("@xyflow/react")) as Record<string, unknown>;
  return {
    ...actual,
    ReactFlow: ({ children, nodes, nodeTypes }: any) => (
      <div data-testid="react-flow-mock">
        {nodes?.map((n: any) => {
          const NodeComp = nodeTypes?.[n.type] || nodeTypes?.teamNode;
          return NodeComp ? <NodeComp key={n.id} id={n.id} data={n.data} selected={false} /> : null;
        })}
        {children}
      </div>
    ),
    Controls: () => <div data-testid="react-flow-controls" />,
    Background: () => <div data-testid="react-flow-background" />,
    Panel: ({ children, position }: any) => <div data-panel={position}>{children}</div>,
    Handle: ({ position, id }: any) => <div data-handle={position} data-handle-id={id} />,
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    ConnectionMode: { Loose: "loose", Strict: "strict" },
    MarkerType: { ArrowClosed: "arrowclosed" },
    applyNodeChanges: (_changes: any, nodes: any) => nodes,
    applyEdgeChanges: (_changes: any, edges: any) => edges,
    addEdge: (edge: any, edges: any) => [...edges, edge],
  };
});

vi.mock("@cruxgarden/plasma-ui", () => ({
  PlasmaProvider: ({ children }: any) => <div data-testid="plasma-provider">{children}</div>,
  Plasma: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

import TeamPageClient, { NODE_THEMES } from "@/app/(dashboard)/dashboard/team/TeamPageClient";

function render(el: React.ReactElement) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  const root = createRoot(c);
  act(() => root.render(el));
  return {
    c,
    cleanup: () => {
      act(() => root.unmount());
      c.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("TeamPageClient Orchestrator Component", () => {
  it("defines complete themes for frontline agent, boss/planner, worker, and memory", () => {
    expect(NODE_THEMES.agent).toBeDefined();
    expect(NODE_THEMES.planner).toBeDefined();
    expect(NODE_THEMES.worker).toBeDefined();
    expect(NODE_THEMES.memory).toBeDefined();

    expect(NODE_THEMES.agent.label).toContain("Frontline");
    expect(NODE_THEMES.planner.label).toContain("Boss");
    expect(NODE_THEMES.worker.label).toContain("Worker");
    expect(NODE_THEMES.memory.label).toContain("Memory");
  });

  it("renders the team canvas with default pipeline nodes and toolbar", () => {
    const { c, cleanup } = render(<TeamPageClient />);

    // Header and team identity
    const nameInput = c.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput?.value).toBe("Multi-Agent Engineering Team");
    expect(c.textContent).toContain("omniroute/team/dev-team");

    // Toolbar actions
    expect(c.textContent).toContain("+ Agent");
    expect(c.textContent).toContain("+ Boss");
    expect(c.textContent).toContain("+ Worker");
    expect(c.textContent).toContain("+ Memory");
    expect(c.textContent).toContain("Link Nodes");
    expect(c.textContent).toContain("Simulate");

    // Default pipeline nodes rendered on canvas
    expect(c.textContent).toContain("Agent-1 (Frontline)");
    expect(c.textContent).toContain("Boss-1 (Planner)");
    expect(c.textContent).toContain("Worker-1 (Backend)");
    expect(c.textContent).toContain("Worker-2 (Frontend)");
    expect(c.textContent).toContain("Memory-1 (Brain)");

    cleanup();
  });

  it("renders inspector panel with node details and editing capabilities", () => {
    const { c, cleanup } = render(<TeamPageClient />);

    // Initially agent-1 is selected
    expect(c.textContent).toContain("Node Label");
    expect(c.textContent).toContain("Model ID");
    expect(c.textContent).toContain("Command Trigger");
    expect(c.textContent).toContain("System Directive");
    expect(c.textContent).toContain("Duplicate");
    expect(c.textContent).toContain("Delete");

    cleanup();
  });

  it("supports adding a new node to the orchestrator pipeline", () => {
    const { c, cleanup } = render(<TeamPageClient />);

    const buttons = Array.from(c.querySelectorAll("button"));
    const addWorkerBtn = buttons.find((b) => b.textContent?.includes("+ Worker"));
    expect(addWorkerBtn).toBeTruthy();

    act(() => {
      addWorkerBtn?.click();
    });

    // Should now have Worker-3 in the pipeline
    expect(c.textContent).toContain("Worker-3");

    cleanup();
  });

  it("updates node attributes through the inspector form inputs", () => {
    const { c, cleanup } = render(<TeamPageClient />);

    const inputs = Array.from(c.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const nodeLabelInput = inputs.find((i) => i.value === "Agent-1 (Frontline)");
    expect(nodeLabelInput).toBeTruthy();

    act(() => {
      if (nodeLabelInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(nodeLabelInput, "Lead Orchestrator Alpha");
        nodeLabelInput.dispatchEvent(new Event("input", { bubbles: true }));
        nodeLabelInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(c.textContent).toContain("Lead Orchestrator Alpha");

    cleanup();
  });
});
