import { describe, expect, it, vi } from "vitest";

import {
  CapabilityClient,
  type CapabilityIdentity,
  type CapabilityRequest,
  type CapabilityTransport,
} from "./capabilityClient";

type TestOperation = "test.operation";
type TestInput = { subject: string };
type TestRequest = CapabilityRequest<TestOperation, TestInput>;

const identity: CapabilityIdentity = {
  sessionId: "session-1",
  workspaceId: "workspace-1",
  generation: 2,
};

describe("CapabilityClient", () => {
  it("constructs an authorized, bounded, cancellable request and returns the transport result", async () => {
    const response = { accepted: true };
    const transport = createTransport(response);
    const signal = new AbortController().signal;
    const client = new CapabilityClient<TestOperation, TestInput>(transport, identity, signal);
    const beforeRequest = Date.now();

    await expect(client.request("test.operation", { subject: "test" })).resolves.toEqual(response);

    const request = getOnlyRequest(transport);
    expect(request).toMatchObject({
      ...identity,
      operation: "test.operation",
      input: { subject: "test" },
      signal,
    });
    expect(request.id).toMatch(/^capability-\d+-\d+$/);
    expect(request.cancellationId).toMatch(/^capability-\d+-\d+$/);
    expect(request.cancellationId).not.toBe(request.id);
    expect(request.deadlineAtMs).toBeGreaterThanOrEqual(beforeRequest + 60_000);
    expect(request.deadlineAtMs).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("does not send a request after cancellation", async () => {
    const transport = createTransport({ accepted: true });
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const client = new CapabilityClient<TestOperation, TestInput>(transport, identity, controller.signal);

    await expect(client.request("test.operation", { subject: "test" })).rejects.toThrow("cancelled");
    expect(transport.requestCapability).not.toHaveBeenCalled();
  });
});

function createTransport(response: unknown): CapabilityTransport<TestRequest> {
  return { requestCapability: vi.fn(async () => response) };
}

function getOnlyRequest(transport: CapabilityTransport<TestRequest>): TestRequest {
  const requests = vi.mocked(transport.requestCapability).mock.calls;
  const request = requests[0]?.[0];
  if (request === undefined) throw new Error("expected one capability request");
  expect(requests).toHaveLength(1);
  return request;
}
