import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("responsive CSS regression contract", () => {
  it("keeps the app shell and summary grid responsive on tablet and mobile widths", () => {
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toMatch(
      /@media \(max-width: 900px\)[\s\S]*\.app-shell\s*{[\s\S]*grid-template-columns:\s*1fr;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 900px\)[\s\S]*\.metric-grid\s*{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.metric-grid\s*{[\s\S]*grid-template-columns:\s*1fr;/,
    );
  });

  it("preserves horizontal scrolling for navigation and dense resource tables", () => {
    expect(styles).toMatch(
      /@media \(max-width: 900px\)[\s\S]*nav\s*{[\s\S]*overflow-x:\s*auto;/,
    );
    expect(styles).toMatch(/\.table-wrap\s*{[\s\S]*overflow-x:\s*auto;/);
    expect(styles).toMatch(/table\s*{[\s\S]*min-width:\s*680px;/);
  });
});
