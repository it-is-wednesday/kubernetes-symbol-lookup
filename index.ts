import { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type Resource = {
  kind: string;
  name: string;
};

function removeQuotes(s: string) {
  return s[0] === '"' ? s.slice(1, -1) : s;
}

async function resourcesInFile(
  lines: string[],
  chartName: string
): Promise<Resource[]> {
  const results: Resource[] = [];

  let currentKind = null;
  let currentName = null;

  for await (const line of lines) {
    if (line.startsWith("kind: ")) currentKind = line.slice(6);
    if (line.startsWith("  name: ")) currentName = line.slice(8);

    if (currentKind && currentName) {
      results.push({
        kind: currentKind,
        name: removeQuotes(currentName).replace(
          /{{\s*\.Chart\.Name\s*}}/,
          chartName
        ),
      });

      currentKind = null;
      currentName = null;
    }
  }

  return results;
}

function fileAndNotYaml(dirent: Dirent): boolean {
  return !dirent.isDirectory() && !dirent.name.endsWith("yaml");
}

/**
 * Recursively find all files, flattened
 */
async function deepReadDir(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const promises = entries.map(async (entry) => {
    if (
      entry.name === ".git" ||
      entry.name === "Chart.yaml" ||
      entry.name === "values.yaml" ||
      fileAndNotYaml(entry)
    )
      return null;
    const path = join(dirPath, entry.name);
    return entry.isDirectory() ? await deepReadDir(path) : path;
  });
  const resolved = await Promise.all(promises);
  return resolved.filter((x): x is string | string[] => x !== null).flat();
}

(async () => {
  const baseDir = "/home/crobar/dev/copypastot/chart";

  // find chart name
  const chartYaml = (await readFile(baseDir + "/Chart.yaml"))
    .toString()
    .match("\nname: (.*?)\n")![1];

  const files = await deepReadDir(baseDir);
  for (const f of files) {
    const content = (await readFile(f)).toString().split("\n");
    (await resourcesInFile(content, chartYaml)).forEach((x) =>
      console.log(JSON.stringify({
        ...x,
        file: f
      }))
    );
  }
})();
