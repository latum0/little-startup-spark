import { readdir, rm } from "node:fs/promises";
import { basename, isAbsolute, parse, relative, resolve, sep } from "node:path";

export function safeGameFolderName(title: string): string {
  const safe = title
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim()
    .replace(/[. ]+$/g, "");
  return safe && safe !== "." && safe !== ".." ? safe : "Game";
}

export async function containsSetupExecutable(folder: string, depth = 0): Promise<boolean> {
  if (depth > 2) return false;
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === "setup.exe") return true;
    if (entry.isDirectory() && (await containsSetupExecutable(resolve(folder, entry.name), depth + 1)))
      return true;
  }
  return false;
}

/** Delete only a completed install's dedicated game download folder. */
export async function removeCompletedRepack(
  savePath: string,
  setupPath: string,
  gameTitle: string,
): Promise<boolean> {
  const folder = resolve(savePath);
  const setup = resolve(setupPath);
  const root = parse(folder).root;
  const setupRelativePath = relative(folder, setup);
  if (
    folder === root ||
    basename(folder).toLocaleLowerCase() !== safeGameFolderName(gameTitle).toLocaleLowerCase() ||
    !setupRelativePath ||
    setupRelativePath === ".." ||
    setupRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(setupRelativePath) ||
    !(await containsSetupExecutable(folder))
  ) {
    return false;
  }
  await rm(folder, { recursive: true, force: true });
  return true;
}
