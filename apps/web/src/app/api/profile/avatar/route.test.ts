import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { AvatarConflictError } from "@townhawll/profile/avatar";
import { POST, DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn<
    () => Promise<{
      user: { id: string; status: string; emailVerified: Date | null };
    } | null>
  >(),
  replace:
    vi.fn<typeof import("@townhawll/profile/avatar").replaceProfileAvatar>(),
  remove:
    vi.fn<typeof import("@townhawll/profile/avatar").removeProfileAvatar>(),
  limit: vi.fn(),
  revalidate: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
// Exercise real account/verification guards without initializing NextAuth's Next.js runtime.
vi.mock("@townhawll/auth", () => import("@townhawll/auth/guards"));
vi.mock("@townhawll/profile/avatar", async (original) => ({
  ...(await original<typeof import("@townhawll/profile/avatar")>()),
  replaceProfileAvatar: mocks.replace,
  removeProfileAvatar: mocks.remove,
}));
vi.mock("@townhawll/cache", () => ({ takeRateLimit: mocks.limit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.capture }));
vi.mock("@townhawll/observability", () => ({
  createLogger: () => ({}),
  getOrCreateRequestId: () => "avatar-request-fixture",
  withRequestId: () => ({ warn: vi.fn(), error: vi.fn() }),
}));

function request(
  method = "POST",
  origin: string | null = "http://localhost:3000",
) {
  const form = new FormData();
  form.set(
    "image",
    new File([Uint8Array.of(1, 2)], "avatar.png", { type: "image/png" }),
  );
  form.set("userId", "victim-user");
  return new NextRequest("http://localhost:3000/api/profile/avatar", {
    method,
    headers: origin ? { origin } : {},
    ...(method === "POST" ? { body: form } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: "session-user", status: "ACTIVE", emailVerified: new Date() },
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.replace.mockResolvedValue({
    avatarUrl: "https://media.example.com/users/new.webp",
    cleanupFailed: false,
  });
  mocks.remove.mockResolvedValue({
    removed: true,
    cleanupFailed: false,
    avatarUrl: null,
  });
});

test("uploads and removals use the verified session identity, never a form userId", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.replace).toHaveBeenCalledWith("session-user", {
    bytes: Uint8Array.of(1, 2),
    claimedContentType: "image/png",
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/settings/profile");
  expect((await DELETE(request("DELETE"))).status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("session-user");
});

test.each([
  null,
  { user: { id: "user", status: "BANNED", emailVerified: new Date() } },
  { user: { id: "user", status: "SUSPENDED", emailVerified: new Date() } },
  { user: { id: "user", status: "ACTIVE", emailVerified: null } },
])(
  "unavailable/unverified sessions cannot mutate avatars: %j",
  async (session) => {
    mocks.auth.mockResolvedValue(session);
    expect((await POST(request())).status).toBe(401);
    expect((await DELETE(request("DELETE"))).status).toBe(401);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  },
);

test.each([null, "https://evil.example", "http://localhost:3000.evil.example"])(
  "cross-origin or originless requests are rejected: %s",
  async (origin) => {
    expect((await POST(request("POST", origin))).status).toBe(403);
    expect((await DELETE(request("DELETE", origin))).status).toBe(403);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  },
);

test("rate limits reject changes before storage is invoked", async () => {
  mocks.limit.mockResolvedValue({ allowed: false });
  expect((await POST(request())).status).toBe(429);
  expect(mocks.replace).not.toHaveBeenCalled();
});

test("concurrent avatar changes return 409 without noisy exception reporting", async () => {
  mocks.replace.mockRejectedValueOnce(new AvatarConflictError());
  expect((await POST(request())).status).toBe(409);
  expect(mocks.capture).not.toHaveBeenCalled();
});

test("provider errors stay internal and responses never expose secrets", async () => {
  mocks.replace.mockRejectedValueOnce(new Error("private-storage-credential"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private-storage-credential");
});

test("removal returns an existing OAuth fallback for the preview", async () => {
  mocks.remove.mockResolvedValueOnce({
    removed: true,
    cleanupFailed: false,
    avatarUrl: "https://google.example/avatar",
  });
  expect(await (await DELETE(request("DELETE"))).json()).toMatchObject({
    avatarUrl: "https://google.example/avatar",
  });
});
