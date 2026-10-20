import { Parser } from "htmlparser2";

import type { GameSystemRequirementCandidate } from "../../game-supplements.js";

const blocks = new Set([
  "li",
  "ul",
  "ol",
  "p",
  "div",
  "br",
  "tr",
  "td",
  "h1",
  "h2",
  "h3",
  "h4",
  "pre",
]);
const ignored = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "svg",
  "math",
  "iframe",
  "object",
]);

/** Extract text only: no DOM execution, resource fetching or HTML output. Escape this as text in UI. */
export function requirementsText(original: string): string | null {
  const parts: string[] = [];
  let hiddenDepth = 0;
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (hiddenDepth > 0) {
          hiddenDepth++;
          return;
        }
        if (
          ignored.has(name) ||
          Object.hasOwn(attributes, "hidden") ||
          attributes["aria-hidden"] === "true"
        ) {
          hiddenDepth = 1;
          return;
        }
        if (blocks.has(name) || name === "strong" || name === "b")
          parts.push("\n");
      },
      ontext(text) {
        if (!hiddenDepth) parts.push(text);
      },
      onclosetag(name) {
        if (hiddenDepth > 0) {
          hiddenDepth--;
          return;
        }
        if (blocks.has(name)) parts.push("\n");
      },
    },
    { decodeEntities: true },
  );
  parser.end(original);
  const text = parts
    .join("")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v\u00a0 ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  return text || null;
}

type Field =
  "os" | "cpu" | "gpu" | "ramMb" | "storageMb" | "directX" | "additionalNotes";
const labels = new Map<string, Field>([
  ["os", "os"],
  ["operating system", "os"],
  ["os version", "os"],
  ["processor", "cpu"],
  ["cpu", "cpu"],
  ["graphics", "gpu"],
  ["graphics card", "gpu"],
  ["video card", "gpu"],
  ["gpu", "gpu"],
  ["memory", "ramMb"],
  ["ram", "ramMb"],
  ["storage", "storageMb"],
  ["hard drive", "storageMb"],
  ["hard disk", "storageMb"],
  ["disk space", "storageMb"],
  ["hdd", "storageMb"],
  ["directx", "directX"],
  ["additional notes", "additionalNotes"],
  ["notes", "additionalNotes"],
  ["other requirements", "additionalNotes"],
]);

/** PC requirement convention: GB/GiB = 1024 MB, TB/TiB = 1024² MB; never infer absent units. */
export function capacityMb(
  value: string,
  kind: "ramMb" | "storageMb",
): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*(MB|MiB|GB|GiB|TB|TiB)(.*)$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, amount, unit, suffix = ""] = match;
  const allowed =
    kind === "ramMb"
      ? /^(?:\s+(?:of\s+)?(?:RAM|memory))?$/i
      : /^(?:\s+(?:of\s+)?(?:available space|free space|free disk space|disk space))?$/i;
  if (!allowed.test(suffix)) return null;
  const multiplier = unit?.toUpperCase().startsWith("T")
    ? 1024 ** 2
    : unit?.toUpperCase().startsWith("G")
      ? 1024
      : 1;
  const result = Number(amount) * multiplier;
  return Number.isInteger(result) && result > 0 && result <= 2_147_483_647
    ? result
    : null;
}

export function parseSystemRequirement(
  original: string,
): Pick<
  GameSystemRequirementCandidate,
  | "os"
  | "cpu"
  | "gpu"
  | "ramMb"
  | "storageMb"
  | "directX"
  | "additionalNotes"
  | "rawText"
  | "originalText"
> | null {
  const text = requirementsText(original);
  if (!text || /^(?:minimum|recommended)\s*:?$/i.test(text)) return null;
  const records = new Map<Field, string[][]>();
  const notes: string[] = [];
  let current: string[] | null = null;
  for (const line of text.split("\n")) {
    if (/^(?:minimum|recommended)\s*:?$/i.test(line)) {
      current = null;
      continue;
    }
    const match = /^([^:：]{1,80})[:：]\s*(.*)$/.exec(line);
    const label = match?.[1]
      ?.toLowerCase()
      .replace(/\s*\*+\s*$/, "")
      .trim();
    const field = label ? labels.get(label) : undefined;
    if (field) {
      current = [match?.[2] ?? ""];
      const values = records.get(field) ?? [];
      values.push(current);
      records.set(field, values);
    } else if (match) {
      current = null;
      notes.push(line);
    } else if (current) current.push(line);
    else notes.push(line);
  }
  function unique(field: Field): string | null {
    const values = [
      ...new Set(
        (records.get(field) ?? [])
          .map((parts) => parts.join(" ").trim())
          .filter(Boolean),
      ),
    ];
    if (values.length > 1) {
      notes.push(...values.map((value) => `${field}: ${value}`));
      return null;
    }
    return values[0] ?? null;
  }
  const memory = unique("ramMb");
  const storage = unique("storageMb");
  const ramMb = memory ? capacityMb(memory, "ramMb") : null;
  const storageMb = storage ? capacityMb(storage, "storageMb") : null;
  if (memory && ramMb === null) notes.push(`Memory: ${memory}`);
  if (storage && storageMb === null) notes.push(`Storage: ${storage}`);
  const os = unique("os"),
    cpu = unique("cpu"),
    gpu = unique("gpu"),
    directX = unique("directX");
  const additional = unique("additionalNotes");
  if (additional) notes.push(additional);
  return {
    os,
    cpu,
    gpu,
    ramMb,
    storageMb,
    directX,
    additionalNotes: notes.join("\n") || null,
    rawText: text,
    originalText: original,
  };
}
