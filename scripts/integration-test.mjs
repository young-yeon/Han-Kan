import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers
  .getSetCookie()
  .map((x) => x.split(";")[0])
  .join("; ");
const headers = {
  Cookie: cookie,
  "Content-Type": "application/json",
  Origin: base,
};
async function get() {
  const r = await fetch(base + "/api/chef", { headers });
  assert.equal(r.status, 200);
  return r.json();
}
async function post(body) {
  const r = await fetch(base + "/api/chef", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
const anonymous = await fetch(base + "/api/chef");
assert.equal(anonymous.status, 401);
let record = await get();
console.log(
  JSON.stringify({
    initialInventory: record.state.inventory.map((x) => ({
      name: x.name,
      quantity: x.quantity,
      expiry: x.expiry,
    })),
    config: record.config,
  }),
);
const lot = {
  id: "integration-onion",
  name: "양파",
  quantity: 500,
  unit: "g",
  place: "냉장",
  expiry: "2026-12-12",
  dateType: "소비기한",
  opened: false,
  purchasedAt: "2026-11-09",
  observedAt: null,
  version: 0,
  label: null,
};
const existing = record.state.inventory.find((x) => x.id === lot.id);
if (existing) lot.version = existing.version;
const payload = {
  action: "lot",
  requestId: crypto.randomUUID(),
  version: record.version,
  lot,
};
const first = await post(payload);
assert.equal(first.status, 200);
const repeat = await post(payload);
assert.equal(repeat.status, 200);
assert.equal(first.data.version, repeat.data.version);
assert.equal(
  repeat.data.state.inventory.filter((x) => x.id === lot.id).length,
  1,
);
const stale = await post({
  ...payload,
  requestId: crypto.randomUUID(),
  lot: { ...lot, quantity: 600 },
});
assert.equal(stale.status, 409);
const forbidden = await fetch(base + "/api/chef", {
  method: "POST",
  headers: { ...headers, Origin: "https://evil.example" },
  body: JSON.stringify(payload),
});
assert.equal(forbidden.status, 403);
const other = await fetch(base + "/api/chef?job=" + crypto.randomUUID(), {
  headers,
});
assert.equal(other.status, 404);
record = await get();
const change = record.state.changes.find(
  (x) => x.after?.id === lot.id && !x.undone,
);
const undone = await post({
  action: "undo",
  requestId: crypto.randomUUID(),
  version: record.version,
  changeId: change.id,
});
assert.equal(undone.status, 200);
console.log(
  "PASS: auth, cross-origin rejection, idempotent save, stale revision rejection, job isolation, undo",
);
