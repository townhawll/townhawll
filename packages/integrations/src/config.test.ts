import { describe, expect, it } from "vitest";

import {
  loadIgdbEnvironment,
  loadSteamEnvironment,
  loadTmdbEnvironment,
} from "./config.js";

describe("provider environment ownership", () => {
  it("validates each provider independently and trims credentials", () => {
    expect(loadTmdbEnvironment({ TMDB_ACCESS_TOKEN: " token " })).toEqual({
      TMDB_ACCESS_TOKEN: "token",
    });
    expect(
      loadIgdbEnvironment({
        IGDB_CLIENT_ID: "id",
        IGDB_CLIENT_SECRET: "secret",
      }),
    ).toEqual({ IGDB_CLIENT_ID: "id", IGDB_CLIENT_SECRET: "secret" });
    expect(loadSteamEnvironment({ STEAM_API_KEY: "key" })).toEqual({
      STEAM_API_KEY: "key",
    });
  });

  it("fails clearly on missing credentials without including their values", () => {
    expect(() => loadTmdbEnvironment({})).toThrow("TMDB_ACCESS_TOKEN");
    expect(() =>
      loadIgdbEnvironment({ IGDB_CLIENT_ID: "private-client-id" }),
    ).toThrow("IGDB_CLIENT_SECRET");
    expect(() => loadSteamEnvironment({ STEAM_API_KEY: " " })).toThrow(
      "STEAM_API_KEY",
    );
    try {
      loadIgdbEnvironment({ IGDB_CLIENT_ID: "private-client-id" });
    } catch (error) {
      expect(String(error)).not.toContain("private-client-id");
    }
  });
});
