import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import type { Agent } from "../src/agent.js";
import { runSession } from "../src/session.js";

function captureOutput(): { output: Writable; read: () => string } {
  let text = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });

  return { output, read: () => text };
}

test("the session sends input to the agent and exits on quit", async () => {
  const input = Readable.from(["foo\nquit\n"]);
  const captured = captureOutput();
  const agent: Agent = {
    async respond(message, onEvent) {
      onEvent?.({
        type: "tool_call",
        id: "call_1",
        name: "read_file",
        arguments: '{"file_path":"package.json"}',
      });
      onEvent?.({
        type: "tool_result",
        id: "call_1",
        name: "read_file",
        result: "mock file content",
      });

      return {
        role: "assistant",
        content: `reply:${message}`,
        refusal: null,
      };
    },
  };

  await runSession({ input, output: captured.output, agent });

  assert.match(captured.read(), /Agent Lesson/);
  assert.match(captured.read(), /\[tool\] read_file/);
  assert.match(captured.read(), /\[result\] mock file content/);
  assert.match(captured.read(), /reply:foo/);
  assert.match(captured.read(), /Bye!/);
});

test("the session ignores empty messages", async () => {
  const input = Readable.from(["\nexit\n"]);
  const captured = captureOutput();
  let calls = 0;
  const agent: Agent = {
    async respond() {
      calls += 1;
      return {
        role: "assistant",
        content: "unexpected",
        refusal: null,
      };
    },
  };

  await runSession({ input, output: captured.output, agent });

  assert.equal(calls, 0);
});
