import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { testSavesSchema } from "../src/shared/schema";
import { TEST_SAVES, TestSaves } from "../web/src/testSaves";

const file = testSavesSchema.parse(JSON.parse(readFileSync(new URL("../data/test-saves.json", import.meta.url), "utf8")));

describe("the test-save picker", () => {
  it("lists every scenario in the data file, in its order, with its about", () => {
    expect(TEST_SAVES).toEqual(file.scenarios.map(({ player, about }) => ({ player, about })));
  });

  it("offers a button per save, with the about as its tooltip, and marks the one open", () => {
    const [first, second] = TEST_SAVES;
    const html = renderToStaticMarkup(createElement(TestSaves, { current: second!.player, onPick: () => {}, onRestarted: () => {} }));
    // One per save, and one to start the open save over.
    expect(html.match(/<button/g)).toHaveLength(TEST_SAVES.length + 1);
    expect(html).toContain(`title="${first!.about.replaceAll("'", "&#x27;")}" aria-pressed="false"`);
    expect(html).toContain(`aria-pressed="true">${second!.player}</button>`);
    expect(html).toContain(`Start ${second!.player} over`);
  });

  it("offers no start-over for a player that is not a test save", () => {
    const html = renderToStaticMarkup(createElement(TestSaves, { current: "trysten-real-save", onPick: () => {}, onRestarted: () => {} }));
    expect(html).not.toContain("over</button>");
    expect(html.match(/<button/g)).toHaveLength(TEST_SAVES.length);
  });
});
