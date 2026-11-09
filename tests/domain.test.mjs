import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(
  fs.readFileSync(new URL("../lib/domain.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const d = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const lot = (overrides = {}) => ({
  id: "milk",
  name: "우유",
  quantity: 600,
  unit: "ml",
  place: "냉장",
  expiry: "2026-12-15",
  dateType: "소비기한",
  opened: true,
  purchasedAt: "2026-11-01",
  observedAt: null,
  version: 1,
  label: null,
  ...overrides,
});
const observation = (overrides = {}) => ({
  id: "o",
  name: "우유",
  nameEvidence: "우유 라벨",
  identityClear: true,
  quantity: 1000,
  unit: "ml",
  quantityEvidence: "라벨 1000ml",
  wholeQuantityVisible: false,
  sealed: false,
  packageCapacity: "1L",
  expiry: null,
  dateType: "미상",
  expiryEvidence: "",
  place: "냉장",
  matchedLotId: "milk",
  matchEvidence: "같은 우유 포장",
  uncertain: [],
  label: null,
  ...overrides,
});
const photo = (o, overrides = {}) => ({
  id: "photo",
  kind: "fridge",
  received: true,
  hashes: ["hash"],
  observations: [o],
  at: "2026-11-09T00:00:00Z",
  summary: "분석",
  ...overrides,
});
test("opened labelled capacity and hidden expiry never overwrite remaining stock", () => {
  const s = d.newState();
  s.inventory = [lot(), lot({ id: "hidden", name: "두부" })];
  d.autoReconcile(s, photo(observation()));
  assert.equal(s.inventory.find((l) => l.id === "milk").quantity, 600);
  assert.equal(s.inventory.find((l) => l.id === "milk").expiry, "2026-12-15");
  assert.equal(s.inventory.find((l) => l.id === "hidden").quantity, 600);
  assert.equal(s.photos[0].observations[0].status, "review");
});
test("clearly counted whole lot updates exact quantity and can be undone", () => {
  const s = d.newState();
  s.inventory = [lot({ name: "달걀", unit: "개", quantity: 6 })];
  d.autoReconcile(
    s,
    photo(
      observation({
        name: "달걀",
        unit: "개",
        quantity: 4,
        wholeQuantityVisible: true,
        quantityEvidence: "네 알 전체가 보임",
      }),
    ),
  );
  assert.equal(s.inventory[0].quantity, 4);
  d.undoChange(s, s.changes[0].id);
  assert.equal(s.inventory[0].quantity, 6);
});
test("multiple packages and unreceived purchases require review", () => {
  const s = d.newState();
  s.inventory = [lot(), lot({ id: "milk2" })];
  d.autoReconcile(s, photo(observation()));
  assert.equal(s.changes.length, 0);
  const s2 = d.newState();
  d.autoReconcile(
    s2,
    photo(
      observation({
        matchedLotId: null,
        sealed: true,
        wholeQuantityVisible: true,
      }),
      { kind: "purchase", received: false },
    ),
  );
  assert.equal(s2.inventory.length, 0);
});
test("unseen new fridge objects require confirmation instead of duplicating lots", () => {
  const s = d.newState();
  d.autoReconcile(s, photo(observation({ matchedLotId: null })));
  assert.equal(s.inventory.length, 0);
});
test("impossible calendar dates rejected", () => {
  assert.equal(d.validDate("2026-02-30"), false);
  assert.equal(d.validDate("2028-02-29"), true);
  assert.throws(() => d.ensureLot(lot({ expiry: "2026-02-30" })));
});
test("undo refuses to erase subsequent edits", () => {
  const s = d.newState();
  d.setLot(s, lot(), "first");
  const old = s.changes[0].id;
  d.setLot(s, { ...s.inventory[0], quantity: 300 }, "later", 1);
  assert.throws(() => d.undoChange(s, old));
  assert.equal(s.inventory[0].quantity, 300);
});
const recipe = (overrides = {}) => ({
  id: "r",
  name: "양파 볶음",
  description: "",
  reason: "",
  difficulty: "쉬움",
  difficultyReason: "",
  totalMinutes: 15,
  activeMinutes: 10,
  servings: 1,
  equipment: ["프라이팬"],
  tags: ["볶음"],
  ingredients: [
    { name: "양파", quantity: 100, unit: "g", grams: 100, allergens: [] },
  ],
  steps: [{ text: "양파를 볶아요", minutes: 5 }],
  ...overrides,
});
test("compound ingredients are excluded by explicit allergy aliases", () => {
  const p = d.newState().profile;
  p.allergies = ["우유"];
  assert.equal(
    d.violates(
      recipe({
        ingredients: [
          { name: "버터", allergens: [], quantity: 10, unit: "g", grams: 10 },
        ],
      }),
      p,
    ),
    true,
  );
});
test("unsafe substitutions are excluded even when the original recipe is safe", () => {
  const p = d.newState().profile;
  p.allergies = ["우유"];
  assert.equal(
    d.violates(recipe({ substitutions: ["식용유 대신 버터를 사용해요"] }), p),
    true,
  );
});
test("similar photos are marked for review and ambiguous purchases do not add inventory", () => {
  assert.equal(
    d.similarFingerprint("0123456789abcdef", "0123456789abcdee"),
    true,
  );
  assert.equal(
    d.similarFingerprint("0000000000000000", "ffffffffffffffff"),
    false,
  );
  const s = d.newState();
  d.autoReconcile(
    s,
    photo(
      observation({ matchedLotId: null, uncertain: ["주문 여부 불명확"] }),
      { kind: "purchase" },
    ),
  );
  assert.equal(s.inventory.length, 0);
  assert.equal(s.photos[0].observations[0].status, "review");
});
test("repeated meal completion only deducts once and rejects total overuse", () => {
  const s = d.newState();
  s.inventory = [lot()];
  const m = {
    id: "meal",
    recipe: recipe(),
    evaluation: { rating: 4 },
    at: "now",
    used: [{ lotId: "milk", quantity: 100 }],
  };
  d.completeMeal(s, m);
  d.completeMeal(s, m);
  assert.equal(s.inventory[0].quantity, 500);
  assert.equal(s.meals.length, 1);
  assert.throws(() =>
    d.completeMeal(s, {
      ...m,
      id: "bad",
      used: [
        { lotId: "milk", quantity: 400 },
        { lotId: "milk", quantity: 400 },
      ],
    }),
  );
  assert.equal(s.inventory[0].quantity, 500);
});
test("nutrition is portion scaled and unknown values never become zero", () => {
  const ingredients = recipe().ingredients;
  const n = d.nutritionFor(ingredients, 2, () => ({
    value: { kcal: 40, protein: 2, carbs: 8, fat: null },
    grams: 150,
    source: "test",
  }));
  assert.equal(n.kcal, 30);
  assert.equal(n.protein, 1.5);
  assert.equal(n.fat, null);
  assert.equal(n.complete, false);
  assert.equal(d.nutritionFor(ingredients, 1, () => null).kcal, null);
});
test("negative feedback lowers repeat recipe rank; time constraints reject", () => {
  const s = d.newState();
  const a = recipe(),
    b = recipe({ id: "b", name: "새로운 양파 볶음", tags: [] });
  s.meals = [{ id: "m", recipe: a, evaluation: { rating: 1, again: false } }];
  const ranked = d.rankRecipes(
    [a, b, recipe({ id: "slow", totalMinutes: 60 })],
    s,
    30,
  );
  assert.equal(ranked[0].id, "b");
  assert.equal(ranked.length, 2);
});
