const accessorPattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\]|\["[^"]+"\]|\['[^']+'\])*$/;
const token = /[A-Za-z_][A-Za-z0-9_]*|\[(\d+)\]|\["([^"]+)"\]|\['([^']+)'\]/g;

/** Reads a report accessor (`user.hours`, `user.byMonth[0].label`) the same way the website does. */
export function getPath(source: unknown, path: string) {
  if (path.length === 0 || path.length > 200 || !accessorPattern.test(path)) return undefined;
  const parts: string[] = [];
  let index = 0;
  for (const match of path.matchAll(token)) {
    if (match.index !== index) return undefined;
    parts.push(match[1] ?? match[2] ?? match[3] ?? match[0]);
    index = match.index + match[0].length;
    if (path[index] === ".") index += 1;
  }
  if (index !== path.length) return undefined;

  let current: unknown = source;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
