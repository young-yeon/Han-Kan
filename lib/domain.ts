export type Unit = "g" | "ml" | "개" | "팩";
export type Place = "냉장" | "냉동" | "실온";
export type Nutrients = {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};
export type Lot = {
  id: string;
  name: string;
  quantity: number | null;
  unit: Unit;
  place: Place;
  expiry: string | null;
  dateType: string;
  opened: boolean;
  purchasedAt: string;
  observedAt: string | null;
  version: number;
  label: (Nutrients & { per: number; unit: "g" | "ml" }) | null;
};
export type Profile = {
  onboarded: boolean;
  likes: string[];
  allergies: string[];
  excluded: string[];
  equipment: string[];
  spice: string;
  servings: number;
  goalType: "daily" | "meal";
  mealShare: number;
  goals: Nutrients;
};
export type Ingredient = {
  name: string;
  quantity: number;
  unit: Unit;
  grams: number | null;
  allergens: string[];
};
export type Recipe = {
  id: string;
  name: string;
  description: string;
  reason: string;
  difficulty: "쉬움" | "보통" | "어려움";
  difficultyReason: string;
  totalMinutes: number;
  activeMinutes: number;
  servings: number;
  equipment: string[];
  tags: string[];
  ingredients: Ingredient[];
  steps: { text: string; minutes: number }[];
  nutrition?: Nutrients & {
    complete: boolean;
    sources: string[];
    notes: string[];
  };
  missing?: Ingredient[];
  substitutions?: string[];
  score?: number;
};
export type Evaluation = {
  rating: number;
  taste: string;
  portion: string;
  difficulty: string;
  actualMinutes: number;
  again: boolean;
  note: string;
};
export type Meal = {
  id: string;
  recipe: Recipe;
  evaluation: Evaluation;
  at: string;
  used: { lotId: string; quantity: number }[];
};
export type Change = {
  id: string;
  at: string;
  reason: string;
  before: Lot | null;
  after: Lot | null;
  undone: boolean;
};
export type ShoppingItem = Ingredient & {
  id: string;
  recipeId: string;
  recipeName: string;
  received: boolean;
};
export type Observation = {
  id: string;
  name: string;
  nameEvidence: string;
  identityClear: boolean;
  quantity: number | null;
  unit: Unit;
  quantityEvidence: string;
  wholeQuantityVisible: boolean;
  sealed: boolean;
  packageCapacity: string | null;
  expiry: string | null;
  dateType: string;
  expiryEvidence: string;
  place: Place;
  matchedLotId: string | null;
  matchEvidence: string;
  uncertain: string[];
  label: Lot["label"];
  status?: "auto" | "review" | "confirmed" | "dismissed";
  reviewReason?: string;
};
export type PhotoAnalysis = {
  id: string;
  kind: "purchase" | "ingredient" | "fridge";
  received: boolean;
  hashes: string[];
  fingerprints?: string[];
  observations: Observation[];
  at: string;
  summary: string;
};
export function similarFingerprint(a: string, b: string) {
  if (!/^[a-f0-9]{16}$/.test(a) || !/^[a-f0-9]{16}$/.test(b)) return false;
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits <= 6;
}
export type State = {
  profile: Profile;
  inventory: Lot[];
  changes: Change[];
  shopping: ShoppingItem[];
  meals: Meal[];
  recommendations: Recipe[];
  photos: PhotoAnalysis[];
  requests: string[];
};
export const emptyNutrients = (): Nutrients => ({
  kcal: null,
  protein: null,
  carbs: null,
  fat: null,
});
export const newState = (): State => ({
  profile: {
    onboarded: false,
    likes: [],
    allergies: [],
    excluded: [],
    equipment: ["프라이팬", "냄비", "전자레인지"],
    spice: "보통",
    servings: 1,
    goalType: "daily",
    mealShare: 1 / 3,
    goals: emptyNutrients(),
  },
  inventory: [],
  changes: [],
  shopping: [],
  meals: [],
  recommendations: [],
  photos: [],
  requests: [],
});
export const normalize = (s: string) =>
  s.toLowerCase().replace(/\s|[()·_-]/g, "");
export function validDate(s: string | null): boolean {
  if (s === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}
export function seoulDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function ensureLot(lot: Lot) {
  if (!lot.name.trim() || lot.name.length > 80)
    throw Error("재료 이름을 확인해 주세요.");
  if (
    lot.quantity !== null &&
    (!Number.isFinite(lot.quantity) ||
      lot.quantity < 0 ||
      lot.quantity > 1000000)
  )
    throw Error("수량을 확인해 주세요.");
  if (
    !["g", "ml", "개", "팩"].includes(lot.unit) ||
    !["냉장", "냉동", "실온"].includes(lot.place) ||
    !validDate(lot.expiry)
  )
    throw Error("단위·보관 위치·날짜를 확인해 주세요.");
}
export function setLot(
  state: State,
  lot: Lot,
  reason: string,
  expectedVersion?: number,
) {
  ensureLot(lot);
  const old = state.inventory.find((x) => x.id === lot.id);
  if (expectedVersion !== undefined && (old?.version ?? 0) !== expectedVersion)
    throw Error("다른 변경이 있어요. 새로고침 후 다시 확인해 주세요.");
  const after = { ...lot, version: (old?.version ?? 0) + 1 };
  state.inventory = state.inventory.filter((x) => x.id !== lot.id);
  state.inventory.push(after);
  state.changes.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    reason,
    before: old ? structuredClone(old) : null,
    after: structuredClone(after),
    undone: false,
  });
  return after;
}
export function undoChange(state: State, id: string) {
  const c = state.changes.find((x) => x.id === id);
  if (!c || c.undone || !c.after) throw Error("되돌릴 변경이 없어요.");
  const current = state.inventory.find((x) => x.id === c.after!.id);
  if (!current || current.version !== c.after.version)
    throw Error(
      "이후 변경이 있어 자동으로 되돌릴 수 없어요. 재고에서 직접 수정해 주세요.",
    );
  state.inventory = state.inventory.filter((x) => x.id !== current.id);
  if (c.before)
    state.inventory.push({ ...c.before, version: current.version + 1 });
  c.undone = true;
}
export function autoReconcile(state: State, photo: PhotoAnalysis) {
  for (const o of photo.observations) {
    o.status = "review";
    const candidates = state.inventory.filter(
      (x) => normalize(x.name) === normalize(o.name),
    );
    const old = o.matchedLotId
      ? candidates.find((x) => x.id === o.matchedLotId)
      : undefined;
    const explain = (s: string) => {
      o.reviewReason = s;
    };
    if (photo.kind === "purchase" && !photo.received) {
      explain("수령 확인 후 추가할 수 있어요.");
      continue;
    }
    if (
      !o.identityClear ||
      !o.nameEvidence.trim() ||
      (photo.kind === "purchase" && o.uncertain.length > 0) ||
      o.uncertain.some((x) => x.includes("중복"))
    ) {
      explain("식별 근거 또는 촬영 범위를 확인해 주세요.");
      continue;
    }
    if (candidates.length > 1 || (!old && candidates.length)) {
      explain("같은 재료의 다른 포장 또는 중복 사진일 수 있어요.");
      continue;
    }
    if (old && !o.matchEvidence.trim()) {
      explain("기존 포장과 일치하는지 확인해 주세요.");
      continue;
    }
    // A wide refrigerator photo cannot prove that an unlabelled individual object is a new purchase.
    if (!old && photo.kind === "fridge") {
      explain("새 재료인지 기존 재료인지 확인해 주세요.");
      continue;
    }
    const quantityClear =
      o.wholeQuantityVisible &&
      !!o.quantityEvidence.trim() &&
      o.quantity !== null &&
      (o.unit === "개" || o.sealed);
    const expiryClear =
      !!o.expiry &&
      validDate(o.expiry) &&
      o.expiryEvidence.includes(o.expiry) &&
      ["소비기한", "유통기한", "품질유지기한"].includes(o.dateType);
    const lot: Lot = old
      ? structuredClone(old)
      : {
          id: crypto.randomUUID(),
          name: o.name,
          quantity: null,
          unit: o.unit,
          place: o.place,
          expiry: null,
          dateType: "미상",
          opened: !o.sealed,
          purchasedAt: seoulDate(),
          observedAt: null,
          version: 0,
          label: null,
        };
    if (quantityClear && (!old || old.unit === o.unit))
      lot.quantity = o.quantity;
    if (expiryClear) {
      lot.expiry = o.expiry;
      lot.dateType = o.dateType;
    }
    // Label nutrient readings are always reviewed before being used in calculations.
    lot.observedAt = photo.at;
    setLot(state, lot, "사진 자동 반영", old?.version ?? 0);
    o.matchedLotId = lot.id;
    o.status =
      !quantityClear ||
      (!expiryClear && o.expiry !== null) ||
      !!o.label ||
      o.uncertain.length > 0
        ? "review"
        : "auto";
    if (o.status === "review")
      explain("확실한 정보는 반영했어요. 수량·기한·영양 라벨을 확인해 주세요.");
  }
  state.photos.unshift(photo);
}
const allergyAliases: Record<string, string[]> = {
  우유: ["우유", "치즈", "버터", "크림", "요거트", "유청"],
  달걀: ["달걀", "계란", "마요네즈"],
  계란: ["계란", "달걀", "마요네즈"],
  밀: ["밀", "밀가루", "빵", "파스타", "면", "간장"],
  대두: ["대두", "콩", "두부", "간장", "된장", "고추장"],
  땅콩: ["땅콩"],
  견과류: ["아몬드", "호두", "캐슈", "땅콩", "견과"],
  갑각류: ["새우", "게", "가재"],
  새우: ["새우", "새우젓"],
  생선: ["생선", "참치", "연어", "고등어", "멸치", "액젓"],
};
export function violates(recipe: Recipe, profile: Profile): boolean {
  const terms = [
    ...profile.allergies.flatMap((x) => [x, ...(allergyAliases[x] ?? [])]),
    ...profile.excluded,
  ]
    .map(normalize)
    .filter(Boolean);
  const text = normalize(
    [
      recipe.name,
      ...recipe.ingredients.flatMap((x) => [x.name, ...x.allergens]),
      ...recipe.steps.map((x) => x.text),
      ...(recipe.substitutions ?? []),
    ].join(" "),
  );
  return terms.some((x) => text.includes(x));
}
export function missingIngredients(
  recipe: Recipe,
  inventory: Lot[],
): Ingredient[] {
  return recipe.ingredients.flatMap((i) => {
    const lots = inventory.filter(
      (l) =>
        normalize(l.name) === normalize(i.name) &&
        l.unit === i.unit &&
        (!l.expiry || l.expiry >= seoulDate()),
    );
    const known = lots.reduce((s, l) => s + (l.quantity ?? 0), 0);
    const needed = Math.max(0, i.quantity - known);
    return needed > 0
      ? [{ ...i, quantity: Math.round(needed * 100) / 100 }]
      : [];
  });
}
export function rankRecipes(
  recipes: Recipe[],
  state: State,
  maxMinutes: number,
): Recipe[] {
  return recipes
    .filter(
      (r) =>
        r.totalMinutes <= maxMinutes &&
        r.activeMinutes <= r.totalMinutes &&
        !violates(r, state.profile) &&
        r.equipment.every((e) =>
          state.profile.equipment.some((x) => normalize(x) === normalize(e)),
        ),
    )
    .map((r) => {
      let score = 0;
      for (const i of r.ingredients) {
        const lots = state.inventory.filter(
          (l) =>
            normalize(l.name) === normalize(i.name) && (l.quantity ?? 1) > 0,
        );
        score += lots.length ? 3 : 0;
        score += lots.some(
          (l) =>
            l.expiry &&
            l.expiry >= seoulDate() &&
            new Date(l.expiry).valueOf() - new Date(seoulDate()).valueOf() <
              3 * 86400000,
        )
          ? 4
          : 0;
      }
      score +=
        state.profile.likes.filter((l) =>
          normalize(r.name + " " + r.tags.join(" ")).includes(normalize(l)),
        ).length * 3;
      score -= missingIngredients(r, state.inventory).length * 2;
      for (const m of state.meals) {
        const exact = normalize(m.recipe.name) === normalize(r.name);
        const overlap = r.tags.filter((t) => m.recipe.tags.includes(t)).length;
        score +=
          (exact ? 4 : Math.min(overlap, 2) * 0.4) * (m.evaluation.rating - 3);
        if (exact && !m.evaluation.again) score -= 5;
      }
      if (r.nutrition?.complete && state.profile.goals.kcal) {
        const target =
          state.profile.goals.kcal *
          (state.profile.goalType === "daily" ? state.profile.mealShare : 1);
        score -=
          (Math.abs((r.nutrition.kcal ?? 0) - target) / Math.max(target, 1)) *
          4;
      }
      return { ...r, missing: missingIngredients(r, state.inventory), score };
    })
    .sort((a, b) => b.score! - a.score!)
    .slice(0, 3);
}
export function completeMeal(state: State, meal: Meal) {
  if (state.meals.some((x) => x.id === meal.id)) return;
  const used = new Map<string, number>();
  for (const x of meal.used) {
    if (!Number.isFinite(x.quantity) || x.quantity < 0)
      throw Error("사용량을 확인해 주세요.");
    used.set(x.lotId, (used.get(x.lotId) ?? 0) + x.quantity);
  }
  for (const [id, amount] of used) {
    const lot = state.inventory.find((x) => x.id === id);
    if (!lot || lot.quantity === null || lot.quantity < amount)
      throw Error(
        "재고보다 많은 양을 사용할 수 없어요. 미상 수량은 먼저 확인해 주세요.",
      );
  }
  for (const [id, amount] of used) {
    const lot = state.inventory.find((x) => x.id === id)!;
    setLot(
      state,
      { ...lot, quantity: lot.quantity! - amount },
      "요리 완료",
      lot.version,
    );
  }
  state.meals.unshift(meal);
}
export function nutritionFor(
  ingredients: Ingredient[],
  servings: number,
  lookup: (
    i: Ingredient,
  ) => { value: Nutrients; grams: number; source: string } | null,
) {
  const totals: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const notes: string[] = [],
    sources: string[] = [];
  for (const i of ingredients) {
    const row = lookup(i);
    if (!row) {
      notes.push(i.name + " 영양 정보 또는 중량 미확인");
      for (const k of Object.keys(totals) as (keyof Nutrients)[])
        totals[k] = null;
      continue;
    }
    sources.push(row.source);
    for (const k of Object.keys(totals) as (keyof Nutrients)[]) {
      if (row.value[k] === null) totals[k] = null;
      else if (totals[k] !== null)
        totals[k]! += (row.value[k]! * row.grams) / 100 / servings;
    }
  }
  for (const k of Object.keys(totals) as (keyof Nutrients)[])
    if (totals[k] !== null) totals[k] = Math.round(totals[k]! * 10) / 10;
  return {
    ...totals,
    complete: Object.values(totals).every((x) => x !== null),
    notes,
    sources: [...new Set(sources)],
  };
}
