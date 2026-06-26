"use client";

const items = [0, 1, 2, 3] as const;

type Status = "in_progress" | "planned";

function statusFromKey(val: string): Status {
  return val === "in_progress" ? "in_progress" : "planned";
}

interface Props {
  t: (key: string) => string;
}

function NodeDot({ status }: { status: Status }) {
  if (status === "in_progress") {
    return (
      <span className="relative flex h-4 w-4 items-center justify-center">
        {/* Ping ring */}
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8FCB99] opacity-30" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-[#8FCB99]" />
      </span>
    );
  }
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <span className="inline-flex h-3 w-3 rounded-full border-2 border-[#4A5A4E] bg-transparent" />
    </span>
  );
}

function StatusBadge({ status, t }: { status: Status; t: (k: string) => string }) {
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8FCB99]/30 bg-[#8FCB99]/10 px-2.5 py-0.5 text-[10px] font-medium text-[#8FCB99]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8FCB99]" />
        {t("roadmap.status.in_progress")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2A342F] bg-transparent px-2.5 py-0.5 text-[10px] font-medium text-[#4A5A4E]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#4A5A4E]" />
      {t("roadmap.status.planned")}
    </span>
  );
}

export function RoadmapTimeline({ t }: Props) {
  return (
    <section id="roadmap" className="mx-auto max-w-7xl px-6 py-6 lg:px-8 lg:py-8">
      <div className="rounded-[36px] border border-[#2A342F] bg-[#121715] px-8 py-10 lg:px-10">
        {/* Header */}
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#A5B0A8]">{t("roadmap.label")}</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8ECE8] md:text-4xl">
            {t("roadmap.title")}
          </h2>
          <p className="mt-4 text-base leading-8 text-[#A5B0A8]">{t("roadmap.desc")}</p>
        </div>

        {/* Timeline — horizontal on lg, vertical stack on mobile */}
        <div className="mt-12">
          {/* Desktop: horizontal timeline */}
          <div className="hidden lg:block">
            {/* Track + nodes */}
            <div className="relative flex items-start justify-between">
              {/* Single continuous line: green → grey gradient at the in_progress/planned boundary */}
              <div className="absolute top-[7px] left-0 right-0 h-px bg-gradient-to-r from-[#8FCB99]/60 via-[#8FCB99]/20 to-[#2A342F]" />

              {items.map((i) => {
                const status = statusFromKey(t(`roadmap.${i}.status`));
                return (
                  <div key={i} className="relative flex w-[23%] flex-col">
                    <NodeDot status={status} />
                    <div className="mt-5">
                      <StatusBadge status={status} t={t} />
                      <h3 className="mt-3 text-base font-semibold leading-6 text-[#E8ECE8]">
                        {t(`roadmap.${i}.title`)}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#A5B0A8]">{t(`roadmap.${i}.desc`)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile: vertical stack */}
          <div className="flex flex-col gap-0 lg:hidden">
            {items.map((i) => {
              const status = statusFromKey(t(`roadmap.${i}.status`));
              const isLast = i === items[items.length - 1];
              return (
                <div key={i} className="relative flex gap-5">
                  {/* Left: dot + line */}
                  <div className="flex flex-col items-center">
                    <div className="mt-0.5">
                      <NodeDot status={status} />
                    </div>
                    {!isLast && (
                      <div
                        className={`mt-1 w-px flex-1 ${status === "in_progress" ? "bg-[#8FCB99]/40" : "bg-[#2A342F]"}`}
                      />
                    )}
                  </div>
                  {/* Right: content */}
                  <div className={`pb-8 ${isLast ? "pb-0" : ""}`}>
                    <StatusBadge status={status} t={t} />
                    <h3 className="mt-3 text-base font-semibold leading-6 text-[#E8ECE8]">{t(`roadmap.${i}.title`)}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#A5B0A8]">{t(`roadmap.${i}.desc`)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
