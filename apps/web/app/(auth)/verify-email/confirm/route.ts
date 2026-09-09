import { verifyEmailToken } from "@townhawll/auth/signup";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const result = token ? await verifyEmailToken(token) : "invalid";
  const destination = new URL(
    result === "verified"
      ? "/verify-email/success"
      : `/verify-email/error?reason=${result}`,
    request.url,
  );
  return NextResponse.redirect(destination);
}
