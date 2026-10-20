import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { glyphUri, ICONS, Said, spoken, type IconName } from "../web/src/icons";
import { PALETTE } from "../web/src/pixels";
import { TIME_MARK, timeAmount } from "../web/src/timeMark";

const css = readFileSync(new URL("../web/src/styles.css", import.meta.url), "utf8");

// Emoji and symbol characters draw differently from one font and phone to the next.
const SYMBOLS = /[←-⯿⌀-⏿\u{1F000}-\u{1FAFF}]/u;

describe("the icons", () => {
  it("are whole rectangles, drawn in the palette or the text colour", () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(new Set(rows.map((row) => row.length)).size, name).toBe(1);
      for (const letter of rows.join("").replaceAll(".", "").replaceAll("#", "")) expect(PALETTE[letter], `${name} ${letter}`).toBeDefined();
    }
  });

  it("are the images the stylesheet masks its marks with", () => {
    const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const used = [...css.matchAll(/var\(--icon-([a-z-]+)\)/g)].map((found) => found[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of Object.keys(ICONS) as IconName[]) {
      if (!used.includes(kebab(name))) continue;
      expect(css, name).toContain(`--icon-${kebab(name)}: ${glyphUri(name)};`);
    }
  });

  it("leave no emoji or symbol characters in the stylesheet", () => {
    expect(css).not.toMatch(SYMBOLS);
  });
});

describe("Said", () => {
  it("draws each hourglass in a sentence as the icon", () => {
    const html = renderToStaticMarkup(createElement(Said, { text: "This takes 2 ⌛, and you have 1 ⌛ left tonight." }));
    expect(html).not.toContain("⌛");
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).toContain("This takes 2 ");
    expect(html).toContain('aria-label="hourglass"');
  });

  it("leaves a sentence with no hourglass as it is", () => {
    expect(renderToStaticMarkup(createElement(Said, { text: "You need 5 more gold." }))).toBe("You need 5 more gold.");
  });
});

describe("spoken", () => {
  it("names the hourglasses for a reader that cannot see them", () => {
    expect(spoken("You have 2 of 3 ⌛ left")).toBe("You have 2 of 3 hourglasses left");
    expect(spoken("It takes 1 ⌛.")).toBe("It takes 1 hourglass.");
  });
});

describe("the time mark", () => {
  it("is written in one place on the page, so changing it is one edit", () => {
    const dir = new URL("../web/src/", import.meta.url);
    const typed = readdirSync(dir).filter((file) => file !== "timeMark.ts" && readFileSync(new URL(file, dir), "utf8").includes(TIME_MARK));
    expect(typed).toEqual([]);
  });

  it("counts an amount of time", () => {
    expect(timeAmount(2)).toBe(`2 ${TIME_MARK}`);
  });
});
