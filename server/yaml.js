/**
 * server/yaml.js — YAML 1.2 output for the JSON subset the OpenAPI document uses.
 *
 * The spec is authored once as a JavaScript object. Publishing it as YAML as
 * well is a two-line route and a serialiser, which is cheaper than maintaining
 * a second copy that can drift from the first.
 *
 * Scope is deliberately the JSON data model: objects, arrays, strings, finite
 * numbers, booleans and null. Anything outside that throws rather than emitting
 * YAML that parses back into something else.
 */

/** Plain scalars YAML would read back as something other than a string. */
const RESERVED = /^(?:|~|null|Null|NULL|true|True|TRUE|false|False|FALSE|y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/;
const NUMBER_LIKE = /^[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const NEEDS_QUOTES = /^[\s>|*&!%@`,?:{}[\]#-]|[:#]\s|\s$|[\n\r\t"']/;

function scalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Cannot serialise ${value} as YAML.`);
    return String(value);
  }
  if (typeof value !== "string") throw new TypeError(`Cannot serialise ${typeof value} as YAML.`);

  if (value === "") return '""';
  if (value.includes("\n")) {
    // A literal block keeps multi-line descriptions readable in the YAML output.
    return null;
  }
  if (RESERVED.test(value) || NUMBER_LIKE.test(value) || NEEDS_QUOTES.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

const literalBlock = (value, indent) => {
  const pad = " ".repeat(indent + 2);
  return `|-\n${value.split("\n").map((line) => (line ? pad + line : "")).join("\n")}`;
};

function emit(value, indent, lines) {
  const pad = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) return lines.push(`${pad}[]`);
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        lines.push(`${pad}-`);
        emit(item, indent + 2, lines);
      } else {
        const text = scalar(item);
        lines.push(`${pad}- ${text === null ? literalBlock(item, indent) : text}`);
      }
    }
    return undefined;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (!entries.length) return lines.push(`${pad}{}`);
    for (const [key, item] of entries) {
      const name = scalar(String(key)) ?? `"${key}"`;
      if (item !== null && typeof item === "object" && (!Array.isArray(item) ? Object.keys(item).length : item.length)) {
        lines.push(`${pad}${name}:`);
        emit(item, Array.isArray(item) ? indent : indent + 2, lines);
      } else if (item !== null && typeof item === "object") {
        lines.push(`${pad}${name}: ${Array.isArray(item) ? "[]" : "{}"}`);
      } else {
        const text = scalar(item);
        lines.push(`${pad}${name}: ${text === null ? literalBlock(item, indent) : text}`);
      }
    }
    return undefined;
  }

  const text = scalar(value);
  return lines.push(`${pad}${text === null ? literalBlock(value, indent) : text}`);
}

/** A YAML 1.2 document for any JSON-compatible value. */
export function toYaml(value) {
  const lines = [];
  emit(value, 0, lines);
  return `${lines.join("\n")}\n`;
}
