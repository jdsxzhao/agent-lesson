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
        output.write(`${await agent.respond(message)}\n\n`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        output.write(`[agent error] ${detail}\n\n`);
      }
      readline.prompt();
    }
  } finally {
    if (!closed) {
      readline.close();
    }
  }
}
