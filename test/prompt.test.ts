import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveIncludes } from "../src/prompt.js";

test("includes expand nested files and stop circular references", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "agent-lesson-includes-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "base.md"), "Base rules\n@./style.md");
  writeFileSync(join(directory, "style.md"), "Style rules\n@./base.md");

  assert.equal(
    resolveIncludes("Project rules\n@./base.md", directory),
    "Project rules\nBase rules\nStyle rules\n<!-- circular: ./base.md -->",
  );
  assert.equal(
    resolveIncludes("@./missing.md", directory),
    "<!-- not found: ./missing.md -->",
  );
});

test("long nonmatching include lines finish within a child-process hard timeout", (t) => {
  const moduleUrl = new URL("../dist/prompt.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { resolveIncludes } from ${JSON.stringify(moduleUrl)};
    const measurements = [];
    for (const size of [16384, 65536, 262144, 1048576]) {
      const inputs = [
        "x".repeat(size),
        "@./" + "a".repeat(size) + " invalid suffix",
        "@~/" + "a".repeat(size) + " invalid suffix",
        "@/" + "\\\\".repeat(size) + " invalid suffix",
      ];
      for (const input of inputs) {
        const start = performance.now();
        assert.equal(resolveIncludes(input, process.cwd()), input);
        measurements.push({ length: input.length, ms: performance.now() - start });
      }
    }
    console.log(JSON.stringify({ engine: process.version, measurements }));
  `], {
    encoding: "utf8",
    timeout: 5000,
    killSignal: "SIGKILL",
    maxBuffer: 65536,
  });

  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  t.diagnostic(child.stdout.trim());
});
