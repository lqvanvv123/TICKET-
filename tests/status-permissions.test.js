const test = require("node:test");
const assert = require("node:assert/strict");
const ejs = require("ejs");
const Ticket = require("../models/Ticket");
const realtime = require("../utils/realtime");
const router = require("../routes/admin");
const staffId = "200000000000000000000001";
const otherId = "200000000000000000000002";
const ticketId = "100000000000000000000001";

async function update(role, path = "/admin/ticket/:id/status") {
  const route = router.stack.find(
    (layer) =>
      layer.route && layer.route.path === path && layer.route.methods.post,
  ).route;
  const result = {};
  const res = {
    json: (data) => {
      result.data = data;
    },
    redirect: (url) => {
      result.redirect = url;
    },
  };
  await route.stack
    .at(-1)
    .handle(
      {
        params: { id: ticketId },
        body: { status: Ticket.STATUS.DONE },
        session: { user: { id: staffId, username: "IT", role } },
      },
      res,
      (err) => {
        result.error = err;
      },
    );
  return result;
}

test("both status endpoints deny other staff and unassigned tickets", async (t) => {
  let owner = otherId;
  t.mock.method(Ticket, "findById", async () => ({
    assignedTo: owner,
    status: Ticket.STATUS.NEW,
  }));
  const write = t.mock.method(Ticket, "findOneAndUpdate", async () => {
    throw Error("Must not write");
  });
  for (const path of ["/admin/ticket/:id/status", "/admin/ticket/:id"]) {
    for (const assigned of [otherId, null]) {
      owner = assigned;
      assert.equal((await update("staff", path)).error.status, 403);
    }
  }
  assert.equal(write.mock.callCount(), 0);
});

test("owner staff and admin can update with ownership checked atomically", async (t) => {
  let owner = staffId;
  let filter;
  t.mock.method(Ticket, "findById", async () => ({
    assignedTo: owner,
    status: Ticket.STATUS.IN_PROGRESS,
  }));
  t.mock.method(Ticket, "findOneAndUpdate", async (query) => {
    filter = query;
    return {
      _id: ticketId,
      user: otherId,
      title: "Printer",
      status: Ticket.STATUS.DONE,
      resolvedAt: new Date(),
    };
  });
  t.mock.method(realtime, "notify", async () => {});
  t.mock.method(realtime, "toAdmins", () => {});
  t.mock.method(realtime, "toUser", () => {});
  assert.equal((await update("staff")).data.ok, true);
  assert.equal(filter.assignedTo, staffId);
  owner = otherId;
  assert.equal((await update("admin")).data.ok, true);
  assert.equal(filter.assignedTo, undefined);
  Ticket.findOneAndUpdate.mock.mockImplementation(async () => null);
  owner = staffId;
  assert.equal((await update("staff")).error.status, 409);
});

test("status selects are locked for other staff and enabled for owner and admin", async () => {
  const t = new Ticket({
    _id: ticketId,
    title: "Printer",
    description: "Paper jam",
    user: otherId,
    assignedTo: otherId,
  });
  const locals = {
    t,
    STATUS: Ticket.STATUS,
    STATUS_SLUG: Ticket.STATUS_SLUG,
    PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
    REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG,
  };
  for (const [role, id, locked] of [
    ["staff", staffId, true],
    ["staff", otherId, false],
    ["admin", staffId, false],
  ]) {
    const html = await ejs.renderFile("views/partials/admin-ticket-row.ejs", {
      ...locals,
      user: { role, id },
    });
    const select = html.match(/<select[^>]*js-status-select[^>]*>/)[0];
    assert.equal(select.includes("disabled"), locked);
  }
});
