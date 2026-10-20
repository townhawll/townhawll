import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createProviderHttpClient,
  ProviderHttpError,
  retryAfterMilliseconds,
  validateProviderResponse,
  type ProviderHttpOptions,
} from "./index.js";

const json = () => Response.json({ ok: true });
function setup(
  fetch: typeof globalThis.fetch,
  options: Partial<ProviderHttpOptions> = {},
) {
  return createProviderHttpClient(
    {
      provider: "TMDB",
      baseUrl: "https://provider.example/",
      requestsPerSecond: 100,
      baseDelayMs: 100,
      ...options,
    },
    { fetch, random: () => 0 },
  );
}
const hangingFetch = vi.fn<typeof fetch>(
  (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("cancelled", "AbortError")),
        { once: true },
      );
    }),
);

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("provider HTTP transport", () => {
  it("returns unknown JSON for separate schema validation and disables redirects/cookies/cache", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json());
    const result = await setup(fetch).requestJson({ path: "/details" });
    expect(
      validateProviderResponse("TMDB", z.object({ ok: z.boolean() }), result),
    ).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://provider.example/details"),
      expect.objectContaining({
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
      }),
    );
  });

  it.each([400, 401, 403, 404, 302])(
    "does not retry HTTP %i or follow redirects",
    async (status) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response("secret body", { status }));
      await expect(
        setup(fetch).requestJson({
          path: "/?api_key=private",
          headers: { Authorization: "Bearer private" },
        }),
      ).rejects.toMatchObject({ code: "HTTP", status });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("sanitizes raw network exceptions", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error("secret token in URL"));
    const result = setup(fetch, { maxAttempts: 1 }).requestJson({ path: "/" });
    await expect(result).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ProviderHttpError &&
        !JSON.stringify(error).includes("secret") &&
        !error.message.includes("secret") &&
        error.cause === undefined,
    );
  });

  it("retries transient failures with bounded exponential jitter", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      starts.push(Date.now());
      return Promise.resolve(
        starts.length < 3 ? new Response(null, { status: 503 }) : json(),
      );
    });
    const result = setup(fetch).requestJson({ path: "/" });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ ok: true });
    expect(starts[1]! - starts[0]!).toBe(50);
    expect(starts[2]! - starts[1]!).toBe(100);
  });

  it("stops after the configured attempt budget", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 500 })),
      );
    const check = expect(
      setup(fetch).requestJson({ path: "/" }),
    ).rejects.toMatchObject({ code: "HTTP", status: 500 });
    await vi.runAllTimersAsync();
    await check;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not replay POST unless the adapter explicitly identifies a read-only operation", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      );
    await expect(
      setup(fetch).requestJson({ path: "/", method: "POST", body: "query" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const check = expect(
      setup(fetch).requestJson({
        path: "/",
        method: "POST",
        body: "query",
        retryable: true,
      }),
    ).rejects.toMatchObject({ status: 503 });
    await vi.runAllTimersAsync();
    await check;
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("honors Retry-After across new requests sharing the client", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      starts.push(Date.now());
      return Promise.resolve(
        starts.length === 1
          ? new Response(null, { status: 429, headers: { "Retry-After": "2" } })
          : json(),
      );
    });
    const client = setup(fetch);
    const first = client.requestJson({ path: "/" });
    await vi.advanceTimersByTimeAsync(1);
    const second = client.requestJson({ path: "/other" });
    await vi.advanceTimersByTimeAsync(1998);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(2000);
  });

  it.each(["3600", "999999999"])(
    "does not truncate Retry-After (%s seconds) to retry before the provider permits it",
    async (retryAfter) => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
        Promise.resolve(
          new Response(null, {
            status: 429,
            headers: { "Retry-After": retryAfter },
          }),
        ),
      );
      const check = expect(
        setup(fetch, { totalTimeoutMs: 500 }).requestJson({ path: "/" }),
      ).rejects.toMatchObject({ code: "TIMEOUT" });
      await vi.runAllTimersAsync();
      await check;
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("includes queued rate-limit waits in the total deadline", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => Promise.resolve(json()));
    const client = setup(fetch, { requestsPerSecond: 1, totalTimeoutMs: 100 });
    await client.requestJson({ path: "/" });
    const check = expect(
      client.requestJson({ path: "/" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.runAllTimersAsync();
    await check;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out an active attempt and releases its slot", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce(json());
    const client = setup(fetch, {
      concurrency: 1,
      maxAttempts: 1,
      timeoutMs: 50,
    });
    const first = expect(
      client.requestJson({ path: "/" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    const second = client.requestJson({ path: "/" });
    await vi.runAllTimersAsync();
    await first;
    await expect(second).resolves.toEqual({ ok: true });
  });

  it("times out a stalled response body, not only response headers", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":'));
      },
      cancel,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(body));
    const check = expect(
      setup(fetch, { maxAttempts: 1, timeoutMs: 50 }).requestJson({
        path: "/",
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.runAllTimersAsync();
    await check;
    expect(cancel).toHaveBeenCalled();
  });

  it("cancels before dispatch without calling fetch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      setup(fetch).requestJson({
        path: "/",
        signal: AbortSignal.abort("private reason"),
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels an active request without retrying", async () => {
    const controller = new AbortController();
    const client = setup(hangingFetch);
    const check = expect(
      client.requestJson({ path: "/", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    await Promise.resolve();
    controller.abort("secret reason");
    await check;
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });

  it("removes a cancelled queued request and enforces bounded queue capacity", async () => {
    vi.useFakeTimers();
    const client = setup(hangingFetch, {
      concurrency: 1,
      maxPending: 1,
      timeoutMs: 500,
      maxAttempts: 1,
    });
    const first = expect(
      client.requestJson({ path: "/" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    const controller = new AbortController();
    const queued = expect(
      client.requestJson({ path: "/", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(client.requestJson({ path: "/" })).rejects.toMatchObject({
      code: "QUEUE_FULL",
    });
    controller.abort();
    await queued;
    const replacement = expect(
      client.requestJson({ path: "/" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.runAllTimersAsync();
    await Promise.all([first, replacement]);
    expect(hangingFetch).toHaveBeenCalledTimes(2);
  });

  it("cancels during retry backoff", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      );
    const controller = new AbortController();
    const check = expect(
      setup(fetch).requestJson({ path: "/", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await check;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("paces request starts and isolates independent provider clients", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      starts.push(Date.now());
      return Promise.resolve(json());
    });
    const client = setup(fetch, { requestsPerSecond: 2 });
    const results = [
      client.requestJson({ path: "/" }),
      client.requestJson({ path: "/" }),
      client.requestJson({ path: "/" }),
    ];
    const other = setup(fetch, { provider: "IGDB" }).requestJson({ path: "/" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
    await Promise.all([...results, other]);
    expect(starts[2]! - starts[0]!).toBe(500);
    expect(starts[3]! - starts[2]!).toBe(500);
  });

  it("bounds simultaneous in-flight requests independently of pacing", async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise((resolve) => {
          active += 1;
          peak = Math.max(peak, active);
          setTimeout(() => {
            active -= 1;
            resolve(json());
          }, 100);
        }),
    );
    const client = setup(fetch, { concurrency: 2 });
    const results = Array.from({ length: 5 }, () =>
      client.requestJson({ path: "/" }),
    );
    await vi.runAllTimersAsync();
    await Promise.all(results);
    expect(peak).toBe(2);
  });

  it.each([
    () => new Response("not JSON"),
    () => new Response(new Uint8Array([0xff])),
    () => new Response(null),
  ])("rejects invalid or empty JSON without retry", async (response) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response());
    await expect(setup(fetch).requestJson({ path: "/" })).rejects.toMatchObject(
      { code: "INVALID_JSON" },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    "bounds declared and streamed response sizes (declared: %s)",
    async (declared) => {
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(100));
        },
        cancel,
      });
      const response = new Response(
        stream,
        declared ? { headers: { "content-length": "100" } } : {},
      );
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(response);
      await expect(
        setup(fetch, { maxResponseBytes: 50 }).requestJson({ path: "/" }),
      ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
      expect(cancel).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "https://user:secret@provider.example/",
    "/#token",
  ])("rejects unsafe destinations: %s", async (path) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(setup(fetch).requestJson({ path })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sanitizes response-validation errors", () => {
    expect(() =>
      validateProviderResponse("IGDB", z.object({ secret: z.number() }), {
        secret: "private",
      }),
    ).toThrow(ProviderHttpError);
    try {
      validateProviderResponse("IGDB", z.number(), "private");
    } catch (error) {
      expect(String(error)).not.toContain("private");
    }
  });

  it("parses delta and HTTP-date Retry-After without accepting invalid values", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(retryAfterMilliseconds("2")).toBe(2000);
    expect(retryAfterMilliseconds("Tue, 20 Oct 2026 12:00:03 GMT", now)).toBe(
      3000,
    );
    expect(retryAfterMilliseconds("Tue, 20 Oct 2026 11:59:59 GMT", now)).toBe(
      0,
    );
    for (const value of [null, "", "-1", "garbage", "Infinity"])
      expect(retryAfterMilliseconds(value)).toBeNull();
  });
});
