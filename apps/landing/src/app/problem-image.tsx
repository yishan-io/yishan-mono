"use client";

export function ProblemImage() {
  return (
    <div className="mt-10 w-full overflow-hidden">
      {/* Label */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#2A342F]" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#4A5A4E]">scattered across tools</span>
        <div className="h-px flex-1 bg-[#2A342F]" />
      </div>

      {/* Scattered windows — intentionally misaligned */}
      <div className="relative h-56">
        {/* Terminal A — top left */}
        <div className="absolute left-0 top-0 w-[42%] rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3 shadow-xl shadow-black/40">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#FF5F56]/60" />
            <div className="h-2 w-2 rounded-full bg-[#FFBD2E]/60" />
            <div className="h-2 w-2 rounded-full bg-[#27C93F]/60" />
            <span className="ml-1 text-[9px] text-[#4A5A4E]">Terminal — fix/login-bug</span>
          </div>
          <div className="space-y-1 font-mono text-[10px]">
            <div className="text-[#8FCB99]">$ npm test -- auth</div>
            <div className="text-[#D1B06A]">● running 4 tests...</div>
            <div className="text-[#A5B0A8]">modified: src/auth.ts</div>
          </div>
        </div>

        {/* Chat tab — top right, overlapping */}
        <div className="absolute right-0 top-2 w-[34%] rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3 shadow-xl shadow-black/40">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#D1B06A]/70" />
            <span className="text-[9px] text-[#4A5A4E]">Claude — refactor</span>
          </div>
          <div className="space-y-1.5 text-[10px]">
            <div className="text-[#A5B0A8]">Refactoring data layer</div>
            <div className="h-2 w-3/4 animate-pulse rounded bg-[#1B2420]" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-[#1B2420]" />
          </div>
        </div>

        {/* Editor — middle, offset down */}
        <div className="absolute left-[22%] top-14 w-[40%] rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3 shadow-xl shadow-black/40">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[9px] text-[#4A5A4E]">editor — db/model.ts</span>
          </div>
          <div className="space-y-1 font-mono text-[10px]">
            <div>
              <span className="text-[#8FCB99]">export</span>
              <span className="text-[#A5B0A8]"> type User = {"{"}</span>
            </div>
            <div className="pl-3 text-[#A5B0A8]">id: string</div>
            <div className="pl-3 text-[#D1B06A]">role: Role</div>
          </div>
        </div>

        {/* Terminal B — bottom left */}
        <div className="absolute bottom-0 left-4 w-[36%] rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3 shadow-xl shadow-black/40">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#FF5F56]/60" />
            <div className="h-2 w-2 rounded-full bg-[#FFBD2E]/60" />
            <div className="h-2 w-2 rounded-full bg-[#27C93F]/60" />
            <span className="ml-1 text-[9px] text-[#4A5A4E]">Terminal — feat/api-v2</span>
          </div>
          <div className="space-y-1 font-mono text-[10px]">
            <div className="text-[#8FCB99]">$ codex run review</div>
            <div className="text-[#A5B0A8]">reviewing changes...</div>
          </div>
        </div>

        {/* Another chat — bottom right */}
        <div className="absolute bottom-2 right-2 w-[28%] rounded-2xl border border-[#2A342F] bg-[#0F1412] p-3 shadow-xl shadow-black/40">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#8FCB99]/50" />
            <span className="text-[9px] text-[#4A5A4E]">Gemini — docs</span>
          </div>
          <div className="space-y-1.5 text-[10px]">
            <div className="h-2 w-full animate-pulse rounded bg-[#1B2420]" />
            <div className="h-2 w-2/3 animate-pulse rounded bg-[#1B2420]" />
          </div>
        </div>
      </div>

      {/* Bottom callout */}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-[#4A5A4E]">
        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="6" y1="4" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="6" cy="8.5" r="0.6" fill="currentColor" />
        </svg>
        Where is the review agent up to? Which branch was that refactor on? You have to check each tool manually.
      </div>
    </div>
  );
}
