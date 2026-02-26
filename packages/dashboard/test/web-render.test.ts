import assert from "node:assert/strict";
import test from "node:test";

import { renderDashboardHtml } from "../src/web-render";

test("renderDashboardHtml includes page title and sessions bridge endpoint", () => {
  const html = renderDashboardHtml({
    title: "agent-trace sessions"
  });

  assert.equal(html.includes("<title>agent-trace sessions</title>"), true);
  assert.equal(html.includes("/api/sessions"), true);
  assert.equal(html.includes("/api/sessions/stream"), true);
  assert.equal(html.includes("/api/session/"), true);
  assert.equal(html.includes("Session Replay"), true);
  assert.equal(html.includes("EventSource"), true);
  assert.equal(html.includes("Sessions"), true);
});
