import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  read: vi.fn<
    NonNullable<import("@townhawll/storage").ObjectStorage["readObject"]>
  >(),
  driver: "local",
}));
vi.mock("@townhawll/config/server-env", () => ({
  loadStorageEnvironment: () => ({ driver: mocks.driver }),
}));
vi.mock("@townhawll/storage", async (original) => ({
  ...(await original<typeof import("@townhawll/storage")>()),
  getStorage: () => Promise.resolve({ readObject: mocks.read }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.driver = "local";
  mocks.read.mockResolvedValue({
    body: Uint8Array.of(1),
    contentType: "image/png",
    cacheControl: "public, max-age=31536000, immutable",
  });
});

test("legacy avatar paths remain available through local public delivery", async () => {
  const key = ["users", "user_1", "avatar", "old.png"];
  const response = await GET(
    new Request(
      "http://localhost:3000/api/storage/users/user_1/avatar/old.png",
    ),
    { params: Promise.resolve({ key }) },
  );
  expect(response.status).toBe(200);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(key.join("/"));
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});

test("local delivery refuses private prefixes and unsafe keys without reading bytes", async () => {
  for (const key of [
    ["private", "secret.png"],
    ["users", "..", "secret.png"],
  ])
    expect(
      (
        await GET(new Request("http://localhost:3000/api/storage/file.png"), {
          params: Promise.resolve({ key }),
        })
      ).status,
    ).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
});

test("R2 deployments do not expose local development storage", async () => {
  mocks.driver = "r2";
  expect(
    (
      await GET(
        new Request("http://localhost:3000/api/storage/users/file.png"),
        { params: Promise.resolve({ key: ["users", "file.png"] }) },
      )
    ).status,
  ).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
});
