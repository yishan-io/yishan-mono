"use client";

import { useEffect, useState } from "react";

type WorkstreamStatus = "running" | "waiting" | "idle";

interface Workstream {
  branch: string;
  label: string;
  status: WorkstreamStatus;
  agent: string;
  changes: string;
  terminal: string[];
  context: string;
}

const workstreams: Workstream[] = [
  {
    branch: "fix/login-bug",
    label: "Bug fix",
    status: "running",
    agent: "Claude",
    changes: "+12 −3",
    terminal: [
      "$ npm test -- auth",
      "● running 4 tests...",
      "  ✓ token refresh",
      "  ✓ session expiry",
      "  ● login redirect",
      "  ● oauth callback",
    ],
    context: "Next: confirm token expiry fix → check oauth redirect flow",
  },
  {
    branch: "refactor/data-layer",
    label: "Refactor",
    status: "waiting",
    agent: "Codex",
    changes: "+89 −41",
    terminal: [
      "$ codex run refactor",
      "⏸ waiting for input",
      "",
      "  Agent needs clarification:",
      "  Keep legacy adapter or",
      "  remove it entirely?",
    ],
    context: "Decision needed: legacy adapter — keep for v1 compat or remove",
  },
  {
    branch: "feat/api-v2",
    label: "Feature",
    status: "idle",
    agent: "Gemini",
    changes: "+204 −17",
    terminal: [
      "$ gemini review --diff",
      "✓ review complete",
      "",
      "  3 suggestions added",
      "  0 blockers found",
      "  Ready to push",
    ],
    context: "Review done — address 3 suggestions, then push and open PR",
  },
];

const statusConfig: Record<WorkstreamStatus, { dot: string; label: string; labelColor: string }> = {
  running: {
    dot: "animate-pulse bg-[#D1B06A]",
    label: "running",
    labelColor: "text-[#D1B06A]",
  },
  waiting: {
    dot: "animate-pulse bg-[#8FCB99]",
    label: "waiting",
    labelColor: "text-[#8FCB99]",
  },
  idle: {
    dot: "bg-[#4A5A4E]",
    label: "idle",
    labelColor: "text-[#4A5A4E]",
  },
};

const terminalLineColor = (line: string): string => {
  if (line.startsWith("$")) return "text-[#8FCB99]";
  if (line.startsWith("●") || line.startsWith("⏸")) return "text-[#D1B06A]";
  if (line.startsWith("✓")) return "text-[#8FCB99]";
  if (line.startsWith("  ✓")) return "text-[#8FCB99]/70";
  if (line.startsWith("  ●")) return "text-[#D1B06A]/70";
  if (line === "") return "text-transparent select-none";
  return "text-[#A5B0A8]";
};

interface Props {
  t: (key: string) => string;
}

export function WorkflowDemo({ t }: Props) {
  const [active, setActive] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  // Auto-cycle every 3s to hint that items are clickable
  useEffect(() => {
    const id = setInterval(() => {
      setTransitioning(true);
      setTimeout(() => {
        setActive((prev) => (prev + 1) % workstreams.length);
        setTransitioning(false);
      }, 150);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  function select(i: number) {
    if (i === active) return;
    setTransitioning(true);
    setTimeout(() => {
      setActive(i);
      setTransitioning(false);
    }, 150);
  }

  const ws = workstreams[active];
  const cfg = statusConfig[ws.status];

  return (
    <section id="workflow" className="mx-auto max-w-7xl px-6 py-6 lg:px-8 lg:py-8">
      <div className="rounded-[36px] border border-[#2A342F] bg-[#121715] px-8 py-10 lg:px-10">
        {/* Header */}
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#A5B0A8]">{t("workflow.label")}</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8ECE8] md:text-4xl">
            {t("workflow.title")}
          </h2>
          <p className="mt-4 text-base leading-8 text-[#A5B0A8]">{t("workflow.desc")}</p>
        </div>

        {/* Interactive demo */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-[#2A342F] bg-[#0D1110]">
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-[#2A342F] px-4 py-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]/50" />
            <span className="ml-2 text-[10px] text-[#4A5A4E]">Yishan — my-project</span>
          </div>

          <div className="flex min-h-[280px]">
            {/* Left sidebar — workspace list */}
            <div className="w-48 shrink-0 border-r border-[#2A342F] p-3">
              <div className="mb-3 px-2 text-[9px] uppercase tracking-[0.18em] text-[#4A5A4E]">Workstreams</div>
              <div className="space-y-1">
                {workstreams.map((w, i) => {
                  const c = statusConfig[w.status];
                  const isActive = i === active;
                  return (
                    <button
                      key={w.branch}
                      type="button"
                      onClick={() => select(i)}
                      className={`w-full rounded-xl px-2 py-2 text-left transition-colors duration-150 ${
                        isActive ? "bg-[#1B2420]" : "hover:bg-[#151B18]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
                        <span className="truncate text-[11px] font-medium text-[#E8ECE8]">{w.label}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between pl-4">
                        <span className="truncate text-[9px] text-[#4A5A4E]">{w.branch}</span>
                        <span className={`text-[9px] ${c.labelColor}`}>{c.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Hint */}
              <div className="mt-4 px-2 text-[9px] text-[#2A342F]">click to switch →</div>
            </div>

            {/* Right pane — active workspace */}
            <div
              className={`flex flex-1 flex-col gap-3 p-4 transition-opacity duration-150 ${
                transitioning ? "opacity-0" : "opacity-100"
              }`}
            >
              {/* Workspace header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                  <span className="text-[12px] font-medium text-[#E8ECE8]">{ws.branch}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[#8FCB99]">{ws.changes.split(" ")[0]}</span>
                  <span className="text-[#FF5F56]/70">{ws.changes.split(" ")[1]}</span>
                  <span className="rounded border border-[#2A342F] px-1.5 py-0.5 text-[#A5B0A8]">{ws.agent}</span>
                </div>
              </div>

              {/* Terminal */}
              <div className="flex-1 rounded-xl border border-[#2A342F] bg-[#080C0A] px-3 py-2.5 font-mono text-[11px]">
                <div className="space-y-0.5">
                  {ws.terminal.map((line, idx) => (
                    <div key={`${ws.branch}-${idx}-${line}`} className={terminalLineColor(line)}>
                      {line || "\u00a0"}
                    </div>
                  ))}
                </div>
              </div>

              {/* Context strip */}
              <div className="rounded-xl border border-[#2A342F] bg-[#0C100E] px-3 py-2 text-[10px]">
                <span className="text-[#4A5A4E]">.my-context / </span>
                <span className="text-[#A5B0A8]">{ws.context}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Steps — below the demo */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((step) => (
            <div key={step} className="flex gap-3">
              <div className="mt-0.5 text-sm font-medium text-[#D1B06A]">{`0${step + 1}`}</div>
              <div>
                <div className="text-sm font-semibold text-[#E8ECE8]">{t(`workflow.${step}.title`)}</div>
                <div className="mt-1 text-xs leading-6 text-[#A5B0A8]">{t(`workflow.${step}.desc`)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
