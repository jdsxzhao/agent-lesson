import assert from "node:assert/strict";
import test from "node:test";

import { createExampleAgent } from "../src/agent.js";

test("the example agent responds to foo", async () => {
  const agent = createExampleAgent();

  assert.equal(await agent.respond("foo"), "foo");
});

test("the example agent exposes the unimplemented extension point", async () => {
  const agent = createExampleAgent();

  assert.equal(
    await agent.respond("hello"),
    'Agent logic is not implemented yet. Received: "hello"',
  );
});
