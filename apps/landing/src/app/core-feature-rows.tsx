"use client";

import { useEffect, useState } from "react";

// ── Visual: Isolated workspaces ────────────────────────────────────────────
// Three workspace cards appearing one by one, each with their own branch/terminal/agent

function IsolatedVisual() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setVisible(1), 800),
      setTimeout(() => setVisible(2), 1600),
      setTimeout(() => setVisible(3), 2400),
    ];
    // Loop
    const loop = setInterval(() => {
      setVisible(0);
      setTimeout(() => setVisible(1), 800);
      setTimeout(() => setVisible(2), 1600);
      setTimeout(() => setVisible(3), 2400);
    }, 6000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(loop);
    };
  }, []);

  const workspaces = [
    { branch: "fix/login-bug", agent: "Claude", status: "running", statusColor: "#D1B06A", changes: "+12 −3" },
    { branch: "refactor/data-layer", agent: "Codex", status: "waiting", statusColor: "#8FCB99", changes: "+89 −41" },
    { branch: "feat/api-v2", agent: "Gemini", status: "running", statusColor: "#D1B06A", changes: "+204 −17" },
  ];

  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 p-8">
      {/* Create button */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 items-center gap-1.5 rounded-lg border border-[#8FCB99]/30 bg-[#8FCB99]/10 px-3 text-[11px] font-medium text-[#8FCB99]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <line x1="6" y1="2" x2="6" y2="10" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="6" x2="10" y2="6" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New workspace
        </div>
        <span className="text-[10px] text-[#4A5A4E]">each task gets its own branch</span>
      </div>

      {/* Workspace cards appearing */}
      {workspaces.map((ws, i) => (
        <div
          key={ws.branch}
          className="rounded-2xl border border-[#2A342F] bg-[#0F1412] p-4 transition-all duration-500"
          style={{
            opacity: visible > i ? 1 : 0,
            transform: visible > i ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                  style={{ background: ws.statusColor }}
                />
                <span
                  className="relative inline-flex h-2.5 w-2.5 rounded-full"
                  style={{ background: ws.statusColor }}
                />
              </span>
              <span className="text-[12px] font-medium text-[#E8ECE8]">{ws.branch}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-[#8FCB99]">{ws.changes.split(" ")[0]}</span>
              <span className="text-[#FF5F56]/70">{ws.changes.split(" ")[1]}</span>
              <span className="rounded border border-[#2A342F] px-1.5 py-0.5 text-[#A5B0A8]">{ws.agent}</span>
              <span style={{ color: ws.statusColor }} className="text-[10px]">
                {ws.status}
              </span>
            </div>
          </div>
          {/* Mini terminal line */}
          <div className="mt-2 rounded-lg bg-[#080C0A] px-3 py-1.5 font-mono text-[10px] text-[#8FCB99]">
            {i === 0 && "$ npm test -- auth"}
            {i === 1 && "$ codex run refactor"}
            {i === 2 && "$ gemini review --diff"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Visual: Live status ────────────────────────────────────────────────────
// A monitoring dashboard with status changes cycling in real time

type WStatus = "running" | "waiting" | "done" | "failed";

const STATUS_META: Record<WStatus, { color: string; label: string; pulse: boolean }> = {
  running: { color: "#D1B06A", label: "running", pulse: true },
  waiting: { color: "#8FCB99", label: "waiting", pulse: true },
  done: { color: "#8FCB99", label: "done", pulse: false },
  failed: { color: "#FF5F56", label: "failed", pulse: false },
};

const STATUS_PHASES: WStatus[][] = [
  ["running", "waiting", "done", "running"],
  ["running", "done", "running", "waiting"],
  ["done", "running", "waiting", "failed"],
  ["waiting", "running", "done", "running"],
];

function LiveStatusVisual() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % STATUS_PHASES.length), 2000);
    return () => clearInterval(id);
  }, []);

  const items = [
    { branch: "fix/login-bug", agent: "Claude", changes: "+12 −3" },
    { branch: "refactor/data-layer", agent: "Codex", changes: "+89 −41" },
    { branch: "feat/api-v2", agent: "Gemini", changes: "+204 −17" },
    { branch: "chore/deps-update", agent: "Claude", changes: "+8 −8" },
  ];

  const statuses = STATUS_PHASES[phase];

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 p-8">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#4A5A4E]">All workstreams</div>
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#D1B06A]" />
            <span className="text-[#4A5A4E]">{statuses.filter((s) => s === "running").length} running</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#8FCB99]" />
            <span className="text-[#4A5A4E]">{statuses.filter((s) => s === "waiting").length} waiting</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#8FCB99]" />
            <span className="text-[#4A5A4E]">{statuses.filter((s) => s === "done").length} done</span>
          </div>
        </div>
      </div>

      {items.map((item, i) => {
        const s = statuses[i];
        const meta = STATUS_META[s];
        return (
          <div
            key={item.branch}
            className="flex items-center gap-3 rounded-2xl border border-[#2A342F] bg-[#0F1412] px-4 py-3 transition-all duration-500"
          >
            {/* Status dot */}
            <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              {meta.pulse && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                  style={{ background: meta.color }}
                />
              )}
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-500"
                style={{ background: meta.color }}
              />
            </span>

            {/* Branch */}
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#E8ECE8]">{item.branch}</span>

            {/* Changes */}
            <span className="text-[10px] text-[#8FCB99]">{item.changes.split(" ")[0]}</span>
            <span className="text-[10px] text-[#FF5F56]/70">{item.changes.split(" ")[1]}</span>

            {/* Agent */}
            <span className="rounded border border-[#2A342F] px-1.5 py-0.5 text-[9px] text-[#A5B0A8]">
              {item.agent}
            </span>

            {/* Status label */}
            <span
              className="min-w-[48px] text-right text-[10px] transition-colors duration-500"
              style={{ color: meta.color }}
            >
              {meta.label}
            </span>
          </div>
        );
      })}

      {/* Notification toast popping */}
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#2A342F] bg-[#151B18] px-3 py-2 text-[10px]">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill="#8FCB99" opacity="0.15" />
          <path
            d="M4 6 L5.5 7.5 L8 4.5"
            stroke="#8FCB99"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[#A5B0A8]">refactor/data-layer</span>
        <span className="text-[#8FCB99]">just finished</span>
        <span className="text-[#4A5A4E]">· 3s ago</span>
      </div>
    </div>
  );
}

// ── Visual: Resume in seconds ──────────────────────────────────────────────
// Before/after: dim "left 2h ago" snapping to full live state

function ResumeVisual() {
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    function cycle() {
      setResumed(false);
      const show = setTimeout(() => setResumed(true), 1500);
      const hide = setTimeout(cycle, 5500);
      return [show, hide];
    }
    const timers = cycle();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 p-8">
      {/* Time away badge */}
      <div className="mb-1 flex items-center gap-2">
        <div
          className="rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all duration-700"
          style={{
            background: resumed ? "rgba(143,203,153,0.1)" : "rgba(74,90,78,0.2)",
            border: resumed ? "1px solid rgba(143,203,153,0.3)" : "1px solid rgba(42,52,47,1)",
            color: resumed ? "#8FCB99" : "#4A5A4E",
          }}
        >
          {resumed ? "Back — everything is still live" : "Switched to something else 2h ago"}
        </div>
      </div>

      {/* Terminal */}
      <div
        className="rounded-2xl border border-[#2A342F] bg-[#0F1412] p-4 transition-all duration-700"
        style={{ opacity: resumed ? 1 : 0.35 }}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: resumed ? "#27C93F" : "#4A5A4E" }} />
          <span className="text-[9px] text-[#4A5A4E]">Terminal — fix/login-bug</span>
        </div>
        <div className="space-y-0.5 font-mono text-[10px]">
          <div className="text-[#8FCB99]">$ npm test -- auth</div>
          <div style={{ color: resumed ? "#D1B06A" : "#4A5A4E" }}>● 4 tests running...</div>
          <div style={{ color: resumed ? "#8FCB99" : "#4A5A4E" }}> ✓ token refresh</div>
          <div style={{ color: resumed ? "#8FCB99" : "#4A5A4E" }}> ✓ session expiry</div>
          {resumed && (
            <div className="flex items-center gap-1 text-[#4A5A4E]">
              <span className="animate-pulse">▊</span>
            </div>
          )}
        </div>
      </div>

      {/* Files */}
      <div
        className="rounded-2xl border border-[#2A342F] bg-[#0F1412] px-4 py-3 transition-all duration-700"
        style={{ opacity: resumed ? 1 : 0.35 }}
      >
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 text-[#A5B0A8]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect
                x="2"
                y="1"
                width="8"
                height="10"
                rx="1.5"
                stroke={resumed ? "#8FCB99" : "#4A5A4E"}
                strokeWidth="1"
              />
              <line
                x1="4"
                y1="4"
                x2="8"
                y2="4"
                stroke={resumed ? "#8FCB99" : "#4A5A4E"}
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.5"
              />
              <line
                x1="4"
                y1="6"
                x2="7"
                y2="6"
                stroke={resumed ? "#8FCB99" : "#4A5A4E"}
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>
            3 files open
          </div>
          <span className="text-[#8FCB99]" style={{ opacity: resumed ? 1 : 0 }}>
            unsaved changes preserved
          </span>
        </div>
      </div>

      {/* Context */}
      <div
        className="rounded-2xl border border-[#2A342F] bg-[#0F1412] px-4 py-3 transition-all duration-700"
        style={{ opacity: resumed ? 1 : 0.35 }}
      >
        <div className="text-[10px]">
          <span className="text-[#4A5A4E]">.my-context / </span>
          <span style={{ color: resumed ? "#A5B0A8" : "#4A5A4E" }} className="transition-colors duration-700">
            Next: confirm token expiry fix → check oauth redirect flow
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Visual: .my-context shared across workspaces ──────────────────────────
// Two workspaces reading from the same .my-context folder —
// a note written in one appears instantly in the other

function MyContextVisual() {
  const [activeWorkspace, setActiveWorkspace] = useState(0);
  const [noteVisible, setNoteVisible] = useState(false);

  useEffect(() => {
    // Show note after short delay, then cycle workspace
    const t1 = setTimeout(() => setNoteVisible(true), 1000);
    const t2 = setTimeout(() => setActiveWorkspace(1), 3000);
    const t3 = setTimeout(() => {
      // Reset and loop
      setActiveWorkspace(0);
      setNoteVisible(false);
      setTimeout(() => setNoteVisible(true), 1000);
      setTimeout(() => setActiveWorkspace(1), 3000);
    }, 7000);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  const workspaces = [
    { branch: "fix/login-bug", label: "Bug fix" },
    { branch: "refactor/data-layer", label: "Refactor" },
  ];

  const notes = [
    { file: "auth.md", content: "Auth flow needs review before merge — token refresh has edge case on expiry" },
    { file: "notes.md", content: "Data layer refactor: keep legacy adapter for v1 compat, remove in v2" },
    { file: "handoff.md", content: "PR ready to review — ask Alice to check the session middleware changes" },
  ];

  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 p-8">
      {/* Workspace tabs */}
      <div className="flex gap-2">
        {workspaces.map((ws, i) => (
          <button
            key={ws.branch}
            type="button"
            onClick={() => setActiveWorkspace(i)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] transition-all duration-300"
            style={{
              background: activeWorkspace === i ? "#1B2420" : "transparent",
              border: activeWorkspace === i ? "1px solid rgba(143,203,153,0.3)" : "1px solid rgba(42,52,47,0.5)",
              color: activeWorkspace === i ? "#E8ECE8" : "#4A5A4E",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: activeWorkspace === i ? "#8FCB99" : "#4A5A4E" }}
            />
            {ws.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-[10px] text-[#4A5A4E]">
          <span className="font-mono">.my-context/</span>
          <span>shared</span>
        </div>
      </div>

      {/* .my-context folder contents */}
      <div className="rounded-2xl border border-[#2A342F] bg-[#0F1412] p-4">
        <div className="mb-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M2 4.5 C2 3.4 2.9 2.5 4 2.5 H6 L7 4 H11 C12.1 4 13 4.9 13 6 V10 C13 11.1 12.1 12 11 12 H3 C1.9 12 1 11.1 1 10 V4.5Z"
              stroke="#D1B06A"
              strokeWidth="1.1"
              fill="none"
            />
          </svg>
          <span className="font-mono text-[10px] text-[#D1B06A]">.my-context/</span>
          <span className="text-[9px] text-[#4A5A4E]">visible in all workspaces</span>
        </div>

        <div className="space-y-2">
          {notes.map((note, i) => (
            <div
              key={note.file}
              className="rounded-xl bg-[#0A0E0C] px-3 py-2.5 transition-all duration-500"
              style={{
                opacity: noteVisible || i < 2 ? 1 : 0,
                transform: noteVisible || i < 2 ? "translateY(0)" : "translateY(4px)",
              }}
            >
              <div className="flex items-center gap-2 text-[10px]">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="8" height="8" rx="1" stroke="#8FCB99" strokeWidth="1" opacity="0.5" />
                  <line
                    x1="3"
                    y1="3.5"
                    x2="7"
                    y2="3.5"
                    stroke="#8FCB99"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                    opacity="0.5"
                  />
                  <line
                    x1="3"
                    y1="5.5"
                    x2="6"
                    y2="5.5"
                    stroke="#8FCB99"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                    opacity="0.5"
                  />
                </svg>
                <span className="font-mono text-[#8FCB99]">{note.file}</span>
                {i === 2 && noteVisible && (
                  <span className="ml-auto rounded-full bg-[#D1B06A]/15 px-1.5 py-0.5 text-[9px] text-[#D1B06A]">
                    just written
                  </span>
                )}
              </div>
              <div className="mt-1 pl-4 text-[10px] leading-5 text-[#4A5A4E]">{note.content}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Active workspace picking up the note */}
      <div
        className="rounded-2xl border px-4 py-3 transition-all duration-700"
        style={{
          borderColor: activeWorkspace === 1 ? "rgba(209,176,106,0.3)" : "rgba(42,52,47,1)",
          background: activeWorkspace === 1 ? "rgba(209,176,106,0.05)" : "#0F1412",
        }}
      >
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#4A5A4E]">{workspaces[activeWorkspace].branch}</span>
          {activeWorkspace === 1 && <span className="text-[#D1B06A]">reading shared context</span>}
        </div>
        <div
          className="mt-1.5 text-[11px] leading-5 transition-colors duration-700"
          style={{ color: activeWorkspace === 1 ? "#A5B0A8" : "#4A5A4E" }}
        >
          {activeWorkspace === 1
            ? "↑ Data layer refactor: keep legacy adapter for v1 compat..."
            : "switch workspace to see shared context →"}
        </div>
      </div>
    </div>
  );
}

// ── Visual: Skills ─────────────────────────────────────────────────────────

const SKILLS = [
  { name: "code review", icon: "CR" },
  { name: "test generation", icon: "TG" },
  { name: "refactoring", icon: "RF" },
  { name: "PR checklist", icon: "PR" },
];

function SkillsVisual() {
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    function cycle() {
      setActive(null);
      const timers = [0, 1, 2, 3].map((i) => setTimeout(() => setActive(i), 600 + i * 1000));
      const next = setTimeout(cycle, 6500);
      return [...timers, next];
    }
    const timers = cycle();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 p-8">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#4A5A4E]">Skill templates</div>
        <span className="rounded border border-[#2A342F] px-1.5 py-0.5 text-[9px] text-[#A5B0A8]">
          {SKILLS.length} available
        </span>
      </div>

      {SKILLS.map((skill, i) => (
        <div
          key={skill.name}
          className="rounded-2xl border bg-[#0F1412] p-3 transition-all duration-500"
          style={{
            opacity: active === i ? 1 : 0.4,
            borderColor: active === i ? "rgba(143,203,153,0.3)" : "rgba(42,52,47,1)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#2A342F] bg-[#151B18] text-[9px] font-medium transition-colors duration-500"
              style={{ color: active === i ? "#8FCB99" : "#4A5A4E" }}
            >
              {skill.icon}
            </div>
            <span className="flex-1 text-[11px] font-medium text-[#A5B0A8]">{skill.name}</span>
            {active === i && (
              <span className="shrink-0 rounded-full bg-[#8FCB99]/10 px-2 py-0.5 text-[9px] text-[#8FCB99]">
                applied
              </span>
            )}
          </div>
        </div>
      ))}

      <div className="mt-1 rounded-xl border border-[#2A342F] bg-[#0A0E0C] px-3 py-2 text-[10px]">
        <span className="text-[#4A5A4E]">Workspace · </span>
        <span className="text-[#A5B0A8]">
          {active !== null ? `following ${SKILLS[active].name} rules` : "select a skill to apply →"}
        </span>
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

interface Props {
  t: (key: string) => string;
}

const rows = [
  { visual: <IsolatedVisual />, titleKey: "features.0.title", descKey: "features.0.desc" },
  { visual: <MyContextVisual />, titleKey: "features.1.title", descKey: "features.1.desc" },
  { visual: <SkillsVisual />, titleKey: "features.2.title", descKey: "features.2.desc" },
];

export function CoreFeatureRows({ t }: Props) {
  return (
    <div className="mt-10 space-y-6">
      {rows.map((row, i) => {
        const isEven = i % 2 === 0;
        const content = (
          <div className="flex flex-col justify-center px-2 py-6 lg:px-8">
            <h3 className="text-2xl font-semibold leading-8 text-[#E8ECE8]">{t(row.titleKey)}</h3>
            <p className="mt-4 text-base leading-8 text-[#A5B0A8]">{t(row.descKey)}</p>
          </div>
        );
        const visual = (
          <div className="min-h-[320px] overflow-hidden rounded-[28px] border border-[#2A342F] bg-[#0D1110]">
            {row.visual}
          </div>
        );

        return (
          <div key={row.titleKey} className="grid gap-4 overflow-hidden rounded-[28px] lg:grid-cols-2">
            {isEven ? (
              <>
                <div className="lg:order-1">{visual}</div>
                <div className="lg:order-2">{content}</div>
              </>
            ) : (
              <>
                <div className="lg:order-2">{visual}</div>
                <div className="lg:order-1">{content}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
