import assert from "node:assert/strict";
import test from "node:test";

import { createExampleAgent } from "../src/agent.js";

test("the example agent responds to foo", async () => {
  const agent = createExampleAgent();
  const response = await agent.respond("foo");

  assert.equal(response.content, "foo");
});

test("the agent returns the assistant message from the LLM API", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: unknown[] = [];

  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello from the mocked LLM",
              refusal: null,
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const agent = createExampleAgent();
  const response = await agent.respond("hello");

  assert.equal(response.content, "Hello from the mocked LLM");
  assert.equal(requests.length, 1);

  const request = requests[0] as {
    model: string;
    messages: unknown[];
    tools: unknown[];
  };
  assert.equal(request.model, "DeepSeek-V4-Pro");
  assert.deepEqual(request.messages, [{ role: "user", content: "hello" }]);
  assert.ok(request.tools.length > 0);
});
