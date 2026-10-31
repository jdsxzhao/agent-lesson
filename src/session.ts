import { createInterface } from "node:readline";

import type { Agent } from "./agent.js";

export interface SessionOptions {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  agent: Agent;
}

const EXIT_COMMANDS = new Set(["exit", "quit"]);

function isTTY(stream: NodeJS.ReadableStream | NodeJS.WritableStream): boolean {
  return "isTTY" in stream && stream.isTTY === true;
}

let currentRequest: AbortController | undefined;
export async function runSession({
  input,
  output,
  agent,
}: SessionOptions): Promise<void> {
  const readline = createInterface({
    input,
    output,
    terminal: isTTY(input) && isTTY(output),
  });
  let interrupted = false;
  let closed = false;
  let goodbyeWritten = false;

  const writeGoodbye = () => {
    if (!goodbyeWritten) {
      output.write("\nBye!\n");
      goodbyeWritten = true;
    }
  };

  readline.once("SIGINT", () => {
    if (currentRequest) {
      currentRequest.abort();
      output.write("\n[interrupted]\n\n");
    }
    interrupted = true;
    writeGoodbye();
    readline.close();
  });
  readline.once("close", () => {
    closed = true;
  });

  output.write(
    "\nAgent Lesson - A minimal TypeScript agent playground\n\n" +
    "Type a message, or 'exit'/'quit' to leave.\n" +
    "Try the example input: foo\n\n",
  );

  readline.setPrompt("> ");
  readline.prompt();

  try {
    for await (const answer of readline) {
      if (interrupted) {
        break;
      }
      const message = answer.trim();
      if (EXIT_COMMANDS.has(message.toLowerCase())) {
        writeGoodbye();
        break;
      }
      if (!message) {
        readline.prompt();
        continue;
      }

      try {
        currentRequest = new AbortController();
        const response = await agent.respond(message, (event) => {
          switch (event.type) {
            case "tool_call":
              output.write(
                `\n[tool] ${event.name}\n` +
                `[args] ${event.arguments}\n`,
              );
              break;
            case "tool_result":
              output.write(
                `[result] ${event.result}\n\n`,
              );
              break;
          }
        }, currentRequest.signal);
        output.write(`${response.content}\n\n`);
      } catch (error: any) {
        if (error instanceof Error && error.name === "AbortError") {
          // Ctrl+C 导致的正常中断，不显示 agent error
        } else {
          const detail = error instanceof Error ? error.message : String(error);
          output.write(`[agent error] ${detail}\n\n`);
        }
      }
      readline.prompt();
    }
  } finally {
    if (!closed) {
      readline.close();
    }
  }
}
