"use client";

import { useI18n } from "@/i18n";
import { CoreFeatureRows } from "./core-feature-rows";
import { DownloadButton } from "./download-button";
import { HeroImage } from "./hero-image";
import { LanguageSwitcher } from "./language-switcher";
import { MoreFeatures } from "./more-features";
import { WorkflowDemo } from "./workflow-demo";

const logoUrl =
  "https://raw.githubusercontent.com/yishan-io/yishan-mono/main/apps/desktop/src/assets/images/yishan-transparent.png";

const agents: { name: string; icon: string; size?: string }[] = [
  { name: "OpenCode", icon: "/opencode.svg" },
  { name: "Codex", icon: "/codex.svg", size: "h-7 w-7" },
  { name: "Claude", icon: "/claude.svg" },
  { name: "Gemini", icon: "/gemini.svg" },
  { name: "Cursor", icon: "/cursor.svg" },
  { name: "Pi", icon: "/pi.svg" },
];

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M12 0.5C5.37 0.5 0 5.87 0 12.5C0 17.8 3.44 22.3 8.21 23.89C8.81 24 9.03 23.63 9.03 23.31C9.03 23.02 9.02 22.06 9.02 20.99C5.67 21.72 4.97 19.37 4.97 19.37C4.42 17.97 3.63 17.6 3.63 17.6C2.55 16.86 3.71 16.88 3.71 16.88C4.9 16.96 5.52 18.11 5.52 18.11C6.58 19.93 8.3 19.41 8.97 19.11C9.08 18.34 9.38 17.82 9.71 17.52C7.04 17.22 4.24 16.18 4.24 11.54C4.24 10.22 4.71 9.13 5.48 8.27C5.35 7.97 4.95 6.73 5.6 5.05C5.6 5.05 6.61 4.73 8.99 6.34C9.95 6.07 10.98 5.93 12 5.93C13.02 5.93 14.05 6.07 15.01 6.34C17.39 4.73 18.4 5.05 18.4 5.05C19.05 6.73 18.65 7.97 18.52 8.27C19.29 9.13 19.76 10.22 19.76 11.54C19.76 16.19 16.95 17.22 14.27 17.52C14.69 17.88 15.07 18.58 15.07 19.66C15.07 21.21 15.06 22.47 15.06 23.31C15.06 23.63 15.28 24 15.89 23.89C20.66 22.3 24.1 17.8 24.1 12.5C24.1 5.87 18.73 0.5 12.1 0.5H12Z" />
    </svg>
  );
}

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0D1110] text-[#E8ECE8]">
      {/* Background blurs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-[-10rem] top-[-6rem] h-[28rem] w-[28rem] rounded-full bg-[#1B2420]/70 blur-3xl" />
        <div className="absolute right-[-8rem] top-[10rem] h-[24rem] w-[24rem] rounded-full bg-[#18211D]/70 blur-3xl" />
        <div className="absolute left-[30%] top-[22rem] h-[18rem] w-[18rem] rounded-full bg-[#5F8A67]/8 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-1">
            <div className="flex h-20 w-20 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Yishan logo" className="h-full w-full object-contain" />
            </div>
            <div className="text-lg font-semibold tracking-wide text-[#E8ECE8]">{t("brand")}</div>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
          <div className="mx-auto max-w-5xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#2A342F] bg-[#151B18] px-3 py-1 text-xs text-[#D1B06A]">
              {t("hero.badge")}
            </div>

            <h1 className="mt-6 text-5xl font-semibold leading-tight tracking-tight text-[#E8ECE8] md:text-6xl lg:text-7xl">
              {t("hero.title.1")}
              <br />
              {t("hero.title.2")}
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-[#A5B0A8]">{t("hero.desc")}</p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <DownloadButton />
              <a
                href="https://github.com/yishan-io/yishan-mono"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#2A342F] bg-[#151B18] px-6 py-3 text-sm text-[#E8ECE8] transition hover:bg-[#1B2420]"
              >
                <GitHubIcon />
                {t("hero.github")}
              </a>
            </div>

            {/* Agent compat — compact inline */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-[#4A5A4E]">{t("agents.label")}</span>
              {agents.map((agent) => (
                <span
                  key={agent.name}
                  className="flex items-center gap-1.5 rounded-full border border-[#2A342F] bg-[#151B18] px-3 py-1 text-xs"
                >
                  <span
                    className={`${agent.size ?? "h-3.5 w-3.5"} bg-[#D1B06A]`}
                    style={{
                      mask: `url(${agent.icon}) center/contain no-repeat`,
                      WebkitMask: `url(${agent.icon}) center/contain no-repeat`,
                    }}
                    aria-label={agent.name}
                  />
                  <span className="text-[#A5B0A8]">{agent.name}</span>
                </span>
              ))}
            </div>
          </div>

          <HeroImage />
        </section>

        {/* Core features */}
        <section id="features" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-[0.24em] text-[#A5B0A8]">{t("features.label")}</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8ECE8] md:text-4xl">
              {t("features.title")}
            </h2>
          </div>
          <CoreFeatureRows t={t} />
        </section>

        {/* More features */}
        <MoreFeatures t={t} />

        {/* Workflow */}
        <WorkflowDemo t={t} />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2A342F] bg-[#0F1412]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div className="max-w-md">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Yishan logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="text-base font-semibold tracking-wide text-[#E8ECE8]">{t("brand")}</div>
                <div className="text-xs text-[#A5B0A8]">{t("footer.tagline")}</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-[#A5B0A8]">{t("footer.desc")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <DownloadButton />
              <a
                href="https://github.com/yishan-io/yishan-mono"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#2A342F] bg-[#151B18] px-5 py-2.5 text-sm text-[#E8ECE8] transition hover:bg-[#1B2420]"
              >
                <GitHubIcon />
                GitHub
              </a>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-[#A5B0A8]">{t("footer.product")}</div>
              <div className="mt-4 space-y-3 text-sm text-[#A5B0A8]">
                <a href="#features" className="block transition hover:text-[#E8ECE8]">
                  {t("nav.product")}
                </a>
                <a href="#workflow" className="block transition hover:text-[#E8ECE8]">
                  {t("nav.workflow")}
                </a>
                <a
                  href="https://github.com/yishan-io/yishan-mono/releases"
                  className="block transition hover:text-[#E8ECE8]"
                >
                  {t("nav.changelog")}
                </a>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-[#A5B0A8]">{t("footer.company")}</div>
              <div className="mt-4 space-y-3 text-sm text-[#A5B0A8]">
                <a href="/about" className="block transition hover:text-[#E8ECE8]">
                  {t("footer.about")}
                </a>
                <a href="mailto:support@yishan.io" className="block transition hover:text-[#E8ECE8]">
                  {t("footer.contact")}
                </a>
                <a href="/privacy" className="block transition hover:text-[#E8ECE8]">
                  {t("footer.privacy")}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[#2A342F]">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 text-sm text-[#A5B0A8] lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>{t("footer.copyright")}</div>
            <div>{t("footer.slogan")}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
