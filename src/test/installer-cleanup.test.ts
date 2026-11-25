import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { removeCompletedRepack } = require("../../electron-dist/installer-cleanup.cjs") as typeof import("../../electron/installer-cleanup.cjs");
let temporaryDirectory: string | undefined;

afterEach(() => {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("completed repack cleanup", () => {
  it("removes only the dedicated game folder after installer success", async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "nexus-repack-cleanup-"));
    const gameFolder = join(temporaryDirectory, "Sample Game");
    const setupPath = join(gameFolder, "setup.exe");
    const otherGameFolder = join(temporaryDirectory, "Keep This Game");
    mkdirSync(gameFolder, { recursive: true });
    mkdirSync(otherGameFolder, { recursive: true });
    writeFileSync(setupPath, "fixture");
    writeFileSync(join(gameFolder, "data.bin"), "repack data");
    writeFileSync(join(otherGameFolder, "setup.exe"), "other setup");

    await expect(removeCompletedRepack(gameFolder, setupPath, "Sample Game")).resolves.toBe(true);

    expect(existsSync(gameFolder)).toBe(false);
    expect(existsSync(otherGameFolder)).toBe(true);
    expect(existsSync(temporaryDirectory)).toBe(true);
  });

  it("keeps folders when the setup is outside the game's download folder", async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "nexus-repack-keep-"));
    const gameFolder = join(temporaryDirectory, "Sample Game");
    const setupPath = join(temporaryDirectory, "setup.exe");
    mkdirSync(gameFolder, { recursive: true });
    writeFileSync(setupPath, "fixture");
    writeFileSync(join(gameFolder, "data.bin"), "repack data");

    await expect(removeCompletedRepack(gameFolder, setupPath, "Sample Game")).resolves.toBe(false);

    expect(existsSync(gameFolder)).toBe(true);
    expect(existsSync(join(gameFolder, "data.bin"))).toBe(true);
  });
});
