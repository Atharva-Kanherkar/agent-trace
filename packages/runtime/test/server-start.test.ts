import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntime, startInMemoryRuntimeServers } from "../src/runtime";

test("startInMemoryRuntimeServers can start API-only mode", async () => {
  const runtime = createInMemoryRuntime();
  const servers = await startInMemoryRuntimeServers(runtime, {
    host: "127.0.0.1",
    collectorPort: 0,
    apiPort: 0,
    enableCollectorServer: false,
    enableApiServer: true,
    enableOtelReceiver: false
  });

  try {
    assert.equal(servers.collectorAddress, undefined);
    assert.notEqual(servers.apiAddress, undefined);
    assert.equal(servers.otelGrpcAddress, undefined);

    if (servers.apiAddress === undefined) {
      assert.fail("expected api address in API-only mode");
    }

    const health = await fetch(`http://${servers.apiAddress}/health`);
    assert.equal(health.status, 200);
  } finally {
    await servers.close();
  }
});

test("startInMemoryRuntimeServers can start collector-only mode", async () => {
  const runtime = createInMemoryRuntime();
  const servers = await startInMemoryRuntimeServers(runtime, {
    host: "127.0.0.1",
    collectorPort: 0,
    apiPort: 0,
    enableCollectorServer: true,
    enableApiServer: false,
    enableOtelReceiver: false
  });

  try {
    assert.notEqual(servers.collectorAddress, undefined);
    assert.equal(servers.apiAddress, undefined);
    assert.equal(servers.otelGrpcAddress, undefined);

    if (servers.collectorAddress === undefined) {
      assert.fail("expected collector address in collector-only mode");
    }

    const health = await fetch(`http://${servers.collectorAddress}/health`);
    assert.equal(health.status, 200);
  } finally {
    await servers.close();
  }
});

test("startInMemoryRuntimeServers rejects when both collector and api are disabled", async () => {
  const runtime = createInMemoryRuntime();
  await assert.rejects(
    async () => {
      await startInMemoryRuntimeServers(runtime, {
        enableCollectorServer: false,
        enableApiServer: false,
        enableOtelReceiver: false
      });
    },
    /at least one enabled HTTP service/
  );
});
