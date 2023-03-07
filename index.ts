import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type Resource = {
  kind: string;
  name: string;
  lineNum: number;
  filePath: string;
};

function removeQuotes(s: string) {
  return s[0] === '"' ? s.slice(1, -1) : s;
}

async function resourcesInFile(
  file: Buffer,
  chartName: string
): Promise<Omit<Resource, "filePath">[]> {
  const lines = file.toString().split("\n");
  const results: Omit<Resource, "filePath">[] = [];

  let kind: string | null = null;
  let name: string | null = null;

  lines.forEach(async (line, lineNum) => {
    if (line.startsWith("kind: ")) kind = line.slice(6);
    if (line.startsWith("  name: ")) name = line.slice(8);

    if (kind && name) {
      results.push({
        kind: kind,
        name: removeQuotes(name).replace(/{{\s*\.Chart\.Name\s*}}/, chartName),
        lineNum,
      });

      kind = null;
      name = null;
    }
  });

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

function findChartName(chartYaml: Buffer): string | undefined {
  const m = chartYaml.toString().match("\nname: (.*?)\n");
  return m ? m[1] : undefined;
}

async function main() {
  const baseDir = "/home/crobar/dev/copypastot/chart";

  // find chart name
  const chartYamlPath = baseDir + "/Chart.yaml";
  const chartName = await readFile(chartYamlPath).then(findChartName);
  if (!chartName) throw Error(`No 'name' field in ${chartYamlPath}`);

  // gather all resources from all of the files in our chart into an array and
  // print it
  const allResources = [];
  for (const path of await deepReadDir(baseDir)) {
    const resources = await resourcesInFile(await readFile(path), chartName);
    const withPath = resources.map((r) => ({ ...r, filePath: path }));
    allResources.push(...withPath);
  }
  console.log(JSON.stringify(allResources))
}

main();
