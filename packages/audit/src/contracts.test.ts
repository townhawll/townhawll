import { describe, expect, it } from "vitest";
import { prepareAuditEvent } from "./contracts.ts";

const event = {
  actorId: "staff-123",
  actorRoles: ["CONTENT_EDITOR"],
  action: "catalogue.import.requested",
  targetType: "catalogueImport",
  targetId: "operation-123",
  result: "SUCCESS",
  changes: { status: { before: null, after: "PENDING" } },
  requestId: "request-123",
};
describe("safe audit records", () => {
  it("accepts safe evidence and deduplicates effective roles", () => {
    expect(
      prepareAuditEvent({ ...event, actorRoles: ["OWNER", "OWNER"] })
        .actorRoles,
    ).toEqual(["OWNER"]);
  });
  it("rejects arbitrary raw before/after payloads and credential fields", () => {
    expect(() =>
      prepareAuditEvent({
        ...event,
        changes: { requestBody: { password: "private" } },
      }),
    ).toThrow("Invalid safe audit event.");
    expect(() => prepareAuditEvent({ ...event, password: "private" })).toThrow(
      "Invalid safe audit event.",
    );
    expect(() =>
      prepareAuditEvent({
        ...event,
        changes: {
          status: { before: null, after: { access_token: "private" } },
        },
      }),
    ).toThrow();
  });
  it("requires reasons for privileged actions and validates identifiers", () => {
    expect(() =>
      prepareAuditEvent({ ...event, action: "staff.role.changed" }),
    ).toThrow("requires a reason");
    expect(
      prepareAuditEvent({
        ...event,
        action: "staff.role.changed",
        reason: "Explicit approved staff change",
      }).reason,
    ).toBeDefined();
    expect(() =>
      prepareAuditEvent({ ...event, requestId: "bad\nrequest" }),
    ).toThrow();
    expect(() =>
      prepareAuditEvent({ ...event, actorRoles: ["SUPERADMIN"] }),
    ).toThrow();
  });
});
