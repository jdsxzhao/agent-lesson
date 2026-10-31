import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createExampleAgent } from "../src/agent.js";

function useApiKey(t: TestContext, value: string): void {
  const original = process.env.API_KEY;
  process.env.API_KEY = value;
  t.after(() => {
    if (original === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = original;
  });
}

test("the example agent responds to foo", async () => {
  const agent = createExampleAgent();
  const response = await agent.respond("foo");

  assert.equal(response.content, "foo");
});

test("the agent returns the assistant message from the LLM API", async (t) => {
  useApiKey(t, "test-api-key");
  const originalFetch = globalThis.fetch;
  const requests: unknown[] = [];
  const urls: string[] = [];

  globalThis.fetch = async (_input, init) => {
    urls.push(String(_input));
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
    messages: { role: string; content: string }[];
    tools: unknown[];
  };
  assert.equal(urls[0], "https://antchat.alipay.com/v1/chat/completions");
  assert.equal(request.model, "DeepSeek-V4.1-Flash-1017");
  assert.equal(request.messages.length, 2);
  assert.equal(request.messages[0].role, "system");
  const firstUserMessage = request.messages[1];
  assert.equal(firstUserMessage.role, "user");
  assert.ok(firstUserMessage.content.startsWith("<system-reminder>\n"));
  assert.ok(firstUserMessage.content.includes("# currentDate\n"));
  assert.ok(firstUserMessage.content.endsWith("</system-reminder>\n\nhello"));
  assert.ok(request.tools.length > 0);

  await agent.respond("follow up");

  assert.equal(requests.length, 2);
  const secondRequest = requests[1] as typeof request;
  assert.equal(secondRequest.messages.length, 4);
  assert.deepEqual(secondRequest.messages[1], firstUserMessage);
  assert.deepEqual(secondRequest.messages.at(-1), {
    role: "user",
    content: "follow up",
  });
});

test("missing API_KEY fails before sending a request", async (t) => {
  useApiKey(t, "");
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not send a request");
  });

  await assert.rejects(createExampleAgent().respond("你好"), (error: Error) => error.message.includes("缺少 API_KEY"));
  assert.equal(fetch.mock.callCount(), 0);
});

for (const status of [401, 400]) {
  test(`HTTP ${status} reports the API error without leaking the key`, async (t) => {
    useApiKey(t, "test-secret-key");
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
      error: { message: "Rejected test-secret-key: authentication or model error" },
    }), { status }));

    await assert.rejects(createExampleAgent().respond("你好"), (error: Error) => {
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.ok(error.message.includes("authentication or model error"));
      assert.ok(error.message.includes("[REDACTED]"));
      assert.ok(!error.message.includes("test-secret-key"));
      return true;
    });
  });
}

test("a successful HTTP response without a message reports an invalid response", async (t) => {
  useApiKey(t, "test-api-key");
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [] })));

  await assert.rejects(createExampleAgent().respond("你好"), (error: Error) => error.message.includes("缺少有效的 choices[0].message"));
});

test("an HTML gateway error reports its HTTP status", async (t) => {
  useApiKey(t, "test-api-key");
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Bad gateway</html>", { status: 502 }));

  await assert.rejects(createExampleAgent().respond("你好"), (error: Error) => error.message.includes("非 JSON 响应（HTTP 502）"));
});

test("a tool call with null content feeds its result back to the model", async (t) => {
  useApiKey(t, "test-api-key");
  const requests: { messages: { role: string; tool_call_id?: string; content: string }[] }[] = [];
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    const message = requests.length === 1
      ? { role: "assistant", content: null, tool_calls: [{
          id: "call_1", type: "function", function: {
            name: "read_file", arguments: JSON.stringify({ file_path: "package.json" }),
          },
        }] }
      : { role: "assistant", content: "Read the package file." };
    return new Response(JSON.stringify({ choices: [{ message }] }));
  });

  const response = await createExampleAgent().respond("Read package.json");

  assert.equal(response.content, "Read the package file.");
  assert.equal(requests.length, 2);
  const result = requests[1].messages.at(-1)!;
  assert.equal(result.role, "tool");
  assert.equal(result.tool_call_id, "call_1");
  assert.equal(JSON.parse(result.content).name, "agent-lesson");
});
