import { existsSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import * as os from "node:os";

const INCLUDE_REGEX = /^@(\.\/[^\s]+|~\/[^\s]+|\/[^\s]+)$/gm;
const MAX_INCLUDE_DEPTH = 5;

export function resolveIncludes(
  content: string,
  basePath: string,
  visited: Set<string> = new Set(),
  depth: number = 0,
) {
  if (depth >= MAX_INCLUDE_DEPTH) return content;
  return content.replace(INCLUDE_REGEX, (_match, rawPath: string): string => {
    let resolved: string;
    if (rawPath.startsWith("~/")) {
      resolved = join(os.homedir(), rawPath.slice(2));
    } else if (rawPath.startsWith("/")) {
      resolved = rawPath;
    } else {
      resolved = resolve(basePath, rawPath); // ./relative
    }
    resolved = resolve(resolved);
    if (visited.has(resolved)) return `<!-- circular: ${rawPath} -->`;
    if (!existsSync(resolved)) return `<!-- not found: ${rawPath} -->`;
    try {
      visited.add(resolved);
      const included = readFileSync(resolved, "utf-8");
      return resolveIncludes(included, dirname(resolved), visited, depth + 1);
    } catch {
      return `<!-- error reading: ${rawPath} -->`;
    }
  });
};
