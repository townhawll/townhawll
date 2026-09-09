import { createTownHawllAuth } from "@townhawll/auth/session";

export const {
  auth,
  handlers: { GET, POST },
  signIn,
  signOut,
} = createTownHawllAuth();
