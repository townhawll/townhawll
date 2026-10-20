import { afterEach, describe, expect, it, vi } from "vitest";

import { createTwitchTokenProvider } from "./twitch.js";

const credentials = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
};
function response(value = "application-token", expires = 3600) {
  return Response.json({
    access_token: value,
    expires_in: expires,
    token_type: "bearer",
  });
}
afterEach(() => vi.useRealTimers());

describe("Twitch application tokens", () => {
  it("sends credentials in the form body, caches the token, and refreshes before expiration", async () => {
    let now = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(response()),
    );
    const provider = createTwitchTokenProvider(credentials, {
      fetch,
      now: () => now,
    });
    expect(await provider.get()).toBe("application-token");
    now = 3_539_999;
    expect(await provider.get()).toBe("application-token");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0]!;
    expect(url instanceof Request ? url.url : String(url)).toBe(
      "https://id.twitch.tv/oauth2/token",
    );
    expect(options).toMatchObject({
      method: "POST",
      redirect: "manual",
      credentials: "omit",
      body: "client_id=test-client-id&client_secret=test-client-secret&grant_type=client_credentials",
    });
    now = 3_540_000;
    await provider.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("shares one refresh among concurrent consumers", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(response()),
    );
    const provider = createTwitchTokenProvider(credentials, { fetch });
    expect(
      await Promise.all(Array.from({ length: 8 }, () => provider.get())),
    ).toEqual(Array<string>(8).fill("application-token"));
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("uses a proportional margin for short token lifetimes", async () => {
    let now = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(response("short", 10)),
    );
    const provider = createTwitchTokenProvider(credentials, {
      fetch,
      now: () => now,
    });
    await provider.get();
    now = 8_999;
    await provider.get();
    expect(fetch).toHaveBeenCalledOnce();
    now = 9_000;
    await provider.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not evict a newer token when an older request gets a late 401", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response("old"))
      .mockResolvedValueOnce(response("new"));
    const provider = createTwitchTokenProvider(credentials, { fetch });
    await provider.get();
    provider.invalidate("old");
    expect(await provider.get()).toBe("new");
    provider.invalidate("old");
    expect(await provider.get()).toBe("new");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("cancels a consumer without cancelling the shared refresh", async () => {
    let resolveResponse: (response: Response) => void = () => {
      throw new Error("Response promise not initialized.");
    };
    const promise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(() => promise);
    const provider = createTwitchTokenProvider(credentials, { fetch });
    const controller = new AbortController();
    const cancelled = expect(
      provider.get(controller.signal),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    const other = provider.get();
    controller.abort();
    await cancelled;
    resolveResponse(response());
    expect(await other).toBe("application-token");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("makes no request for an already cancelled consumer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      createTwitchTokenProvider(credentials, { fetch }).get(
        AbortSignal.abort(),
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sanitizes invalid token responses and permits a later explicit retry", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "private-value",
          expires_in: -1,
          token_type: "bearer",
        }),
      )
      .mockResolvedValueOnce(response());
    const provider = createTwitchTokenProvider(credentials, { fetch });
    await expect(provider.get()).rejects.toMatchObject({
      provider: "TWITCH",
      code: "INVALID_RESPONSE",
      message: "Provider TWITCH request failed (INVALID_RESPONSE).",
    });
    expect(await provider.get()).toBe("application-token");
  });
  it("does not automatically replay a failed token-minting request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response("private upstream message", { status: 503 }),
      ),
    );
    await expect(
      createTwitchTokenProvider(credentials, { fetch }).get(),
    ).rejects.toMatchObject({ provider: "TWITCH", status: 503 });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
