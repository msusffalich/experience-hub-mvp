import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const glossary = readFileSync("docs/experience-model-glossary-20260723.md", "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

[
  'reportCategoryBreakdown: "Distribución por Áreas de vida"',
  'reportCategoryBreakdown: "Life-area distribution"',
  'reportCategoryBreakdown: "Répartition par domaines de vie"',
  'reportCategoryBreakdown: "Distribuição por áreas de vida"',
  'relationCategory: "Área de vida"',
  'relationCategory: "Life area"',
  'relationCategory: "Domaine de vie"',
].forEach((text) => expect(app.includes(text), `Missing life-area translation: ${text}`));

expect(index.includes('<option value="category">Área de vida</option>'), "The experience-map relation selector must say Área de vida.");
expect(index.includes("Área de vida / persona / origen / objetivo"), "The report filter selector must say Área de vida.");
expect(!index.includes('<option value="category">Categoría</option>'), "The experience-map selector still exposes Categoría.");
expect(glossary.includes("El único término visible para la clasificación analítica es **Área de vida**"), "The canonical glossary must define Área de vida as the visible analytical term.");
expect(glossary.includes("campo técnico histórico puede llamarse `category`"), "The glossary must preserve the technical category-field compatibility rule.");

if (failures.length) {
  console.error("Life-area terminology verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Life-area terminology verification passed.");
