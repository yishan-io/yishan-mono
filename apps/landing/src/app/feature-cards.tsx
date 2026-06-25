"use client";

import { useEffect, useState } from "react";

// ── Icons ──────────────────────────────────────────────────────────────────

function IconIsolated() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="8" cy="14" r="2.5" fill="#8FCB99" />
      <path d="M10.5 14 C14 14 13 7 20 7" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="7" r="2" fill="#8FCB99" opacity="0.5" />
      <path d="M10.5 14 C14 14 13 21 20 21" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="21" r="2" fill="#8FCB99" opacity="0.5" />
      <path d="M10.5 14 L20 14" stroke="#8FCB99" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
      <circle cx="20" cy="14" r="2" fill="#8FCB99" opacity="0.3" />
    </svg>
  );
}

function IconLiveStatus() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="5" cy="8" r="2.5" fill="#D1B06A" />
      <rect x="10" y="6.5" width="13" height="3" rx="1.5" fill="#8FCB99" opacity="0.7" />
      <circle cx="5" cy="14" r="2" stroke="#A5B0A8" strokeWidth="1.5" />
      <rect x="10" y="12.5" width="9" height="3" rx="1.5" fill="#A5B0A8" opacity="0.35" />
      <circle cx="5" cy="20" r="2.5" fill="#4A5A4E" />
      <path
        d="M3.8 20 L4.8 21 L6.2 19"
        stroke="#8FCB99"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="10" y="18.5" width="11" height="3" rx="1.5" fill="#4A5A4E" opacity="0.6" />
    </svg>
  );
}

function IconResume() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M22 10 A9 9 0 1 0 22 18" stroke="#8FCB99" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path
        d="M20 7 L22 10 L19 11"
        stroke="#8FCB99"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M11 10.5 L11 17.5 L18 14 Z" fill="#8FCB99" opacity="0.8" />
    </svg>
  );
}

function IconAgent() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="22" height="18" rx="3" stroke="#8FCB99" strokeWidth="1.5" />
      <circle cx="7.5" cy="9.5" r="1" fill="#8FCB99" opacity="0.5" />
      <circle cx="11" cy="9.5" r="1" fill="#8FCB99" opacity="0.3" />
      <line x1="3" y1="12" x2="25" y2="12" stroke="#8FCB99" strokeWidth="1" opacity="0.3" />
      <path d="M16 14 L13 18.5 H15.2 L14 22 L18 16.5 H15.8 Z" fill="#D1B06A" opacity="0.9" />
    </svg>
  );
}

function IconContext() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="5" y="6" width="15" height="18" rx="2.5" stroke="#8FCB99" strokeWidth="1.5" opacity="0.5" />
      <line x1="9" y1="11" x2="16" y2="11" stroke="#8FCB99" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <line x1="9" y1="14.5" x2="16" y2="14.5" stroke="#8FCB99" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <line x1="9" y1="18" x2="13" y2="18" stroke="#8FCB99" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <circle cx="20" cy="11" r="3.5" fill="#D1B06A" opacity="0.9" />
      <line x1="20" y1="14.5" x2="20" y2="20" stroke="#D1B06A" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

// ── Card data ──────────────────────────────────────────────────────────────

const cards = [
  { icon: <IconIsolated />, titleKey: "features.0.title", descKey: "features.0.desc" },
  { icon: <IconLiveStatus />, titleKey: "features.1.title", descKey: "features.1.desc" },
  { icon: <IconResume />, titleKey: "features.2.title", descKey: "features.2.desc" },
  { icon: <IconAgent />, titleKey: "features.3.title", descKey: "features.3.desc" },
  { icon: <IconContext />, titleKey: "features.4.title", descKey: "features.4.desc" },
] as const;

// Fixed positions as % [left, top] — deliberately scattered, not grid-aligned
// Chosen so cards don't overlap on desktop (card ~260px wide, container ~1200px)
const positions: [number, number][] = [
  [4, 3], // 0 — top left
  [62, 2], // 1 — top right
  [32, 34], // 2 — centre
  [8, 58], // 3 — bottom left
  [64, 54], // 4 — bottom right
];

// Each card lights up for 4s, then the next one takes over — equal round-robin
const CYCLE_INTERVAL = 800; // ms dim gap between cards
const LIT_DURATION = 4000; // ms each card stays lit

// Tiny background star dots [left%, top%]
const bgStars: [number, number, number][] = [
  [15, 20, 1.5],
  [40, 8, 1],
  [72, 25, 1.5],
  [88, 14, 1],
  [50, 72, 1.5],
  [20, 80, 1],
  [80, 78, 1.5],
  [35, 55, 1],
  [90, 45, 1],
  [10, 45, 1.5],
  [65, 40, 1],
  [48, 90, 1],
];

interface Props {
  t: (key: string) => string;
}

export function FeatureCards({ t }: Props) {
  const [lit, setLit] = useState<number | null>(0);

  useEffect(() => {
    let current = 0;
    let litTimer: ReturnType<typeof setTimeout>;
    let dimTimer: ReturnType<typeof setTimeout>;

    function next() {
      setLit(current);
      litTimer = setTimeout(() => {
        setLit(null);
        dimTimer = setTimeout(() => {
          current = (current + 1) % cards.length;
          next();
        }, CYCLE_INTERVAL);
      }, LIT_DURATION);
    }

    next();
    return () => {
      clearTimeout(litTimer);
      clearTimeout(dimTimer);
    };
  }, []);

  return (
    <div className="relative mt-10 rounded-[36px]" style={{ height: "680px" }}>
      {/* Background nebula glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[20%] top-[10%] h-64 w-64 rounded-full bg-[#8FCB99]/4 blur-3xl" />
        <div className="absolute right-[15%] bottom-[15%] h-48 w-48 rounded-full bg-[#D1B06A]/4 blur-3xl" />
      </div>

      {/* Background star dots */}
      {bgStars.map(([l, t2, r]) => (
        <div
          key={`${l}-${t2}-${r}`}
          className="pointer-events-none absolute rounded-full bg-[#8FCB99] opacity-20"
          style={{ left: `${l}%`, top: `${t2}%`, width: r, height: r }}
        />
      ))}

      {/* Cards */}
      {cards.map((card, i) => {
        const [left, top] = positions[i];
        const isLit = lit === i;

        return (
          <div
            key={card.titleKey}
            className="absolute cursor-default"
            style={{
              left: `min(${left}%, calc(100% - 340px))`,
              top: `${top}%`,
              width: "320px",
              zIndex: isLit ? 10 : 1,
            }}
          >
            {/* Star glow halo — only when lit */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[28px] transition-opacity duration-1000"
              style={{
                opacity: isLit ? 1 : 0,
                boxShadow: "0 0 40px 8px rgba(143,203,153,0.18), 0 0 80px 20px rgba(143,203,153,0.08)",
              }}
            />

            {/* Card */}
            <div
              className="relative rounded-[28px] border bg-[#0F1412] p-5 transition-all duration-1000"
              style={{
                borderColor: isLit ? "rgba(143,203,153,0.45)" : "rgba(42,52,47,1)",
                transform: isLit ? "scale(1.3)" : "scale(1)",
                boxShadow: isLit
                  ? "0 0 0 1px rgba(143,203,153,0.15), 0 8px 32px rgba(0,0,0,0.4)"
                  : "0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              {/* Icon */}
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors duration-1000"
                style={{
                  borderColor: isLit ? "rgba(143,203,153,0.3)" : "rgba(42,52,47,1)",
                  background: isLit ? "rgba(143,203,153,0.07)" : "#080C0A",
                }}
              >
                {card.icon}
              </div>

              {/* Text */}
              <h3
                className="mt-3 text-base font-semibold leading-6 transition-colors duration-1000"
                style={{ color: isLit ? "#E8ECE8" : "#8A9A8E" }}
              >
                {t(card.titleKey)}
              </h3>
              <p
                className="mt-1.5 text-xs leading-6 transition-colors duration-1000"
                style={{ color: isLit ? "#A5B0A8" : "#4A5A4E" }}
              >
                {t(card.descKey)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
