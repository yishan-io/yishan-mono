import type { AppLanguagePreference } from "@/lib/storage/language-preference-storage";

type CopyLeaf = string;
type CopyTree = { [key: string]: CopyLeaf | CopyTree };

const copy = {
  en: {
    common: {
      back: "Back",
      close: "Close",
      loading: "Loading...",
      retry: "Retry",
    },
    errors: {
      genericTitle: "Something went wrong",
      genericMessage: "Please try again.",
      wait: "Please wait while the app restores the latest state.",
    },
    auth: {
      tagline: "Make development work feel lighter.",
      restoringSession: "Restoring session...",
      continueWithGoogle: "Continue with Google",
      googleSigningIn: "Opening Google...",
      googleUnavailable: "Google sign-in is unavailable right now.",
      googleCompleteLoading: "Completing Google sign-in...",
      googleCompleteFailed: "Failed to complete Google sign-in.",
      googleCallbackMissingFields: "The Google sign-in callback is missing required fields.",
      googlePendingRequestMissing: "No pending Google sign-in request was found.",
      googleRequestExpired: "The Google sign-in request expired. Please try again.",
      googleRequestMismatch: "The Google sign-in callback did not match the current request.",
      signedInPlaceholder: "You are signed in. Workspace and shell features will arrive in later PRs.",
      signOut: "Sign out",
    },
  },
  zh: {
    common: {
      back: "返回",
      close: "关闭",
      loading: "加载中...",
      retry: "重试",
    },
    errors: {
      genericTitle: "出错了",
      genericMessage: "请稍后重试。",
      wait: "正在恢复最新状态，请稍候。",
    },
    auth: {
      tagline: "让开发工作变得更轻。",
      restoringSession: "正在恢复登录状态...",
      continueWithGoogle: "使用 Google 继续",
      googleSigningIn: "正在打开 Google...",
      googleUnavailable: "Google 登录当前不可用。",
      googleCompleteLoading: "正在完成 Google 登录...",
      googleCompleteFailed: "完成 Google 登录失败。",
      googleCallbackMissingFields: "Google 登录回调缺少必要字段。",
      googlePendingRequestMissing: "未找到待处理的 Google 登录请求。",
      googleRequestExpired: "Google 登录请求已过期，请重试。",
      googleRequestMismatch: "Google 登录回调和当前请求不匹配。",
      signedInPlaceholder: "你已登录。Workspace 和 shell 功能会在后续 PR 中加入。",
      signOut: "退出登录",
    },
  },
} satisfies Record<AppLanguagePreference, CopyTree>;

function resolveTreeValue(tree: CopyTree, key: string): CopyLeaf | undefined {
  const value = key.split(".").reduce<CopyLeaf | CopyTree | undefined>((current, segment) => {
    if (!current || typeof current === "string") {
      return undefined;
    }

    return current[segment];
  }, tree);

  return typeof value === "string" ? value : undefined;
}

function resolveCopyValue(tree: CopyTree, key: string): string {
  return resolveTreeValue(tree, key) ?? key;
}

export function translate(
  preference: AppLanguagePreference,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template = resolveCopyValue(copy[preference], key);
  if (!params) {
    return template;
  }

  return Object.entries(params).reduce(
    (message, [name, value]) => message.replaceAll(`{{${name}}}`, String(value)),
    template,
  );
}
