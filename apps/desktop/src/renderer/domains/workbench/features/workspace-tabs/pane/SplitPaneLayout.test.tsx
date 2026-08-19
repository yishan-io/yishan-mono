// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { SplitPaneLayout } from "./SplitPaneLayout";

type MountProbeProps = {
  paneId: string;
  onMount: (paneId: string) => void;
  onUnmount: (paneId: string) => void;
};

function MountProbe({ paneId, onMount, onUnmount }: MountProbeProps) {
  useEffect(() => {
    onMount(paneId);
    return () => {
      onUnmount(paneId);
    };
  }, [onMount, onUnmount, paneId]);

  return <div data-testid={`${paneId}-pane`}>{paneId}</div>;
}

describe("SplitPaneLayout", () => {
  describe("horizontal direction", () => {
    it("keeps side content mounted while collapsed state toggles (position=left)", () => {
      const onMount = vi.fn();
      const onUnmount = vi.fn();

      const { rerender } = render(
        <SplitPaneLayout
          position="left"
          collapsed={false}
          resizeLabel="Resize left"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          position="left"
          collapsed={true}
          resizeLabel="Resize left"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          position="left"
          collapsed={false}
          resizeLabel="Resize left"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      expect(onMount).toHaveBeenCalledTimes(1);
      expect(onMount).toHaveBeenCalledWith("side");
      expect(onUnmount).not.toHaveBeenCalled();
    });

    it("keeps side content mounted while collapsed state toggles (position=right)", () => {
      const onMount = vi.fn();
      const onUnmount = vi.fn();

      const { rerender } = render(
        <SplitPaneLayout
          position="right"
          collapsed={false}
          resizeLabel="Resize right"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          position="right"
          collapsed={true}
          resizeLabel="Resize right"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          position="right"
          collapsed={false}
          resizeLabel="Resize right"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      expect(onMount).toHaveBeenCalledTimes(1);
      expect(onMount).toHaveBeenCalledWith("side");
      expect(onUnmount).not.toHaveBeenCalled();
    });
  });

  describe("vertical direction", () => {
    it("keeps side content mounted while collapsed state toggles (position=top)", () => {
      const onMount = vi.fn();
      const onUnmount = vi.fn();

      const { rerender } = render(
        <SplitPaneLayout
          direction="vertical"
          position="top"
          collapsed={false}
          resizeLabel="Resize top"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          direction="vertical"
          position="top"
          collapsed={true}
          resizeLabel="Resize top"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          direction="vertical"
          position="top"
          collapsed={false}
          resizeLabel="Resize top"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      expect(onMount).toHaveBeenCalledTimes(1);
      expect(onMount).toHaveBeenCalledWith("side");
      expect(onUnmount).not.toHaveBeenCalled();
    });

    it("keeps side content mounted while collapsed state toggles (position=bottom)", () => {
      const onMount = vi.fn();
      const onUnmount = vi.fn();

      const { rerender } = render(
        <SplitPaneLayout
          direction="vertical"
          position="bottom"
          collapsed={false}
          resizeLabel="Resize bottom"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          direction="vertical"
          position="bottom"
          collapsed={true}
          resizeLabel="Resize bottom"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      rerender(
        <SplitPaneLayout
          direction="vertical"
          position="bottom"
          collapsed={false}
          resizeLabel="Resize bottom"
          sideContent={<MountProbe paneId="side" onMount={onMount} onUnmount={onUnmount} />}
          onResizeStart={() => {}}
        >
          <div data-testid="primary-pane">primary</div>
        </SplitPaneLayout>,
      );

      expect(onMount).toHaveBeenCalledTimes(1);
      expect(onMount).toHaveBeenCalledWith("side");
      expect(onUnmount).not.toHaveBeenCalled();
    });

    it("renders separator with vertical orientation", () => {
      const onResizeStart = vi.fn();
      const { container } = render(
        <SplitPaneLayout
          direction="vertical"
          position="bottom"
          collapsed={false}
          resizeLabel="Resize bottom"
          sideContent={<div>side</div>}
          onResizeStart={onResizeStart}
        >
          <div>primary</div>
        </SplitPaneLayout>,
      );

      const separator = container.querySelector('[role="separator"]');
      expect(separator).toBeTruthy();
      expect(separator?.getAttribute("aria-orientation")).toBe("vertical");
    });
  });
});
