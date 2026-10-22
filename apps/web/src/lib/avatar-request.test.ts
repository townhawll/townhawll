import { expect, test } from "vitest";
import { AVATAR_MAX_REQUEST_BYTES, readAvatarFormData } from "./avatar-request";

test("multipart request limits apply even without Content-Length", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(AVATAR_MAX_REQUEST_BYTES + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const options: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    duplex: "half",
    headers: { "content-type": "multipart/form-data; boundary=avatar-test" },
  };
  const request = new Request(
    "http://localhost:3000/api/profile/avatar",
    options,
  );
  expect(request.headers.has("content-length")).toBe(false);
  await expect(readAvatarFormData(request)).rejects.toMatchObject({
    code: "INVALID_FILE",
  });
  expect(cancelled).toBe(true);
});

test("malformed multipart requests produce safe validation errors", async () => {
  const request = new Request("http://localhost:3000/api/profile/avatar", {
    method: "POST",
    body: "invalid",
    headers: { "content-type": "multipart/form-data" },
  });
  await expect(readAvatarFormData(request)).rejects.toMatchObject({
    code: "INVALID_FILE",
    message: "Choose a valid image upload.",
  });
});
