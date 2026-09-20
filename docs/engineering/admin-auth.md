# Admin authentication and authorization

TownHawll uses one account system for the public and admin applications. A staff
member is a normal `User` with one or more `StaffRoleAssignment` rows. There is
no separate admin user or password store.

## Roles and permissions

The supported staff roles are `CONTENT_EDITOR`, `MODERATOR`, `ADMIN`,
`TECHNICAL_ADMIN`, and `OWNER`. A user may hold multiple roles. Effective
permissions are the deduplicated union of every assigned role; `OWNER` receives
every defined permission. The database composite primary key on `(userId, role)`
prevents duplicate assignments.

`ADMIN` can manage only `CONTENT_EDITOR` and `MODERATOR` assignments and basic
staff metadata. An `ADMIN` cannot modify any target that also holds `ADMIN`,
`TECHNICAL_ADMIN`, or `OWNER`, including indirectly adding or removing a basic
role. Only an `OWNER` can manage privileged roles. Removing `OWNER` must provide
the current owner count and is denied when it would remove the last owner. The
count and removal must occur in the same database transaction so concurrent
changes cannot bypass this invariant.

These rules live in `packages/auth`, must be checked again in every future role
mutation, and are independent of which controls the UI displays. Runtime role
input must be parsed with the shared `staffRoleSchema` or `parseStaffRole`
helper before mutation.

## Admin sign-in

The admin app supports email and password plus Google OAuth. Password login
accepts email only and uses the normal TownHawll password verifier and database
session. Authentication errors are generic and do not reveal staff membership.

Admin Google OAuth is an existing-account flow. Google must provide a verified
email identity that resolves to an existing TownHawll user or linked Google
account. The admin adapter cannot create a `User` or `Profile`, and OAuth never
creates a staff assignment or grants a role. Existing active non-staff users may
authenticate but are sent to `/403`. Unknown, unverified-provider, and inactive
accounts are denied. The public web app retains its separate Google signup
behavior.

## Server authorization

The session cookie identifies the user. Protected admin requests reload the
session, account status, verification state, and current role assignments from
PostgreSQL. Role removal therefore takes effect on the next protected server
request without waiting for a long-lived client permission claim to expire.

The route proxy is only an early cookie-presence check. The authenticated layout
uses `requireCurrentStaff()`, and every sensitive future Server Action or Route
Handler must use `requireCurrentPermission(...)`, another exact permission
guard, or `requireCurrentOwner()`. Permission-filtered navigation is a user
experience feature and is never an authorization boundary.

Current routing behavior is:

- unauthenticated admin requests redirect to `/login` with a validated internal
  callback;
- authenticated users without valid staff access go to `/403`;
- valid staff entering `/` or `/login` go to `/dashboard` or a validated
  internal callback;
- exact permission failures go to `/403` without ending the valid session.

## First local OWNER

Create and verify a normal local account first. In the root `.env`, temporarily
set:

```env
OWNER_BOOTSTRAP_ENABLED=true
```

Then run:

```bash
pnpm staff:bootstrap-owner -- owner@example.com
```

Set the flag back to `false` immediately afterward. The command accepts only a
valid normalized email for an existing verified active user. It runs only with
`NODE_ENV=development` and a localhost PostgreSQL URL, is disabled in
production, and does not create users. Repeating it for the selected owner is
safe; selecting a different account after an owner exists is rejected.

The current bootstrap establishes one initial owner. Future staff-management
mutations may support multiple owners, but they must never remove the final
`OWNER` assignment.

## Current deferred permission surface

Some permissions, including awards, XP adjustment, and `ai.manage`, do not yet
have routes or actions. They remain typed policy definitions for approved later
work. They grant no capability until a server operation explicitly checks and
implements them, and no dead navigation links are shown for them.
