import { env } from "cloudflare:workers";
import { database } from "./store";
import {
  normalize,
  nutritionFor,
  type Nutrients,
  type Recipe,
  type Lot,
  type Ingredient,
} from "./domain";
type Row = { value: Nutrients; source: string };
export function numberOrNull(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) && x >= 0 ? x : null;
  if (typeof x !== "string" || !/^\d+(\.\d+)?$/.test(x.trim())) return null;
  return Number(x);
}
export function parseNutrientRecord(
  row: Record<string, unknown>,
  name: string,
): Row | null {
  const recordName = String(row.FOOD_NM_KR ?? "");
  if (
    normalize(recordName) !== normalize(name) &&
    !(
      row.DB_GRP_NM === "원재료성" &&
      normalize(recordName) === normalize(name + ", 생것")
    )
  )
    return null;
  const reference = String(row.SERVING_SIZE ?? row.NUTRI_AMOUNT ?? "").trim();
  if (!/^100\s*g$/i.test(reference)) return null;
  return {
    value: {
      kcal: numberOrNull(row.AMT_NUM1),
      protein: numberOrNull(row.AMT_NUM3),
      fat: numberOrNull(row.AMT_NUM4),
      carbs: numberOrNull(row.AMT_NUM6),
    },
    source: `식약처 ${String(row.FOOD_NM_KR)} (${String(row.FOOD_CD ?? "")})`,
  };
}
async function lookup(name: string): Promise<Row | null> {
  const db = database();
  const cached = await db
    .prepare("SELECT data,updated_at FROM chef_nutrient_cache WHERE name=?")
    .bind(name)
    .first<{ data: string; updated_at: string }>();
  if (cached && Date.now() - Date.parse(cached.updated_at) < 30 * 86400000)
    return JSON.parse(cached.data);
  const key = env.MFDS_API_KEY || process.env.MFDS_API_KEY;
  if (!key) return null;
  const url = new URL(
    "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03",
  );
  let decoded = key;
  try {
    decoded = decodeURIComponent(key);
  } catch {}
  const canonical =
    ({ 계란: "달걀", 대파: "파, 대파" } as Record<string, string>)[name] ??
    name;
  const queries = canonical.includes(",")
    ? [canonical]
    : [canonical + ", 생것", canonical];
  try {
    let row: Row | null = null;
    for (const query of queries) {
      url.search = new URLSearchParams({
        serviceKey: decoded,
        pageNo: "1",
        numOfRows: "100",
        type: "json",
        FOOD_NM_KR: query,
      }).toString();
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        body?: { items?: unknown };
        response?: { body?: { items?: unknown } };
      };
      const items = body.body?.items ?? body.response?.body?.items;
      const records = Array.isArray(items)
        ? items
        : ((items as { item?: unknown[] })?.item ?? []);
      const matches = records
        .map((x) => parseNutrientRecord(x, canonical))
        .filter((x): x is Row => !!x);
      // An exact food name with several products is not enough to choose a product.
      row = matches.length === 1 ? matches[0] : null;
      if (row) break;
    }
    if (row)
      await db
        .prepare(
          "INSERT INTO chef_nutrient_cache (name,data,updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
        )
        .bind(name, JSON.stringify(row), new Date().toISOString())
        .run();
    return row;
  } catch {
    return null;
  }
}
export async function enrichNutrition(recipes: Recipe[], inventory: Lot[]) {
  const names = [
    ...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.name))),
  ];
  const data = new Map<string, Row | null>();
  for (let i = 0; i < names.length; i += 4) {
    await Promise.all(
      names
        .slice(i, i + 4)
        .map(async (name) => data.set(name, await lookup(name))),
    );
  }
  return recipes.map((r) => ({
    ...r,
    nutrition: nutritionFor(r.ingredients, r.servings, (i: Ingredient) => {
      const lots = inventory.filter(
        (l) => normalize(l.name) === normalize(i.name),
      );
      const labelled = lots.length === 1 ? lots[0].label : null;
      if (labelled && i.unit === labelled.unit) {
        const value = Object.fromEntries(
          Object.entries(labelled)
            .filter(([k]) => ["kcal", "protein", "carbs", "fat"].includes(k))
            .map(([k, v]) => [
              k,
              v === null ? null : (Number(v) * 100) / labelled.per,
            ]),
        ) as Nutrients;
        return {
          value,
          grams: i.quantity,
          source: "확인한 제품 라벨: " + i.name,
        };
      }
      const row = data.get(i.name);
      if (!row || i.unit !== "g") return null;
      return { ...row, grams: i.quantity };
    }),
  }));
}
