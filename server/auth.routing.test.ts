import assert from "node:assert/strict";
import { test } from "node:test";
import { getPostLoginRedirect, loginPortalMismatch } from "./auth";

test("agency clients are routed only to a single persisted client assignment", () => {
  assert.equal(
    getPostLoginRedirect({ role: "agency_client", clientAccess: [42] }),
    "/client/42/dashboard",
  );
  assert.equal(
    getPostLoginRedirect({ role: "agency_client", clientAccess: [42, 73] }),
    "/",
  );
  assert.equal(
    getPostLoginRedirect({ role: "agency_client", clientAccess: [] }),
    "/",
  );
  assert.equal(
    getPostLoginRedirect({ role: "agency_client", clientAccess: null }),
    "/",
  );
  assert.equal(
    getPostLoginRedirect({ role: "agency_client", clientAccess: [0] }),
    "/",
  );
  assert.equal(
    getPostLoginRedirect({ role: "agency_admin", clientAccess: [42] }),
    "/",
  );
  assert.equal(getPostLoginRedirect(undefined), "/");
});

test("login entry points do not open the wrong role's portal", () => {
  assert.equal(loginPortalMismatch("client", "agency_client"), false);
  assert.equal(loginPortalMismatch("client", "agency_admin"), true);
  assert.equal(loginPortalMismatch("client", "agency_employee"), true);
  assert.equal(loginPortalMismatch("admin", "agency_client"), true);
  assert.equal(loginPortalMismatch("admin", "owner"), false);
  assert.equal(loginPortalMismatch(undefined, "agency_admin"), false);
});

test("duplicate persisted assignments resolve to the same single client", () => {
  assert.equal(
    getPostLoginRedirect({ role: "agency_client", clientAccess: [42, 42] }),
    "/client/42/dashboard",
  );
});