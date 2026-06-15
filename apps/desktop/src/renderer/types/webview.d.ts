import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<Electron.WebviewTag>, Electron.WebviewTag> & {
        src?: string;
        allowpopups?: boolean;
        onDidFailLoad?: (event: { errorDescription?: string; validatedURL?: string }) => void;
        onDidStartLoading?: () => void;
      };
    }
  }
}
