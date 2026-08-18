#!/usr/bin/env node

import { createExampleAgent } from "./agent.js";
import { runSession } from "./session.js";

try {
  await runSession({
    input: process.stdin,
    output: process.stdout,
    agent: createExampleAgent(),
  });
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`yl failed: ${detail}\n`);
  process.exitCode = 1;
}
