import * as Sentry from "@sentry/nextjs";
import { requireVerifiedUser } from "@townhawll/auth";
import { takeRateLimit } from "@townhawll/cache";
import {
  removeProfileAvatar,
  replaceProfileAvatar,
} from "@townhawll/profile/avatar";
import { StorageValidationError } from "@townhawll/storage";
import {
  createLogger,
  getOrCreateRequestId,
  withRequestId,
} from "@townhawll/observability";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { auth } from "../../../../auth";
import { getClientIp } from "../../../(auth)/_lib/client-ip";

const logger = createLogger("web");
const MAX_REQUEST_BYTES = 5 * 1024 * 1024 + 64 * 1024;

async function getUser() {
  try {
    return requireVerifiedUser(await auth());
  } catch {
    return null;
  }
}

async function allowAvatarChange(request: NextRequest, userId: string) {
  const [userLimit, ipLimit] = await Promise.all([
    takeRateLimit({
      namespace: "avatar:user",
      signal: userId,
      limit: 10,
      windowSeconds: 60 * 60,
    }),
    takeRateLimit({
      namespace: "avatar:ip",
      signal: getClientIp(request.headers),
      limit: 30,
      windowSeconds: 60 * 60,
    }),
  ]);
  return userLimit.allowed && ipLimit.allowed;
}

function errorResponse(message: string, status: number, requestId: string) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    },
  );
}

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers);
  const requestLogger = withRequestId(logger, requestId);
  const user = await getUser();
  if (!user)
    return errorResponse("Sign in to upload an avatar.", 401, requestId);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("Choose an image smaller than 5 MB.", 413, requestId);
  }

  try {
    if (!(await allowAvatarChange(request, user.id))) {
      return errorResponse(
        "Too many avatar changes. Please try again later.",
        429,
        requestId,
      );
    }
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return errorResponse("Choose an image to upload.", 400, requestId);
    }
    const result = await replaceProfileAvatar(user.id, {
      bytes: new Uint8Array(await image.arrayBuffer()),
      claimedContentType: image.type,
    });
    if (result.cleanupFailed) {
      requestLogger.warn({
        event: "avatar_previous_object_cleanup_failure",
        userId: user.id,
      });
    }
    revalidatePath("/u/[username]", "page");
    revalidatePath("/settings/profile");
    return Response.json(
      { avatarUrl: result.avatarUrl },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    if (error instanceof StorageValidationError) {
      return errorResponse(error.message, 400, requestId);
    }
    requestLogger.error({
      err: error,
      event: "avatar_upload_failure",
      userId: user.id,
    });
    Sentry.captureException(error);
    return errorResponse(
      "We could not upload your avatar. Please try again.",
      500,
      requestId,
    );
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers);
  const requestLogger = withRequestId(logger, requestId);
  const user = await getUser();
  if (!user)
    return errorResponse("Sign in to remove an avatar.", 401, requestId);

  try {
    if (!(await allowAvatarChange(request, user.id))) {
      return errorResponse(
        "Too many avatar changes. Please try again later.",
        429,
        requestId,
      );
    }
    const result = await removeProfileAvatar(user.id);
    if (result.cleanupFailed) {
      requestLogger.warn({
        event: "avatar_object_cleanup_failure",
        userId: user.id,
      });
    }
    revalidatePath("/u/[username]", "page");
    revalidatePath("/settings/profile");
    return Response.json(
      { removed: result.removed },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    requestLogger.error({
      err: error,
      event: "avatar_remove_failure",
      userId: user.id,
    });
    Sentry.captureException(error);
    return errorResponse(
      "We could not remove your avatar. Please try again.",
      500,
      requestId,
    );
  }
}
