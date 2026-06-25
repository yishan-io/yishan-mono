"use client";

const workstreams = [
  {
    branch: "fix/login-bug",
    label: "Bug fix",
    status: "running",
    statusColor: "#D1B06A",
    statusDot: "animate-pulse bg-[#D1B06A]",
    terminal: ["$ npm test -- auth", "● 4 tests running..."],
    changes: "+12 −3",
    agent: "Claude",
  },
  {
    branch: "refactor/data-layer",
    label: "Refactor",
    status: "waiting",
    statusColor: "#8FCB99",
    statusDot: "bg-[#8FCB99]",
    terminal: ["$ codex run refactor", "⏸ waiting for input"],
    changes: "+89 −41",
    agent: "Codex",
  },
  {
    branch: "feat/api-v2",
    label: "Feature",
    status: "idle",
    statusColor: "#4A5A4E",
    statusDot: "bg-[#4A5A4E]",
    terminal: ["$ gemini review --diff", "✓ done"],
    changes: "+204 −17",
    agent: "Gemini",
  },
];

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} />;
}

export function SolutionImage() {
  return (
    <div className="mt-10 w-full overflow-hidden">
      {/* Label */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#2A342F]" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#4A5A4E]">one workspace layer</span>
        <div className="h-px flex-1 bg-[#2A342F]" />
      </div>

      {/* Unified workspace window */}
      <div className="overflow-hidden rounded-2xl border border-[#2A342F] bg-[#0F1412] shadow-xl shadow-black/40">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-[#2A342F] px-4 py-2.5">
          <div className="h-2 w-2 rounded-full bg-[#FF5F56]/60" />
          <div className="h-2 w-2 rounded-full bg-[#FFBD2E]/60" />
          <div className="h-2 w-2 rounded-full bg-[#27C93F]/60" />
          <span className="ml-2 text-[10px] text-[#4A5A4E]">Yishan — my-project</span>
        </div>

        <div className="flex">
          {/* Left sidebar — workspace list */}
          <div className="w-44 shrink-0 border-r border-[#2A342F] p-3 space-y-1">
            <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-[#4A5A4E]">Workstreams</div>
            {workstreams.map((ws) => (
              <div
                key={ws.branch}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] ${ws.label === "Bug fix" ? "bg-[#1B2420]" : ""}`}
              >
                <StatusDot className={ws.statusDot} />
                <div className="min-w-0">
                  <div className="truncate font-medium text-[#E8ECE8]">{ws.label}</div>
                  <div className="truncate text-[#4A5A4E]">{ws.branch}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Right pane — active workspace detail */}
          <div className="flex-1 p-3 space-y-2.5">
            {/* Active workspace header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot className="animate-pulse bg-[#D1B06A]" />
                <span className="text-[11px] font-medium text-[#E8ECE8]">fix/login-bug</span>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-[#4A5A4E]">
                <span className="text-[#8FCB99]">+12</span>
                <span className="text-[#FF5F56]/70">−3</span>
                <span className="ml-1 rounded border border-[#2A342F] px-1 py-0.5">Claude</span>
              </div>
            </div>

            {/* Terminal pane */}
            <div className="rounded-lg border border-[#2A342F] bg-[#080C0A] p-2.5 font-mono text-[10px] space-y-0.5">
              <div className="text-[#8FCB99]">$ npm test -- auth</div>
              <div className="text-[#D1B06A]">● 4 tests running...</div>
              <div className="flex items-center gap-1 text-[#4A5A4E]">
                <span className="animate-pulse">▊</span>
              </div>
            </div>

            {/* Context strip */}
            <div className="rounded-lg border border-[#2A342F] bg-[#0C100E] p-2 text-[9px] text-[#A5B0A8]">
              <span className="text-[#4A5A4E]">.my-context /</span> Next: confirm token expiry fix, check refresh flow
            </div>

            {/* Other workstreams — mini status */}
            <div className="flex gap-2">
              {workstreams.slice(1).map((ws) => (
                <div
                  key={ws.branch}
                  className="flex flex-1 items-center gap-1.5 rounded-lg border border-[#2A342F] bg-[#0C100E] px-2 py-1.5 text-[9px]"
                >
                  <StatusDot className={ws.statusDot} />
                  <div className="min-w-0">
                    <div className="truncate text-[#A5B0A8]">{ws.label}</div>
                    <div className="truncate text-[#4A5A4E]">{ws.terminal[1]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom callout */}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-[#4A5A4E]">
        <svg className="h-3 w-3 shrink-0 text-[#8FCB99]" fill="none" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M4 6l1.5 1.5L8 4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Switch to Refactor — terminal, files, and agent session are exactly where you left them.
      </div>
    </div>
  );
}
