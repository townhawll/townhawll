import { normalizeUsername } from "@townhawll/profile";

function normalizeIdentifier(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function normalizeEmail(email: string): string {
  return normalizeIdentifier(email);
}

export { normalizeUsername };

export async function findUserByEmail(email: string) {
  const { db } = await import("@townhawll/db");

  return db.user.findUnique({
    where: { email: normalizeEmail(email) },
  });
}

export async function findUserByUsername(username: string) {
  const { db } = await import("@townhawll/db");

  return db.user.findFirst({
    where: { profile: { is: { username: normalizeUsername(username) } } },
  });
}

export async function findUserByIdentifier(identifier: string) {
  const { db } = await import("@townhawll/db");
  const normalizedIdentifier = normalizeIdentifier(identifier);

  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: normalizedIdentifier },
        { profile: { is: { username: normalizedIdentifier } } },
      ],
    },
    include: { profile: { select: { username: true } } },
  });

  return user === null
    ? null
    : { ...user, username: user.profile?.username ?? null };
}
