import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const bundlePath = resolve("public/echo/assets/index-w7HcY4BT.js");
const outputPath = resolve("src/worldArtifacts.ts");
const source = readFileSync(bundlePath, "utf8");
const start = source.indexOf("var Gn=[");

if (start < 0) {
  throw new Error("Could not find Echo artifact array in the exported bundle.");
}

const arrayStart = source.indexOf("[", start);
let depth = 0;
let inString = false;
let quote = "";
let escaped = false;
let arrayEnd = -1;

for (let i = arrayStart; i < source.length; i += 1) {
  const char = source[i];

  if (inString) {
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === quote) {
      inString = false;
    }
    continue;
  }

  if (char === "`" || char === "\"" || char === "'") {
    inString = true;
    quote = char;
    continue;
  }

  if (char === "[") {
    depth += 1;
  } else if (char === "]") {
    depth -= 1;
    if (depth === 0) {
      arrayEnd = i + 1;
      break;
    }
  }
}

if (arrayEnd < 0) {
  throw new Error("Could not read the complete Echo artifact array.");
}

const artifacts = Function(`return ${source.slice(arrayStart, arrayEnd)}`)();
const trimmed = artifacts.map((artifact) => ({
  id: artifact.id,
  name: artifact.name,
  nameEn: artifact.nameEn,
  museum: artifact.museum,
  origin: artifact.origin,
  period: artifact.period,
  category: artifact.category,
  group: artifact.group,
  description: artifact.description,
  highlight: artifact.highlight,
  model: artifact.model.replace("./assets/", "/echo/assets/"),
  modelCredit: artifact.modelCredit,
}));

const body = `export type WorldArtifact = {
  id: string;
  name: string;
  nameEn: string;
  museum: string;
  origin: string;
  period: string;
  category: string;
  group: string;
  description: string;
  highlight: string;
  model: string;
  modelCredit: string;
};

export const worldArtifacts = ${JSON.stringify(trimmed, null, 2)} satisfies WorldArtifact[];
`;

writeFileSync(outputPath, body);
console.log(`Wrote ${trimmed.length} artifacts to ${outputPath}`);
