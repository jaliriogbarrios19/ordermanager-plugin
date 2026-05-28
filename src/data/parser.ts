export function parseYaml(frontmatter: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = frontmatter.split("\n");

  for (const line of lines) {
    const match = line.match(/^([\w\s\u00C0-\u024F]+?):\s*(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    let value: string = match[2].trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
      value = unescapeYamlValue(value);
    }

    if (value === "true" || value === "false") {
      result[key] = value === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(value) && value !== "") {
      result[key] = value.includes(".") ? parseFloat(value) : parseInt(value, 10);
    } else if (value === "" || value === "null" || value === "~") {
      result[key] = "";
    } else {
      result[key] = value;
    }
  }

  return result;
}

function unescapeYamlValue(value: string): string {
  return value.replace(/\\([\\"nrt])/g, (_: string, c: string): string => {
    switch (c) {
      case "\\": return "\\";
      case '"': return '"';
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      default: return c;
    }
  });
}

export function stringifyYaml(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "string") {
      if (value === "") {
        lines.push(`${key}: ""`);
      } else if (needsQuoting(value)) {
        lines.push(`${key}: "${escapeYamlValue(value)}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else {
      const str = String(value);
      lines.push(`${key}: "${escapeYamlValue(str)}"`);
    }
  }

  return lines.join("\n");
}

function escapeYamlValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function needsQuoting(value: string): boolean {
  return /[:#{}[\]&*?!|>'"@`,\n\r]/.test(value) || value.startsWith(" ") || value.endsWith(" ") || value.startsWith("- ");
}

export function parseFrontmatterFromContent(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  return {
    frontmatter: parseYaml(match[1]),
    body: match[2].trim(),
  };
}

export function buildMarkdownNote(frontmatter: Record<string, unknown>, body: string = ""): string {
  const yaml = stringifyYaml(frontmatter);
  const bodyContent = body.trim();
  return `---\n${yaml}\n---\n${bodyContent ? "\n" + bodyContent + "\n" : ""}`;
}
