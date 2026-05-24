"use client";

import { useEffect, useState } from "react";

// ── Visual: Voice input ────────────────────────────────────────────────────

function VoiceVisual() {
  const bars = [3, 6, 9, 14, 20, 26, 20, 14, 9, 6, 3];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-5">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-32 w-32 animate-ping rounded-full bg-[#8FCB99]/5" />
        <div className="absolute h-24 w-24 rounded-full border border-[#8FCB99]/20 bg-[#8FCB99]/5" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[#8FCB99]/40 bg-[#151B18]">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="9" y="3" width="10" height="14" rx="5" stroke="#8FCB99" strokeWidth="1.5" />
            <path d="M5 14 C5 20 23 20 23 14" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <line x1="14" y1="20" x2="14" y2="24" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="10" y1="24" x2="18" y2="24" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-[#8FCB99]"
            style={{
              height: `${h}px`,
              opacity: 0.4 + (h / 26) * 0.6,
              animation: `wave ${0.8 + (i % 3) * 0.2}s ease-in-out ${i * 0.07}s infinite alternate`,
            }}
          />
        ))}
      </div>
      <div className="w-full max-w-xs rounded-2xl border border-[#2A342F] bg-[#0F1412] px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#4A5A4E]">Transcribing...</div>
        <div className="mt-2 text-sm text-[#A5B0A8]">
          "Review the auth changes and open a PR against main"
          <span className="ml-1 inline-block h-3.5 w-0.5 animate-pulse bg-[#8FCB99] align-middle" />
        </div>
      </div>
      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.6); }
        }
      `}</style>
    </div>
  );
}

// ── Visual: PR status ──────────────────────────────────────────────────────

function PRVisual() {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 p-4">
      <div className="rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#8FCB99]/40 bg-[#8FCB99]/10 px-2 py-0.5 text-[10px] font-medium text-[#8FCB99]">Open</span>
              <span className="text-sm font-semibold text-[#E8ECE8]">feat: agent session persistence</span>
            </div>
            <div className="mt-1.5 text-[11px] text-[#4A5A4E]">
              fix/login-bug → main · opened 2h ago · <span className="text-[#A5B0A8]">zhex</span>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#4A5A4E]">Checks</div>
          {[
            { name: "Build",           status: "pass"    },
            { name: "Unit tests (148)",status: "pass"    },
            { name: "Type check",      status: "pass"    },
            { name: "E2E",             status: "running" },
          ].map((c) => (
            <div key={c.name} className="flex items-center gap-2.5">
              {c.status === "pass" && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" fill="#8FCB99" opacity="0.15" />
                  <path d="M4.5 7 L6.2 8.8 L9.5 5.5" stroke="#8FCB99" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {c.status === "running" && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
                  <circle cx="7" cy="7" r="5.5" stroke="#D1B06A" strokeWidth="1.3" strokeDasharray="8 6" />
                </svg>
              )}
              <span className="text-[11px] text-[#A5B0A8]">{c.name}</span>
              {c.status === "running" && <span className="text-[10px] text-[#D1B06A]">running...</span>}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-[#4A5A4E]">Reviewers</div>
            <div className="flex -space-x-1.5">
              {["A", "B"].map((l) => (
                <div key={l} className="flex h-5 w-5 items-center justify-center rounded-full border border-[#121715] bg-[#1B2420] text-[9px] font-medium text-[#8FCB99]">{l}</div>
              ))}
            </div>
            <span className="text-[10px] text-[#D1B06A]">1 approved</span>
          </div>
          <div className="rounded-lg border border-[#8FCB99]/30 bg-[#8FCB99]/10 px-3 py-1 text-[11px] font-medium text-[#8FCB99]">
            Merge when ready
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-[#2A342F] bg-[#0F1412] px-4 py-3">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 text-[#A5B0A8]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="3" cy="3" r="2" stroke="#8FCB99" strokeWidth="1" />
              <circle cx="9" cy="9" r="2" stroke="#8FCB99" strokeWidth="1" />
              <path d="M3 5 C3 8 9 4 9 7" stroke="#8FCB99" strokeWidth="1" fill="none" />
            </svg>
            fix/login-bug
          </div>
          <span className="text-[#8FCB99]">+12</span>
          <span className="text-[#FF5F56]/70">−3</span>
          <span className="text-[#4A5A4E]">2 commits ahead of main</span>
        </div>
      </div>
    </div>
  );
}

// ── Visual: Team collaboration ─────────────────────────────────────────────
// Animation: workstream statuses cycle through states every few seconds
// simulating live team activity

type WsStatus = "running" | "waiting" | "idle" | "done";

const STATUS_CYCLE: WsStatus[][] = [
  // [Z,        A,         M       ]
  ["running", "waiting", "idle"   ],
  ["running", "done",    "running"],
  ["waiting", "running", "running"],
  ["done",    "running", "waiting"],
];

const STATUS_COLOR: Record<WsStatus, string> = {
  running: "#D1B06A",
  waiting: "#8FCB99",
  idle:    "#4A5A4E",
  done:    "#8FCB99",
};

const STATUS_PULSE: Record<WsStatus, boolean> = {
  running: true,
  waiting: true,
  idle:    false,
  done:    false,
};

function TeamVisual() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => (p + 1) % STATUS_CYCLE.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const statuses = STATUS_CYCLE[phase];
  const members = [
    { user: "Z", branch: "fix/login-bug",       status: statuses[0] },
    { user: "A", branch: "feat/dashboard",      status: statuses[1] },
    { user: "M", branch: "refactor/data-layer", status: statuses[2] },
  ];
  const activeCount = statuses.filter((s) => s === "running" || s === "waiting").length;

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 p-4">
      <div className="rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-[#E8ECE8]">my-project</div>
          <div className="flex items-center gap-1.5">
            <div className="text-[10px] text-[#4A5A4E]">
              {activeCount} member{activeCount !== 1 ? "s" : ""} active
            </div>
            <div className="flex -space-x-1">
              {members.map((m, i) => (
                <div
                  key={m.user}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0F1412] text-[9px] font-semibold transition-all duration-500"
                  style={{
                    background: m.status === "idle" ? "#151B18" : "#1B2420",
                    color: m.status === "idle" ? "#4A5A4E" : "#8FCB99",
                    boxShadow: m.status === "running"
                      ? "0 0 0 2px rgba(209,176,106,0.35)"
                      : m.status === "waiting"
                      ? "0 0 0 2px rgba(143,203,153,0.25)"
                      : "none",
                  }}
                >
                  {m.user}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {members.map((w) => {
            const color = STATUS_COLOR[w.status];
            const pulse = STATUS_PULSE[w.status];
            return (
              <div
                key={w.branch}
                className="flex items-center gap-2.5 rounded-xl bg-[#0A0E0C] px-3 py-2 transition-all duration-500"
              >
                {/* Status dot — pulsing when active */}
                <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                  {pulse && (
                    <span
                      className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                      style={{ background: color }}
                    />
                  )}
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full transition-colors duration-500"
                    style={{ background: color }}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-[#A5B0A8]">{w.branch}</span>
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1B2420] text-[9px] font-semibold text-[#8FCB99]">
                  {w.user}
                </div>
                <span
                  className="min-w-[40px] text-right text-[10px] transition-colors duration-500"
                  style={{ color }}
                >
                  {w.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#2A342F] bg-[#0F1412] px-4 py-3">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 text-[#A5B0A8]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="3" width="10" height="6" rx="1.5" stroke="#8FCB99" strokeWidth="1" />
              <circle cx="3.5" cy="6" r="0.8" fill="#8FCB99" />
              <circle cx="6" cy="6" r="0.8" fill="#8FCB99" opacity="0.5" />
            </svg>
            dev-server-01
          </div>
          <span className="rounded-full border border-[#8FCB99]/30 bg-[#8FCB99]/10 px-2 py-0.5 text-[10px] text-[#8FCB99]">
            Shared host
          </span>
          <span className="text-[#4A5A4E]">3 workspaces</span>
        </div>
      </div>
    </div>
  );
}

// ── Visual: Autopilot ──────────────────────────────────────────────────────
// Animation: countdown ticks down every second; new run fades in at top of log

const JOBS = [
  { name: "Weekly summary",   cron: "0 6 * * MON", initialSecs: 5 * 3600 + 14 * 60, agent: "Claude" },
  { name: "Dependency audit", cron: "0 6 * * *",   initialSecs: 18 * 3600 + 22 * 60, agent: "Codex"  },
];

function formatCountdown(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${s}s`;
  return `in ${s}s`;
}

type RunEntry = { label: string; status: "pass" | "fail"; time: string; fresh?: boolean };

const INITIAL_RUNS: RunEntry[] = [
  { label: "Weekly summary · 2m 14s",    status: "pass", time: "Today 06:00"     },
  { label: "Dep audit · 48s",            status: "pass", time: "Today 06:00"     },
  { label: "Weekly summary · 1m 58s",    status: "pass", time: "Yesterday 06:00" },
  { label: "Dep audit · timed out",      status: "fail", time: "Yesterday 06:00" },
];

function AutopilotVisual() {
  const [countdowns, setCountdowns] = useState(JOBS.map((j) => j.initialSecs));
  const [runs, setRuns] = useState<RunEntry[]>(INITIAL_RUNS);

  // Tick countdowns every second
  useEffect(() => {
    const id = setInterval(() => {
      setCountdowns((prev) => prev.map((s) => (s > 0 ? s - 1 : s)));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Simulate a new run completing every 8s — fade it in at top of log
  useEffect(() => {
    const templates: RunEntry[] = [
      { label: "Weekly summary · 2m 06s", status: "pass", time: "Just now" },
      { label: "Dep audit · 51s",         status: "pass", time: "Just now" },
      { label: "Weekly summary · 1m 44s", status: "pass", time: "Just now" },
    ];
    let idx = 0;
    const id = setInterval(() => {
      const entry: RunEntry = { ...templates[idx % templates.length], fresh: true };
      setRuns((prev) => [entry, ...prev.slice(0, 3)]);
      // Remove fresh flag after animation
      setTimeout(() => {
        setRuns((prev) => prev.map((r, i) => (i === 0 ? { ...r, fresh: false } : r)));
      }, 800);
      idx++;
    }, 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 p-4">
      {/* Scheduled jobs */}
      <div className="rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3">
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#4A5A4E]">Scheduled jobs</div>
        <div className="space-y-2">
          {JOBS.map((job, i) => (
            <div key={job.name} className="flex items-center justify-between rounded-xl bg-[#0A0E0C] px-3 py-2.5">
              <div>
                <div className="text-[11px] font-medium text-[#E8ECE8]">{job.name}</div>
                <div className="mt-0.5 font-mono text-[10px] text-[#4A5A4E]">{job.cron}</div>
              </div>
              <div className="text-right">
                <div className="tabular-nums text-[10px] text-[#8FCB99]">
                  {formatCountdown(countdowns[i])}
                </div>
                <div className="mt-0.5 rounded border border-[#2A342F] px-1.5 py-0.5 text-[9px] text-[#A5B0A8]">
                  {job.agent}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Run history */}
      <div className="rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3">
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#4A5A4E]">Run history</div>
        <div className="space-y-1.5 overflow-hidden">
          {runs.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 text-[11px] transition-all duration-700"
              style={{ opacity: r.fresh ? 0 : 1, transform: r.fresh ? "translateY(-6px)" : "translateY(0)" }}
            >
              {r.status === "pass" ? (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                  <circle cx="6.5" cy="6.5" r="5.5" fill="#8FCB99" opacity="0.15" />
                  <path d="M4 6.5 L5.8 8.3 L9 5" stroke="#8FCB99" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                  <circle cx="6.5" cy="6.5" r="5.5" fill="#FF5F56" opacity="0.12" />
                  <path d="M4.5 4.5 L8.5 8.5 M8.5 4.5 L4.5 8.5" stroke="#FF5F56" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
                </svg>
              )}
              <span className="flex-1 truncate text-[#A5B0A8]">{r.label}</span>
              <span className="shrink-0 text-[#4A5A4E]">{r.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

interface Props {
  t: (key: string) => string;
}

const features = [
  { visual: <TeamVisual />,      titleKey: "more.2.title", descKey: "more.2.desc" },
  { visual: <AutopilotVisual />, titleKey: "more.3.title", descKey: "more.3.desc" },
  { visual: <PRVisual />,        titleKey: "more.1.title", descKey: "more.1.desc" },
  { visual: <VoiceVisual />,     titleKey: "more.0.title", descKey: "more.0.desc" },
];

export function MoreFeatures({ t }: Props) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-6 lg:px-8 lg:py-8">
      <div className="rounded-[36px] border border-[#2A342F] bg-[#121715] px-8 py-10 lg:px-10">

        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#A5B0A8]">{t("more.label")}</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8ECE8] md:text-4xl">
            {t("more.title")}
          </h2>
          <p className="mt-4 text-base leading-8 text-[#A5B0A8]">
            {t("more.desc")}
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {features.map((f, i) => (
            <div key={i} className="overflow-hidden rounded-[28px]">
              {/* Visual */}
              <div className="h-[320px] overflow-hidden rounded-[28px] bg-[#0D1110]">
                {f.visual}
              </div>
              {/* Text */}
              <div className="p-5">
                <h3 className="text-base font-semibold text-[#E8ECE8]">
                  {t(f.titleKey)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#A5B0A8]">
                  {t(f.descKey)}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
