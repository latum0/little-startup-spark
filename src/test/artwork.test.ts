import { describe, expect, it } from "vitest";
import { isConfidentSteamMatch, rankSteamSearchResults } from "../../electron/artwork";

describe("Steam artwork title matching", () => {
  it("matches punctuation and repack suffixes to the store title", () => {
    const results = rankSteamSearchResults("The Witcher 3 Wild Hunt [FitGirl Repack]", [
      { id: 1, name: "The Witcher 3: Wild Hunt - Complete Edition" },
      { id: 2, name: "The Witcher Adventure Game" },
    ]);
    expect(results[0]?.id).toBe(1);
    expect(
      isConfidentSteamMatch(results[0]!.score, "The Witcher 3 Wild Hunt [FitGirl Repack]"),
    ).toBe(true);
  });

  it("does not accept a weakly related title", () => {
    const results = rankSteamSearchResults("Elden Ring", [
      { id: 1, name: "Elden Ring Nightreign" },
      { id: 2, name: "Ring of Elysium" },
    ]);
    expect(isConfidentSteamMatch(results.at(-1)!.score, "Elden Ring")).toBe(false);
  });

  it("treats a game edition suffix as the same artwork title", () => {
    const results = rankSteamSearchResults("Control Ultimate Edition", [
      { id: 9, name: "Control" },
      { id: 10, name: "Control Ultimate Edition" },
    ]);
    expect(results[0]?.id).toBe(9);
    expect(results[0]?.score).toBe(1);
  });
});
