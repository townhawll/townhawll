function normalizeIdentifier(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function normalizeEmail(email: string): string {
  return normalizeIdentifier(email);
}

export function normalizeUsername(username: string): string {
  return normalizeIdentifier(username);
}

export async function findUserByEmail(email: string) {
  const { db } = await import("@townhawll/db");

  return db.user.findUnique({
    where: { email: normalizeEmail(email) },
  });
}

export async function findUserByUsername(username: string) {
  const { db } = await import("@townhawll/db");

  return db.user.findUnique({
    where: { username: normalizeUsername(username) },
  });
}

export async function findUserByIdentifier(identifier: string) {
  const { db } = await import("@townhawll/db");
  const normalizedIdentifier = normalizeIdentifier(identifier);

  return db.user.findFirst({
    where: {
      OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
    },
  });
}
