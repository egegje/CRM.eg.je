/**
 * Pins the contract for repopulateMailboxSelect — the helper that the
 * live-poll calls every 30 seconds. The bug it guards against: a fresh
 * <select> value gets reset to the first option on innerHTML rebuild,
 * which silently changed which mailbox a user's compose was sending from.
 *
 * The test imports app.js as text, extracts the function, and runs it in
 * a happy-dom DOM. Behavior drift = test fails.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let repopulate: (sel: HTMLSelectElement, mailboxes: Array<{ id: string; displayName: string; email: string }>) => void;
let window: Window;
let document: Document;

beforeAll(() => {
  window = new Window();
  document = window.document as unknown as Document;
  // Pull the function out of the live app.js so a refactor that breaks
  // the contract trips this test. Using the function declaration as the
  // source of truth keeps one place to fix.
  const src = readFileSync(
    join(import.meta.dirname, "..", "..", "public", "app.js"),
    "utf8",
  );
  const m = src.match(/function repopulateMailboxSelect\([^)]*\)\s*{[\s\S]*?\n}/);
  if (!m) throw new Error("repopulateMailboxSelect not found in app.js");
  // Build a sandbox so the function references `document.createElement` correctly.
  const fn = new (window as unknown as { Function: typeof Function }).Function(
    "sel",
    "mailboxes",
    "(" + m[0] + ")(sel, mailboxes); return;",
  );
  repopulate = fn as typeof repopulate;
});

function makeSelect() {
  const sel = document.createElement("select") as HTMLSelectElement;
  document.body.appendChild(sel);
  return sel;
}

const mailboxesA = [
  { id: "mb_pluton", displayName: "Pluton", email: "pluton@example.com" },
  { id: "mb_ekaterina", displayName: "Ekaterina", email: "ekaterina@example.com" },
  { id: "mb_ulyana", displayName: "Ulyana", email: "ulyana@example.com" },
];

describe("repopulateMailboxSelect", () => {
  it("populates the select with one option per mailbox", () => {
    const sel = makeSelect();
    repopulate(sel, mailboxesA);
    expect(sel.options.length).toBe(3);
    expect(Array.from(sel.options).map((o) => o.value)).toEqual([
      "mb_pluton",
      "mb_ekaterina",
      "mb_ulyana",
    ]);
  });

  it("PRESERVES the user's selection across a re-populate when the mailbox is still in the list", () => {
    // This is the regression we hit in production: the 30s live-poll
    // would call this function while compose was open, and a naive
    // innerHTML rebuild would reset .value to the first option, so a
    // user who picked Ekaterina silently had Send go out from Pluton.
    const sel = makeSelect();
    repopulate(sel, mailboxesA);
    sel.value = "mb_ekaterina";
    expect(sel.value).toBe("mb_ekaterina");
    // Same list, simulating a poll tick:
    repopulate(sel, mailboxesA);
    expect(sel.value).toBe("mb_ekaterina");
    // And again with the list reordered (server returned different order):
    repopulate(sel, [mailboxesA[2], mailboxesA[0], mailboxesA[1]]);
    expect(sel.value).toBe("mb_ekaterina");
  });

  it("falls back to the first option when the previously-selected mailbox was removed", () => {
    const sel = makeSelect();
    repopulate(sel, mailboxesA);
    sel.value = "mb_ekaterina";
    // Ekaterina's mailbox got disabled — only Pluton + Ulyana remain.
    repopulate(sel, [mailboxesA[0], mailboxesA[2]]);
    expect(sel.value).toBe("mb_pluton");
  });

  it("clears the previous options instead of accumulating duplicates", () => {
    const sel = makeSelect();
    repopulate(sel, mailboxesA);
    repopulate(sel, mailboxesA);
    repopulate(sel, mailboxesA);
    expect(sel.options.length).toBe(3);
  });
});
