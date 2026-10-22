import { describe, expect, it, vi } from "vitest";

import type { CandidateField } from "../../contracts.js";
import { gameDetailsCandidateSchema } from "../../game-candidates.js";
import { gameSupplementCandidateSchema } from "../../game-supplements.js";
import {
  steamAppIdentitySchema,
  type SteamAppIdentity,
} from "../../identity.js";
import { game as igdbGame } from "../igdb/fixtures.js";
import { normalizeGame } from "../igdb/normalize.js";
import { gameSchema } from "../igdb/schemas.js";
import { app, instant } from "./fixtures.js";
import { createSteamAdapter } from "./index.js";
import type { SteamClientOptions } from "./client.js";

const identity: SteamAppIdentity = {
  provider: "STEAM",
  entity: "app",
  id: "620",
};
function value<T>(field: CandidateField<T>): T {
  if (field.state !== "known") throw new Error("Expected known fixture value.");
  return field.value;
}
function setup(
  route: (url: URL) => unknown = () => ({
    "620": { success: true, data: app },
  }),
  http: SteamClientOptions["http"] = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>((input) => {
    const data = route(
      new URL(input instanceof Request ? input.url : String(input)),
    );
    return Promise.resolve(
      data instanceof Response ? data : Response.json(data),
    );
  });
  const logger = { warn: vi.fn() };
  const adapter = createSteamAdapter(
    { http: { maxAttempts: 1, ...http } },
    { fetch, now: () => new Date(instant), logger },
  );
  return { adapter, fetch, logger };
}
function candidate(ids: string[] = ["620"]) {
  return gameDetailsCandidateSchema.parse(
    normalizeGame(
      gameSchema.parse({
        ...igdbGame,
        external_games: ids.map((uid, index) => ({
          id: index + 1,
          uid,
          external_game_source: { name: "Steam" },
        })),
      }),
      instant,
    ),
  );
}

describe("Steam Store adapter", () => {
  it("requests one confirmed App ID in English with explicit country and no API key", async () => {
    const { adapter, fetch } = setup((url) => {
      expect(url.origin + url.pathname).toBe(
        "https://store.steampowered.com/api/appdetails",
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({
        appids: "620",
        cc: "GB",
        l: "english",
        filters: "basic,platforms",
      });
      return { "620": { success: true, data: app } };
    });
    const result = await adapter.getAppDetails(identity, { countryCode: "GB" });
    expect(result).toMatchObject({
      identity,
      appType: "GAME",
      sourceAppType: "game",
      requestedCountryCode: "GB",
      requestedLanguageCode: "en",
      provenance: { fetchedAt: instant, sourceUpdatedAt: null },
    });
    expect(result?.provenance.sourceUrl).toBe(
      "https://store.steampowered.com/app/620?cc=GB&l=english",
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { Accept: "application/json" },
      }),
    );
  });
  it.each(["0", "0620", "-1", "1.5", "name", "620&appids=570", "4294967296"])(
    "rejects invalid App ID %s before I/O",
    async (id) => {
      const { adapter, fetch } = setup();
      await expect(
        adapter.getAppDetails({ ...identity, id }),
      ).rejects.toMatchObject({ provider: "STEAM", code: "INVALID_REQUEST" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("requires a qualified Steam identity rather than a provider-local number alone", () => {
    expect(
      steamAppIdentitySchema.safeParse({
        provider: "IGDB",
        entity: "game",
        id: "620",
      }).success,
    ).toBe(false);
    expect(steamAppIdentitySchema.safeParse("620").success).toBe(false);
    expect(
      steamAppIdentitySchema.safeParse({ ...identity, id: "4294967295" })
        .success,
    ).toBe(true);
  });
  it("rejects invalid regional options before I/O", async () => {
    const { adapter, fetch } = setup();
    await expect(
      adapter.getAppDetails(identity, { countryCode: "US&other=1" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("treats success:false as unavailable without claiming a region/removal reason", async () => {
    const { adapter, fetch } = setup(() => ({ "620": { success: false } }));
    expect(await adapter.getAppDetails(identity)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    {},
    [],
    { "570": { success: true, data: { ...app, steam_appid: 620 } } },
    { "620": { success: true, data: { ...app, steam_appid: 570 } } },
    { "620": { success: "true", data: app } },
    { "620": { success: true, data: { ...app, steam_appid: "620" } } },
    { "620": { success: true } },
    { "620": { success: true, data: { ...app, type: 123 } } },
    { "620": { success: true, data: { ...app, type: "" } } },
    { "620": { success: true, data: app }, "570": { success: false } },
  ])(
    "rejects malformed/mismatched responses instead of selecting an arbitrary entry",
    async (response) => {
      const { adapter } = setup(() => response);
      await expect(adapter.getAppDetails(identity)).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    },
  );
  it("handles non-JSON upstream bodies as typed errors", async () => {
    const { adapter } = setup(
      () => new Response("<html>private provider error</html>"),
    );
    await expect(adapter.getAppDetails(identity)).rejects.toMatchObject({
      code: "INVALID_JSON",
      message: "Provider STEAM request failed (INVALID_JSON).",
    });
  });
  it.each([
    ["game", "GAME"],
    ["dlc", "DLC"],
    ["demo", "DEMO"],
    ["music", "OTHER"],
    ["software", "OTHER"],
    ["constructor", "OTHER"],
  ])("preserves app type %s", async (type, expected) => {
    const { adapter } = setup(() => ({
      "620": { success: true, data: { ...app, type } },
    }));
    expect(await adapter.getAppDetails(identity)).toMatchObject({
      appType: expected,
      sourceAppType: type,
    });
  });
  it("extracts minimum/recommended rows for Windows, macOS and Linux independently", async () => {
    const result = await setup().adapter.getAppDetails(identity);
    const rows = value(result!.systemRequirements);
    expect(rows.map((row) => `${row.platform}:${row.tier}`)).toEqual([
      "WINDOWS:MINIMUM",
      "WINDOWS:RECOMMENDED",
      "MACOS:MINIMUM",
      "LINUX:MINIMUM",
      "LINUX:RECOMMENDED",
    ]);
    expect(rows[0]).toMatchObject({
      os: "Windows 10 64-bit",
      ramMb: 8192,
      storageMb: 51200,
      source: "Steam Store",
      provenance: { identity, fetchedAt: instant, sourceUpdatedAt: null },
    });
    expect(rows[1]).toMatchObject({
      os: "Windows 11",
      ramMb: 16384,
      storageMb: 66560,
    });
    expect(rows[2]).toMatchObject({
      os: "macOS 10.15",
      ramMb: 2048,
      storageMb: 500,
    });
    expect(rows[3]).toMatchObject({
      os: "Ubuntu 20.04",
      ramMb: 4096,
      storageMb: 1536,
    });
    expect(rows[4]).toMatchObject({ ramMb: 8192, storageMb: 2048 });
  });
  it("preserves false platform flags alongside still-supplied legacy requirements", async () => {
    const result = await setup().adapter.getAppDetails(identity);
    expect(
      result?.platformSupport.find((entry) => entry.platform === "MACOS")
        ?.supported,
    ).toMatchObject({ value: false });
    expect(
      value(result!.systemRequirements).some((row) => row.platform === "MACOS"),
    ).toBe(true);
  });
  it("does not default missing platform information to false", async () => {
    const { adapter } = setup(() => ({
      "620": { success: true, data: { steam_appid: 620, type: "game" } },
    }));
    const result = await adapter.getAppDetails(identity);
    expect(result?.name).toMatchObject({ state: "missing" });
    expect(
      result?.platformSupport.every(
        (entry) => entry.supported.state === "missing",
      ),
    ).toBe(true);
    expect(result?.systemRequirements).toMatchObject({
      state: "missing",
      reason: "NOT_PROVIDED",
    });
  });
  it.each([[], {}, { minimum: "", recommended: null }, null])(
    "accepts empty requirement blocks",
    async (block) => {
      const { adapter } = setup(() => ({
        "620": {
          success: true,
          data: { steam_appid: 620, type: "game", pc_requirements: block },
        },
      }));
      const result = await adapter.getAppDetails(identity);
      expect(result?.systemRequirements).toMatchObject({
        state: "missing",
        reason: "NOT_PROVIDED",
      });
      expect(result?.issues).toEqual([]);
    },
  );
  it("isolates invalid tiers/platform flags without dropping other valid requirements", async () => {
    const { adapter } = setup(() => ({
      "620": {
        success: true,
        data: {
          ...app,
          pc_requirements: {
            minimum: app.pc_requirements.minimum,
            recommended: 42,
          },
          linux_requirements: ["bad"],
          platforms: { windows: true, mac: "false", linux: false },
        },
      },
    }));
    const result = await adapter.getAppDetails(identity);
    expect(
      value(result!.systemRequirements).map(
        (row) => `${row.platform}:${row.tier}`,
      ),
    ).toEqual(["WINDOWS:MINIMUM", "MACOS:MINIMUM"]);
    expect(
      result?.platformSupport.find((entry) => entry.platform === "MACOS")
        ?.supported,
    ).toEqual({ state: "missing", reason: "UNAVAILABLE" });
    expect(result?.issues.map((issue) => issue.section)).toEqual([
      "platformSupport.MACOS",
      "systemRequirements.WINDOWS.RECOMMENDED",
      "systemRequirements.LINUX",
    ]);
  });
  it("bounds requirement fragments and marks unusable sections unavailable", async () => {
    const { adapter } = setup(() => ({
      "620": {
        success: true,
        data: {
          steam_appid: 620,
          type: "game",
          pc_requirements: { minimum: "x".repeat(65_537) },
        },
      },
    }));
    expect((await adapter.getAppDetails(identity))?.systemRequirements).toEqual(
      { state: "missing", reason: "UNAVAILABLE" },
    );
  });
  it("retries transient and rate-limit failures with a bounded attempt count", async () => {
    let calls = 0;
    const { adapter, fetch } = setup(
      () => {
        calls++;
        return calls === 1
          ? new Response(null, { status: 429, headers: { "Retry-After": "0" } })
          : calls === 2
            ? new Response(null, { status: 503 })
            : { "620": { success: true, data: app } };
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect((await adapter.getAppDetails(identity))?.appType).toBe("GAME");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not retry regional HTTP denial or invent a fallback market", async () => {
    const { adapter, fetch } = setup(
      () => new Response(null, { status: 403 }),
      { maxAttempts: 3 },
    );
    await expect(
      adapter.getAppDetails(identity, { countryCode: "DE" }),
    ).rejects.toMatchObject({ provider: "STEAM", code: "HTTP", status: 403 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("paces requests conservatively and rejects unsafe limit overrides", async () => {
    const starts: number[] = [];
    const { adapter } = setup(() => {
      starts.push(Date.now());
      return { "620": { success: false } };
    });
    await Promise.all([
      adapter.getAppDetails(identity),
      adapter.getAppDetails(identity),
    ]);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(950);
    expect(() =>
      createSteamAdapter({ http: { requestsPerSecond: 2 } }),
    ).toThrow(/conservative/);
    expect(() => createSteamAdapter({ http: { concurrency: 2 } })).toThrow(
      /conservative/,
    );
    expect(() => createSteamAdapter({ http: { maxAttempts: 4 } })).toThrow(
      /conservative/,
    );
  });
  it("honors attempt timeouts using the shared transport", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const adapter = createSteamAdapter(
      { http: { timeoutMs: 10, maxAttempts: 1 } },
      { fetch },
    );
    await expect(adapter.getAppDetails(identity)).rejects.toMatchObject({
      provider: "STEAM",
      code: "TIMEOUT",
    });
  });
  it("validates supplementary provenance and unique platform/tier rows", async () => {
    const result = await setup().adapter.getAppDetails(identity);
    expect(
      gameSupplementCandidateSchema.safeParse({
        ...result,
        identity: { ...identity, id: "570" },
      }).success,
    ).toBe(false);
    expect(
      gameSupplementCandidateSchema.safeParse({
        ...result,
        platformSupport: [
          result!.platformSupport[0],
          result!.platformSupport[0],
          result!.platformSupport[0],
        ],
      }).success,
    ).toBe(false);
    const requirements = value(result!.systemRequirements);
    expect(
      gameSupplementCandidateSchema.safeParse({
        ...result,
        systemRequirements: {
          ...result!.systemRequirements,
          value: [requirements[0], requirements[0]],
        },
      }).success,
    ).toBe(false);
  });
});

describe("optional Steam enrichment", () => {
  it("uses confirmed IGDB identities and does not overwrite canonical game metadata", async () => {
    const original = candidate();
    const before = structuredClone(original);
    const result = await setup().adapter.enrichGame(original);
    expect(value(result.supplementary).name).toMatchObject({
      value: "Portal 2",
    });
    expect(result.candidate).toEqual(before);
    expect(original).toEqual(before);
    expect(result.candidate.title.title).toBe("Example Adventure");
    expect(result.candidate.title.identity).toEqual({
      provider: "IGDB",
      entity: "game",
      id: "42",
    });
  });
  it("supports a trusted existing mapping without requiring duplicate IGDB evidence", async () => {
    const original = candidate([]);
    original.title.mappings.push({
      identity,
      fetchedAt: instant,
      sourceUpdatedAt: null,
      sourceUrl: "https://store.steampowered.com/app/620",
    });
    expect(
      (await setup().adapter.enrichGame(original)).supplementary.state,
    ).toBe("known");
  });
  it("skips enrichment when no confirmed Steam identity exists", async () => {
    const { adapter, fetch } = setup();
    const result = await adapter.enrichGame(candidate([]));
    expect(result.supplementary).toEqual({
      state: "missing",
      reason: "NOT_PROVIDED",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not guess between conflicting Steam identities; permits explicit selection from evidence", async () => {
    const { adapter, fetch } = setup();
    const original = candidate(["620", "367520"]);
    expect((await adapter.enrichGame(original)).supplementary).toEqual({
      state: "missing",
      reason: "UNSUPPORTED",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await adapter.enrichGame(original, { identity })).supplementary.state,
    ).toBe("known");
  });
  it("rejects an explicitly requested identity absent from the game's mappings/evidence", async () => {
    const { adapter, fetch } = setup();
    await expect(
      adapter.enrichGame(candidate(), { identity: { ...identity, id: "570" } }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns the original game when Steam is unavailable", async () => {
    const original = candidate();
    const { adapter } = setup(() => ({ "620": { success: false } }));
    const result = await adapter.enrichGame(original);
    expect(result.candidate).toEqual(original);
    expect(result.supplementary).toEqual({
      state: "missing",
      reason: "UNAVAILABLE",
    });
    expect(result.issues).toEqual([]);
  });
  it.each([
    new Response("private provider message", { status: 503 }),
    Response.json({
      "620": { success: true, data: { ...app, steam_appid: 570 } },
    }),
  ])(
    "preserves IGDB usability after HTTP or validation failures",
    async (response) => {
      const original = candidate();
      const { adapter, logger } = setup(() => response.clone());
      const result = await adapter.enrichGame(original);
      expect(result.candidate).toEqual(original);
      expect(result.supplementary).toEqual({
        state: "missing",
        reason: "UNAVAILABLE",
      });
      expect(result.issues).toHaveLength(1);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        "private provider message",
      );
    },
  );
  it("propagates intentional cancellation without making a provider request", async () => {
    const { adapter, fetch } = setup();
    await expect(
      adapter.enrichGame(candidate(), { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("propagates in-flight enrichment cancellation instead of hiding it as an unavailable supplement", async () => {
    const controller = new AbortController();
    const logger = { warn: vi.fn() };
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
          controller.abort("private caller context");
        }),
    );
    const original = candidate();
    const before = structuredClone(original);
    const adapter = createSteamAdapter({}, { fetch, logger });
    await expect(
      adapter.enrichGame(original, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(original).toEqual(before);
    expect(fetch).toHaveBeenCalledOnce();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
