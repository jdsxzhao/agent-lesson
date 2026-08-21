import { exec as execCallback } from "node:child_process";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";

import type Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const exec = promisify(execCallback);

export type ToolDef = Anthropic.Tool & { deferred?: boolean };

export const toolDefinitions: ToolDef[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file. Returns the file content with line numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to read",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to write",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string match with new content. The old_string must match exactly (including whitespace and indentation).",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to edit",
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace",
        },
        new_string: {
          type: "string",
          description: "The string to replace it with",
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "list_files",
    description:
      "List files matching a glob pattern. Returns matching file paths.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description:
            'Glob pattern to match files (e.g., "**/*.ts", "src/**/*")',
        },
        path: {
          type: "string",
          description:
            "Base directory to search from. Defaults to current directory.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep_search",
    description:
      "Search for a pattern in files. Returns matching lines with file paths and line numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "The regex pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file to search in. Defaults to current directory.",
        },
        include: {
          type: "string",
          description:
            'File glob pattern to include (e.g., "*.ts", "*.py")',
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_shell",
    description:
      "Execute a shell command and return its output. Use this for running tests, installing packages, git operations, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000)",
        },
      },
      required: ["command"],
    },
  },
  // ─── Skill tool ─────────────────────────────────────────────
  {
    name: "skill",
    description:
      "Invoke a registered skill by name. Skills are prompt templates loaded from .claude/skills/. Returns the skill's resolved prompt to follow.",
    input_schema: {
      type: "object" as const,
      properties: {
        skill_name: {
          type: "string",
          description: "The name of the skill to invoke",
        },
        args: {
          type: "string",
          description: "Optional arguments to pass to the skill",
        },
      },
      required: ["skill_name"],
    },
  },
  // ─── Web fetch tool ──────────────────────────────────────────
  {
    name: "web_fetch",
    description:
      "Fetch a URL and return its content as text. For HTML pages, tags are stripped to return readable text. For JSON/text responses, content is returned directly.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL to fetch" },
        max_length: {
          type: "number",
          description: "Maximum content length in characters (default 50000)",
        },
      },
      required: ["url"],
    },
  },
  // ─── Plan mode tools ────────────────────────────────────────
  {
    name: "enter_plan_mode",
    description:
      "Enter plan mode to switch to a read-only planning phase. In plan mode, you can only read files and write to the plan file. Use this when you need to explore the codebase and design an implementation plan before making changes.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
    deferred: true,
  },
  {
    name: "exit_plan_mode",
    description:
      "Exit plan mode after you have finished writing your plan to the plan file. The user will review and approve the plan before you proceed with implementation.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
    deferred: true,
  },
  // ─── Agent tool ─────────────────────────────────────────────
  {
    name: "agent",
    description:
      "Launch a sub-agent to handle a task autonomously. Sub-agents have isolated context and return their result. Types: 'explore' (read-only, fast search), 'plan' (read-only, structured planning), 'general' (full tools).",
    input_schema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "Short (3-5 word) description of the sub-agent's task",
        },
        prompt: {
          type: "string",
          description: "Detailed task instructions for the sub-agent",
        },
        type: {
          type: "string",
          enum: ["explore", "plan", "general"],
          description: "Agent type: explore (read-only), plan (planning), general (full tools). Default: general",
        },
      },
      required: ["description", "prompt"],
    },
  },
  // ─── Tool search (deferred tool loader) ─────────────────────
  {
    name: "tool_search",
    description:
      "Search for available tools by name or keyword. Returns full schema definitions for matching deferred tools so you can use them.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Tool name or search keywords" },
      },
      required: ["query"],
    },
  },
];

export const toOpenAITools = (tools: ToolDef[]): OpenAI.Chat.Completions.ChatCompletionTool[] => {
  return tools.filter((tool) => !tool.deferred).map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema,
    },
  }));
};

const readFile = async (toolArguments: string): Promise<string> => {
  const { file_path } = JSON.parse(toolArguments);
  const content = await fs.readFile(file_path, "utf8");
  return content;
};

const writeFile = async (toolArguments: string): Promise<string> => {
  const { file_path, content } = JSON.parse(toolArguments);
  await fs.writeFile(file_path, content);
  return `File ${file_path} written successfully`;
};

const editFile = async (toolArguments: string): Promise<string> => {
  const { file_path, old_string, new_string } = JSON.parse(toolArguments);
  const content = await fs.readFile(file_path, "utf8");
  const newContent = content.replace(old_string, new_string);
  await fs.writeFile(file_path, newContent);
  return `File ${file_path} edited successfully`;
};

const listFiles = async (toolArguments: string): Promise<string> => {
  const { pattern, path } = JSON.parse(toolArguments);
  const files = await fs.readdir(path);
  const matchingFiles = files.filter((file) => file.includes(pattern));
  return files.join("\n");
};

const grepSearch = async (toolArguments: string): Promise<string> => {
  const { pattern, path, include } = JSON.parse(toolArguments);
  const files = await fs.readdir(path);
  const matchingFiles = files.filter((file: string) => file.includes(pattern));
  return matchingFiles.join("\n");
};

const runShell = async (toolArguments: string): Promise<string> => {
  const { command } = JSON.parse(toolArguments);
  const result = await exec(command);
  return result.stdout;
};

const skill = async (toolArguments: string): Promise<string> => {
  const { skill_name, args } = JSON.parse(toolArguments);
  return `Skill ${skill_name} invoked with arguments ${args}`;
};

const webFetch = async (toolArguments: string): Promise<string> => {
  const { url } = JSON.parse(toolArguments);
  const response = await fetch(url);
  return response.text();
};

export const executeTool = async (toolName: string, toolArguments: string): Promise<string> => {
  const tool = toolDefinitions.find((tool) => tool.name === toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  switch (tool.name) {
    case "read_file":
      return await readFile(toolArguments);
    case "write_file":
      return await writeFile(toolArguments);
    case "edit_file":
      return await editFile(toolArguments);
    case "list_files":
      return await listFiles(toolArguments);
    case "grep_search":
      return await grepSearch(toolArguments);
    case "run_shell":
      return await runShell(toolArguments);
    case "skill":
      return await skill(toolArguments);
    case "web_fetch":
      return await webFetch(toolArguments);
  }
  throw new Error(`Tool ${toolName} not found`);
}
