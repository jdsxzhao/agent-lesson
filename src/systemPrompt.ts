import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveIncludes } from "./prompt.js";
import { execSync } from "node:child_process";
import * as os from "node:os";

const STATIC_CORE = `You are a terminal coding agent named coco.
Read files before proposing changes.
Do not modify files unless explicitly requested.
Prefer dedicated tools over shell commands.
Confirm destructive or irreversible operations.`;

export const loadAgentsMd = () => {
  const parts: string[] = [];
  // 只在开始时读取一次工作目录；后续修改 dir 不会改变进程实际的工作目录。
  let dir = process.cwd();
  while (true) {
    const file = join(dir, "AGENTS.md");
    if (existsSync(file)) {
      let content = readFileSync(file, "utf-8");
      content = resolveIncludes(content, dir);
      parts.unshift(content);
    }
    // 计算当前 dir 的父目录，例如 /Users/yanling/project → /Users/yanling。
    const parent = resolve(dir, "..");
    // dir 每轮都会向上移动，直到根目录 /；此时父目录仍是 /，两者相同就停止。
    if (parent === dir) break;
    // 更新查找位置，让下一轮去父目录查找 AGENTS.md，不再停留在最初的工作目录。
    dir = parent;
  }
  const agentMd =
    parts.length > 0
      ? "\n\n# Project Instructions (AGENTS.md)\n" + parts.join("\n\n---\n\n")
      : "";
  return agentMd;
};



export function getGitContext(): string {
  try {
    const opts = { encoding: "utf-8" as const, timeout: 3000 };
    const branch = execSync("git rev-parse --abbrev-ref HEAD", opts).trim();
    const log = execSync("git log --oneline -5", opts).trim();
    const status = execSync("git status --short", opts).trim();
    let result = `\nGit branch: ${branch}`;
    if (log) result += `\nRecent commits:\n${log}`;
    if (status) result += `\nGit status:\n${status}`;
    return result;
  } catch {
    return "";
  }
}

// 动态块：环境 + git + 记忆 + 技能 + agent 列表，会话内稳定但因机器/项目而异
export function buildDynamicSystemContext(): string {
  const platform = `${os.platform()} ${os.arch()}`;
  const shell =
    process.platform === "win32"
      ? process.env.ComSpec || "cmd.exe"
      : process.env.SHELL || "/bin/sh";
  return `# Environment
Working directory: ${process.cwd()}
Platform: ${platform}
Shell: ${shell}${getGitContext()}`;
}

// AGENTS.md + 日期：包成 <system-reminder>，由 agent 注入第一条 user 消息
export function buildUserContextReminder(): string {
  const date = new Date().toISOString().split("T")[0];
  const agentsMd = loadAgentsMd();
  return `<system-reminder>\n...${agentsMd}\n# currentDate\nToday's date is ${date}.\n...</system-reminder>`;
}

export const buildDefaultSystemPrompt = () => {
  return [
    STATIC_CORE,
    buildDynamicSystemContext(),
  ].join("\n\n");
};
