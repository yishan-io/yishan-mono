"use client";

import { useI18n } from "@/i18n";
import { useEffect, useRef, useState } from "react";

type Platform = "mac-arm" | "mac-intel" | "linux-appimage" | "linux-deb" | "linux-rpm";

interface PlatformOption {
  key: Platform;
  label: string;
  labelZh: string;
  pattern: RegExp;
}

const platformOptions: PlatformOption[] = [
  { key: "mac-arm", label: "macOS (Apple Silicon)", labelZh: "macOS (Apple Silicon)", pattern: /arm64\.dmg$/ },
  { key: "mac-intel", label: "macOS (Intel)", labelZh: "macOS (Intel)", pattern: /x64\.dmg$/ },
  { key: "linux-appimage", label: "Linux (AppImage)", labelZh: "Linux (AppImage)", pattern: /\.AppImage$/ },
  { key: "linux-deb", label: "Linux (.deb)", labelZh: "Linux (.deb)", pattern: /\.deb$/ },
  { key: "linux-rpm", label: "Linux (.rpm)", labelZh: "Linux (.rpm)", pattern: /\.rpm$/ },
];

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "mac-arm";

  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();

  if (ua.includes("mac") || platform.includes("mac")) {
    const uaData = (navigator as unknown as { userAgentData?: { architecture?: string } }).userAgentData;
    if (uaData?.architecture === "arm") return "mac-arm";
    return "mac-arm";
  }

  if (ua.includes("linux") || platform.includes("linux")) {
    return "linux-appimage";
  }

  return "mac-arm";
}

function resolveDownloadUrls(assets: ReleaseAsset[]): Record<Platform, string> {
  const fallback = "https://github.com/yishan-io/yishan-mono/releases/latest";
  const urls: Record<Platform, string> = {
    "mac-arm": fallback,
    "mac-intel": fallback,
    "linux-appimage": fallback,
    "linux-deb": fallback,
    "linux-rpm": fallback,
  };

  for (const option of platformOptions) {
    const asset = assets.find((a) => option.pattern.test(a.name));
    if (asset) {
      urls[option.key] = asset.browser_download_url;
    }
  }

  return urls;
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
      <path d="M7 10l5 5 5-5H7z" />
    </svg>
  );
}

// Cache the fetch globally so multiple DownloadButton instances share the same request
let releasePromise: Promise<ReleaseInfo | null> | null = null;

function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  if (!releasePromise) {
    releasePromise = fetch("https://api.github.com/repos/yishan-io/yishan-mono/releases/latest")
      .then((res) => (res.ok ? (res.json() as Promise<ReleaseInfo>) : null))
      .catch(() => null);
  }
  return releasePromise;
}

export function DownloadButton({ variant = "primary" }: { variant?: "primary" | "compact" }) {
  const { locale } = useI18n();
  const [detected, setDetected] = useState<Platform>("mac-arm");
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<Record<Platform, string> | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDetected(detectPlatform());

    fetchLatestRelease().then((release) => {
      if (release) {
        setUrls(resolveDownloadUrls(release.assets));
        // Strip "desktop-v" or "v" prefix from tag name
        const ver = release.tag_name.replace(/^desktop-v|^v/, "");
        setVersion(ver);
      }
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fallbackUrl = "https://github.com/yishan-io/yishan-mono/releases/latest";
  const currentUrl = urls?.[detected] ?? fallbackUrl;
  const currentOption = platformOptions.find((p) => p.key === detected) ?? platformOptions[0];
  if (!currentOption) {
    return null;
  }

  const label = locale === "zh" ? currentOption.labelZh : currentOption.label;
  const downloadLabel = locale === "zh" ? "下载" : "Download";

  const isPrimary = variant === "primary";

  return (
    <div ref={ref} className="relative inline-flex">
      <a
        href={currentUrl}
        className={
          isPrimary
            ? "inline-flex items-center gap-2 rounded-l-2xl bg-[#9DDB72] px-6 py-3 text-sm font-medium text-[#0D1110] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_28px_rgba(157,219,114,0.24)] transition hover:translate-y-[-1px] hover:bg-[#B2EB8A]"
            : "inline-flex items-center gap-2 rounded-l-2xl bg-[#9DDB72] px-4 py-2 text-sm font-medium text-[#0D1110] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_24px_rgba(157,219,114,0.22)] transition hover:translate-y-[-1px] hover:bg-[#B2EB8A]"
        }
      >
        <DownloadIcon />
        {downloadLabel} {label}
        {version && <span className="opacity-60">v{version}</span>}
      </a>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isPrimary
            ? "inline-flex items-center rounded-r-2xl border-l border-[#7BC054] bg-[#9DDB72] px-2.5 py-3 text-[#0D1110] transition hover:bg-[#B2EB8A]"
            : "inline-flex items-center rounded-r-2xl border-l border-[#7BC054] bg-[#9DDB72] px-2 py-2 text-[#0D1110] transition hover:bg-[#B2EB8A]"
        }
      >
        <ChevronIcon />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 min-w-[220px] rounded-xl border border-[#2A342F] bg-[#151B18] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
          {version && <div className="px-3 py-1.5 text-xs text-[#A5B0A8]">v{version}</div>}
          {platformOptions.map((p) => {
            const url = urls?.[p.key] ?? fallbackUrl;
            const isActive = urls?.[p.key] != null;
            return (
              <a
                key={p.key}
                href={url}
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  p.key === detected
                    ? "bg-[#2A342F] text-[#E8ECE8]"
                    : isActive
                      ? "text-[#A5B0A8] hover:bg-[#1B2420] hover:text-[#E8ECE8]"
                      : "pointer-events-none text-[#A5B0A8]/40"
                }`}
              >
                {locale === "zh" ? p.labelZh : p.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
