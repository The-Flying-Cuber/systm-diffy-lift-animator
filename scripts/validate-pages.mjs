import { access, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "";
const isAccountPagesRepository = repositoryName.endsWith(".github.io");
const basePath =
  repositoryName && !isAccountPagesRepository ? `/${repositoryName}` : "";
const outputDirectory = path.resolve("out");
const indexPath = path.join(outputDirectory, "index.html");

await access(indexPath);
await access(path.join(outputDirectory, ".nojekyll"));

const html = await readFile(indexPath, "utf8");

if (basePath && html.includes('"/_next/')) {
  throw new Error("The exported page contains a root-relative Next.js asset URL.");
}

const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => reference.startsWith(`${basePath}/`));

if (!references.some((reference) => reference.includes("/_next/"))) {
  throw new Error("No GitHub Pages-prefixed Next.js assets were found.");
}

for (const reference of new Set(references)) {
  const cleanReference = reference.split(/[?#]/, 1)[0];
  const relativePath = cleanReference.slice(basePath.length).replace(/^\//, "");
  if (!relativePath) continue;
  await access(path.join(outputDirectory, decodeURIComponent(relativePath)));
}

console.log(
  `Validated GitHub Pages export${basePath ? ` for ${basePath}` : ""}.`,
);
