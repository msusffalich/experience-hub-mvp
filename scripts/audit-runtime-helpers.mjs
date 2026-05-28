import { readFileSync } from "node:fs";

const source = readFileSync("app.js", "utf8");

const knownGlobals = new Set([
  "AbortController",
  "Array",
  "Blob",
  "Boolean",
  "CSS",
  "DataTransfer",
  "Date",
  "Error",
  "Event",
  "File",
  "FileReader",
  "FormData",
  "Headers",
  "Image",
  "JSON",
  "Map",
  "Math",
  "MediaRecorder",
  "MutationObserver",
  "Number",
  "Object",
  "Option",
  "Promise",
  "RegExp",
  "Request",
  "Response",
  "Set",
  "SpeechSynthesisUtterance",
  "String",
  "TextDecoder",
  "URL",
  "URLSearchParams",
  "Uint8Array",
  "alert",
  "console",
  "confirm",
  "decodeURIComponent",
  "encodeURIComponent",
  "escape",
  "fetch",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "reject",
  "requestAnimationFrame",
  "resolve",
  "setInterval",
  "setTimeout",
  "clearInterval",
  "clearTimeout",
  "atob",
  "btoa",
]);

const keywords = new Set([
  "async",
  "await",
  "catch",
  "class",
  "do",
  "else",
  "for",
  "function",
  "if",
  "import",
  "new",
  "return",
  "switch",
  "throw",
  "try",
  "typeof",
  "void",
  "while",
]);

const templateTextExceptions = new Set([
  "T",
  "complete",
  "completos",
  "evento",
  "minmax",
  "repeat",
  "s",
]);

function stripCommentsAndStrings(text) {
  let output = "";
  let i = 0;
  let state = "code";
  let templateDepth = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1] || "";

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "lineComment";
        output += "  ";
        i += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "blockComment";
        output += "  ";
        i += 2;
        continue;
      }
      if (char === "'" || char === '"') {
        state = char === "'" ? "single" : "double";
        output += " ";
        i += 1;
        continue;
      }
      if (char === "`") {
        state = "template";
        templateDepth = 0;
        output += " ";
        i += 1;
        continue;
      }
      output += char;
      i += 1;
      continue;
    }

    if (state === "lineComment") {
      if (char === "\n") {
        output += "\n";
        state = "code";
      } else {
        output += " ";
      }
      i += 1;
      continue;
    }

    if (state === "blockComment") {
      if (char === "*" && next === "/") {
        output += "  ";
        i += 2;
        state = "code";
      } else {
        output += char === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }

    if (state === "single" || state === "double") {
      const quote = state === "single" ? "'" : '"';
      if (char === "\\") {
        output += "  ";
        i += 2;
        continue;
      }
      if (char === quote) {
        output += " ";
        state = "code";
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      i += 1;
      continue;
    }

    if (state === "template") {
      if (char === "\\") {
        output += "  ";
        i += 2;
        continue;
      }
      if (char === "`" && templateDepth === 0) {
        output += " ";
        state = "code";
        i += 1;
        continue;
      }
      if (char === "$" && next === "{") {
        output += " {";
        i += 2;
        templateDepth += 1;
        state = "templateExpression";
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }

    if (state === "templateExpression") {
      if (char === "'" || char === '"') {
        state = char === "'" ? "templateSingle" : "templateDouble";
        output += " ";
        i += 1;
        continue;
      }
      if (char === "`") {
        state = "templateNested";
        output += " ";
        i += 1;
        continue;
      }
      if (char === "{") templateDepth += 1;
      if (char === "}") {
        templateDepth -= 1;
        if (templateDepth === 0) state = "template";
      }
      output += char;
      i += 1;
      continue;
    }

    if (state === "templateSingle" || state === "templateDouble") {
      const quote = state === "templateSingle" ? "'" : '"';
      if (char === "\\") {
        output += "  ";
        i += 2;
        continue;
      }
      if (char === quote) {
        output += " ";
        state = "templateExpression";
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      i += 1;
      continue;
    }

    if (state === "templateNested") {
      if (char === "\\") {
        output += "  ";
        i += 2;
        continue;
      }
      if (char === "`") {
        output += " ";
        state = "templateExpression";
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      i += 1;
    }
  }
  return output;
}

function collect(regex, text, group = 1) {
  const values = new Set();
  for (const match of text.matchAll(regex)) values.add(match[group]);
  return values;
}

const code = stripCommentsAndStrings(source);
const declared = new Set([
  ...collect(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g, source),
  ...collect(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g, source),
  ...collect(/\bclass\s+([A-Za-z_$][\w$]*)\b/g, source),
]);

const unqualifiedCalls = [];
const callRegex = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/gm;
for (const match of code.matchAll(callRegex)) {
  const name = match[2];
  if (keywords.has(name) || knownGlobals.has(name) || declared.has(name) || templateTextExceptions.has(name)) continue;
  const index = match.index + match[1].length;
  const line = code.slice(0, index).split("\n").length;
  unqualifiedCalls.push({ name, line });
}

const missing = [...new Map(unqualifiedCalls.map((item) => [item.name, item])).values()]
  .sort((a, b) => a.line - b.line);

if (missing.length) {
  console.error("Runtime helper audit failed: unqualified function calls without declarations.");
  for (const item of missing.slice(0, 40)) {
    console.error(`- ${item.name}() at app.js:${item.line}`);
  }
  if (missing.length > 40) console.error(`- ${missing.length - 40} additional missing calls`);
  process.exit(1);
}

const runtimeGuardNeedles = [
  "function sentenceCase",
  "function renderDashboardStateAndProgressPanels",
  "function renderDashboardDataStatusFallback",
  "function renderGlobalProgressFallback",
];
const missingGuards = runtimeGuardNeedles.filter((needle) => !source.includes(needle));
if (missingGuards.length) {
  console.error("Runtime helper audit failed: dashboard guard helpers missing.");
  for (const needle of missingGuards) console.error(`- ${needle}`);
  process.exit(1);
}

console.log(`Runtime helper audit passed: ${declared.size} declarations checked, ${unqualifiedCalls.length} unresolved calls.`);
