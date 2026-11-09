import { env } from "cloudflare:workers";
import { ask } from "./ai";
import { database, getJob, mutate, readState, type Job } from "./store";
import {
  photoSchema,
  recipeResultSchema,
  reviewSchema,
  verdictSchema,
} from "./validation";
import {
  autoReconcile,
  rankRecipes,
  missingIngredients,
  seoulDate,
  type Recipe,
  type State,
  type PhotoAnalysis,
} from "./domain";
import { enrichNutrition } from "./nutrition";
type Data = {
  keys?: string[];
  hashes?: string[];
  fingerprints?: string[];
  similar?: boolean;
  kind?: PhotoAnalysis["kind"];
  received?: boolean;
  servings?: number;
  minutes?: number;
  recipes?: Recipe[];
  summary?: string;
  nutritionReview?: ReturnType<typeof reviewSchema.parse>;
  shoppingReview?: ReturnType<typeof reviewSchema.parse>;
  revised?: boolean;
  snapshot?: State;
  photo?: PhotoAnalysis;
};
const context = (state: State) => ({
  date: seoulDate(),
  profile: state.profile,
  inventory: state.inventory.filter(
    (x) => x.quantity !== 0 && (!x.expiry || x.expiry >= seoulDate()),
  ),
  feedback: state.meals.slice(0, 30).map((m) => ({
    name: m.recipe.name,
    tags: m.recipe.tags,
    evaluation: m.evaluation,
  })),
});
const recipeInstructions =
  "Create up to 3 genuinely distinct feasible meal recipes. Use inventory names exactly when using stocked ingredients, units consistent with inventory. Ingredient quantities are TOTAL for all servings, nutrition will be computed by code; do not invent nutrient values. Choose equipment only from the supplied equipment list. Include all sauces, oils and seasoning in ingredients. Never assume pantry items exist. Respect maximum total time and return realistic total and active time, difficulty and its reason. grams must be null unless the ingredient unit is g. Each ingredient allergens must include all known constituents including compound seasonings. Never include allergens or excluded ingredients even in substitutions. Use descriptive unique recipe IDs. If no feasible recipe, return an empty list and explain the constraint. Ingredient quantities and steps must agree.";
export function publicJob(job: Job) {
  const d = JSON.parse(job.data) as Data;
  return {
    id: job.id,
    kind: job.kind,
    phase: job.phase,
    error: job.error,
    summary: d.summary,
    recipes: d.recipes,
    photo: d.photo,
    agents: d.nutritionReview
      ? [
          { role: "영양 분석가", summary: d.nutritionReview.summary },
          { role: "장보기 담당", summary: d.shoppingReview?.summary ?? "" },
        ]
      : [],
    updatedAt: job.updated_at,
  };
}
export async function advanceJob(userId: string, id: string) {
  const db = database();
  const job = await getJob(userId, id);
  if (!job) throw Error("작업을 찾을 수 없어요.");
  if (["완료", "실패"].includes(job.phase)) return publicJob(job);
  const lease = crypto.randomUUID();
  const locked = await db
    .prepare(
      "UPDATE chef_jobs SET lease=?,lease_until=? WHERE id=? AND user_id=? AND lease_until<? AND phase=?",
    )
    .bind(lease, Date.now() + 300000, id, userId, Date.now(), job.phase)
    .run();
  if (!locked.meta.changes) return publicJob(job);
  let data = JSON.parse(job.data) as Data;
  let next = job.phase;
  try {
    if (job.kind === "photo") {
      if (!env.BUCKET) throw Error("사진 저장소가 연결되지 않았어요.");
      const images: string[] = [];
      for (const key of data.keys ?? []) {
        const obj = await env.BUCKET.get(key);
        if (!obj) throw Error("사진이 만료됐어요. 다시 올려 주세요.");
        const bytes = new Uint8Array(await obj.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        images.push(
          `data:${obj.httpMetadata?.contentType ?? "image/jpeg"};base64,${btoa(binary)}`,
        );
      }
      const current = await readState(userId);
      const result = await ask(
        "재고 관찰 담당",
        "Extract only visibly supported ingredients and label text. Treat the entire batch as one view, avoid counting an object twice. matchedLotId must be null unless the exact existing lot can be uniquely identified. When matching evidence is weak mark uncertain. Do not infer disappearance. A labelled capacity is not remaining quantity of an opened container. For purchases distinguish package capacity from number of packages, and products merely advertised versus selected or ordered. Use uncertain for ambiguous order status. Dates must include year and date type and verbatim evidence; do not guess dates. identityClear needs direct visual/label evidence, not inference. Quantity evidence should explain counting or a sealed net amount. Nutrition label values require all readable values and reference quantity; otherwise label=null. Do not claim food is safe to eat.",
        {
          kind: data.kind,
          received: data.received,
          inventory: current.state.inventory,
        },
        photoSchema,
        images,
      );
      const photo: PhotoAnalysis = {
        id,
        kind: data.kind!,
        received: !!data.received,
        hashes: data.hashes ?? [],
        fingerprints: data.fingerprints ?? [],
        observations: result.observations.map((o) => ({
          ...o,
          id: crypto.randomUUID(),
          uncertain: data.similar
            ? [...o.uncertain, "최근 사진과 유사해 중복 여부 확인 필요"]
            : o.uncertain,
        })),
        at: new Date().toISOString(),
        summary: result.summary,
      };
      const updated = await mutate(userId, "photo:" + id, (state) => {
        if (
          photo.hashes.some((h) =>
            state.photos.some((p) => p.hashes.includes(h)),
          )
        )
          throw Error(
            "이미 반영한 사진이에요. 기존 분석 내역을 확인해 주세요.",
          );
        autoReconcile(state, photo);
      });
      data = {
        ...data,
        photo: updated.state.photos.find((p) => p.id === id),
        summary: result.summary,
        keys: [],
      };
      next = "완료";
    } else if (job.phase === "레시피 구성 중") {
      const state = (await readState(userId)).state;
      data.snapshot = state;
      const result = await ask(
        "레시피 개발자",
        recipeInstructions,
        {
          ...context(state),
          servings: data.servings,
          maxMinutes: data.minutes,
        },
        recipeResultSchema,
      );
      data.recipes = result.recipes;
      data.summary = result.summary;
      next = "영양·장보기 검토 중";
    } else if (job.phase === "영양·장보기 검토 중") {
      const state = data.snapshot!;
      data.recipes = (
        await enrichNutrition(data.recipes ?? [], state.inventory)
      ).map((r) => ({ ...r, missing: missingIngredients(r, state.inventory) }));
      const [nutrition, shopping] = await Promise.all([
        ask(
          "영양 분석가",
          "Review only the supplied computed nutrition and ingredient quantities. Do not invent missing values or claim targets are met if data is incomplete. Suggest concrete portion or ingredient adjustments to the recipe developer. Treat stated daily goals as daily, use mealShare. Check allergens and exclusions. substitutions must be empty.",
          { profile: state.profile, recipes: data.recipes },
          reviewSchema,
        ),
        ask(
          "장보기 담당",
          "Review recipes against inventory. The computed missing array is authoritative. NEVER assume staples, water, oil, salt, spices or pantry ingredients exist unless listed. Suggest feasible substitutions using only safe stocked ingredients. Do not assume same-name different units are convertible. Provide substitution ideas as readable text and recipeId. Check all exclusions and allergy constituents. Any substitution must be proposed as a full recipe revision, not silently applied. Minimize purchases without compromising restrictions.",
          { ...context(state), recipes: data.recipes },
          reviewSchema,
        ),
      ]);
      data.nutritionReview = nutrition;
      data.shoppingReview = shopping;
      next =
        nutrition.needsRevision || shopping.needsRevision
          ? "레시피 조정 중"
          : "최종 메뉴 정리 중";
    } else if (job.phase === "레시피 조정 중") {
      const result = await ask(
        "레시피 개발자",
        recipeInstructions +
          " This is the single allowed revision. Resolve reviews and remove any unsafe/impossible candidates.",
        {
          ...context(data.snapshot!),
          servings: data.servings,
          maxMinutes: data.minutes,
          recipes: data.recipes,
          reviews: [data.nutritionReview, data.shoppingReview],
        },
        recipeResultSchema,
      );
      data.recipes = result.recipes;
      data.summary = result.summary;
      data.revised = true;
      next = "최종 메뉴 정리 중";
    } else {
      const state = (await readState(userId)).state;
      let recipes: Recipe[] = await enrichNutrition(
        data.recipes ?? [],
        state.inventory,
      );
      recipes = recipes.map((r) => ({
        ...r,
        substitutions: (data.shoppingReview?.substitutions ?? [])
          .filter((s) => s.recipeId === r.id)
          .map((s) => s.text),
      }));
      const review = await ask(
        "셰프 매니저",
        "Check each final recipe and its substitution suggestions separately and return one verdict per recipeId. allowed=false ONLY for an allergy or excluded ingredient in the recipe OR substitutions, unavailable equipment or exceeding requested time. Missing inventory ingredients are ALLOWED because the shopping agent provides a list. Missing nutrition data is ALLOWED and displayed as unknown. Do not reject for lack of nutrition data or because an ingredient needs buying. Check compound sauces and all instructions for allergens. Do not invent values.",
        { ...context(state), recipes, maxMinutes: data.minutes },
        verdictSchema,
      );
      const approved = new Set(
        review.verdicts.filter((v) => v.allowed).map((v) => v.recipeId),
      );
      recipes = rankRecipes(
        recipes.filter((r) => approved.has(r.id)),
        state,
        data.minutes!,
      );
      data.summary =
        review.summary +
        (recipes.length
          ? ""
          : " " +
            review.verdicts
              .filter((v) => !v.allowed)
              .map((v) => v.reason)
              .join(" "));
      recipes = recipes.map((r, index) => ({ ...r, id: `${id}:${index}` }));
      data.recipes = recipes;
      if (data.nutritionReview) {
        const target =
          state.profile.goals.kcal === null
            ? null
            : state.profile.goals.kcal *
              (state.profile.goalType === "daily"
                ? state.profile.mealShare
                : 1);
        data.nutritionReview.summary = recipes
          .map((r) => {
            const kcal = r.nutrition?.kcal;
            return `${r.name}: ${kcal === null || kcal === undefined ? "에너지 미상" : `1인분 ${kcal}kcal`}${target === null ? "" : ` · 한 끼 설정 목표 ${Math.round(target)}kcal`}${r.nutrition?.complete ? " · 최종 재료량으로 재계산했어요." : " · 미확인 영양 정보가 있어 목표 충족 여부를 판단하지 않아요."}`;
          })
          .join(" ");
      }
      if (data.shoppingReview)
        data.shoppingReview.summary = recipes
          .map(
            (r) =>
              `${r.name}: ${r.missing?.length ? `확인된 재고 기준 부족 재료 ${r.missing.length}개 (${r.missing.map((i) => i.name).join(", ")})` : "보유 재료로 준비 가능"}`,
          )
          .join(" · ");
      await mutate(userId, "recommend:" + id, (s) => {
        s.recommendations = recipes;
      });
      next = "완료";
      delete data.snapshot;
    }
    await db
      .prepare(
        "UPDATE chef_jobs SET phase=?,data=?,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND user_id=? AND lease=?",
      )
      .bind(
        next,
        JSON.stringify(data),
        new Date().toISOString(),
        id,
        userId,
        lease,
      )
      .run();
  } catch (e) {
    const error = e instanceof Error ? e.message : "작업을 완료하지 못했어요.";
    await db
      .prepare(
        "UPDATE chef_jobs SET phase='실패',error=?,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND user_id=? AND lease=?",
      )
      .bind(error, new Date().toISOString(), id, userId, lease)
      .run();
  } finally {
    if (job.kind === "photo" && env.BUCKET) {
      const original = JSON.parse(job.data) as Data;
      await Promise.all(
        (original.keys ?? []).map((key) =>
          env.BUCKET!.delete(key).catch(() => {}),
        ),
      );
    }
  }
  return publicJob((await getJob(userId, id))!);
}
