"use client";
import { useState, useRef, useEffect } from "react";
import {
  Check,
  LoaderCircle,
  Clock,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  emptyNutrients,
  normalize,
  type Lot,
  type Profile,
  type PhotoAnalysis,
  type Observation,
  type Recipe,
  type State,
  type Evaluation,
  type Nutrients,
} from "@/lib/domain";
import {
  FormField,
  Notice,
  newLot,
  dateText,
  amount,
  nutrientNames,
  RecipeMeta,
  Nutrition,
} from "./chef-ui";
export type Review = { photo: PhotoAnalysis; observation: Observation } | null;
export function LotForm({
  initial,
  inventory,
  review,
  busy,
  onSave,
}: {
  initial: Lot;
  inventory: Lot[];
  review: Review;
  busy: boolean;
  onSave: (lot: Lot, received: boolean) => Promise<void>;
}) {
  const [lot, setLot] = useState(initial),
    [received, setReceived] = useState(review?.photo.received ?? true),
    [hasLabel, setHasLabel] = useState(!!initial.label);
  const set = <K extends keyof Lot>(key: K, value: Lot[K]) =>
    setLot((l) => ({ ...l, [key]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ ...lot, label: hasLabel ? lot.label : null }, received);
      }}
    >
      <FieldGroup>
        {review ? (
          <>
            <Notice>
              {review.observation.nameEvidence || "이름을 확인해 주세요."}{" "}
              {review.observation.quantityEvidence}{" "}
              {review.observation.expiryEvidence}
            </Notice>
            <FormField label="어느 포장의 정보인가요?">
              <select
                aria-label="포장 선택"
                value={lot.id}
                onChange={(e) => {
                  const match = inventory.find((i) => i.id === e.target.value);
                  setLot(
                    match ?? {
                      ...initial,
                      ...newLot(initial.name),
                      quantity: initial.quantity,
                      unit: initial.unit,
                      expiry: initial.expiry,
                      dateType: initial.dateType,
                    },
                  );
                }}
              >
                <option
                  value={
                    inventory.some((i) => i.id === lot.id) ? "new" : lot.id
                  }
                >
                  새 포장으로 추가
                </option>
                {inventory
                  .filter((i) => normalize(i.name) === normalize(initial.name))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · {amount(i)} · {dateText(i.expiry)}
                    </option>
                  ))}
              </select>
            </FormField>
          </>
        ) : null}
        <FormField label="재료 이름">
          <Input
            aria-label="재료 이름"
            required
            maxLength={80}
            value={lot.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="예: 달걀, 양파, 우유"
          />
        </FormField>
        <div className="form-row">
          <FormField label="남은 수량 (비우면 미상)">
            <Input
              aria-label="남은 수량"
              type="number"
              min="0"
              max="1000000"
              step="0.1"
              value={lot.quantity ?? ""}
              onChange={(e) =>
                set("quantity", e.target.value === "" ? null : +e.target.value)
              }
            />
          </FormField>
          <FormField label="단위">
            <select
              aria-label="단위"
              value={lot.unit}
              onChange={(e) => set("unit", e.target.value as Lot["unit"])}
            >
              {["개", "g", "ml", "팩"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="form-row">
          <FormField label="보관 위치">
            <select
              aria-label="보관 위치"
              value={lot.place}
              onChange={(e) => set("place", e.target.value as Lot["place"])}
            >
              {["냉장", "냉동", "실온"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </FormField>
          <FormField label="구매일">
            <Input
              aria-label="구매일"
              type="date"
              value={lot.purchasedAt}
              onInput={(e) => set("purchasedAt", e.currentTarget.value)}
              onChange={(e) => set("purchasedAt", e.target.value)}
            />
          </FormField>
        </div>
        <div className="form-row">
          <FormField label="기한 종류">
            <select
              aria-label="기한 종류"
              value={lot.dateType}
              onChange={(e) => set("dateType", e.target.value)}
            >
              {["미상", "소비기한", "유통기한", "품질유지기한"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </FormField>
          <FormField label="표기된 날짜">
            <Input
              aria-label="표기된 날짜"
              type="date"
              value={lot.expiry ?? ""}
              onInput={(e) => set("expiry", e.currentTarget.value || null)}
              onChange={(e) => set("expiry", e.target.value || null)}
            />
          </FormField>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={lot.opened}
            onChange={(e) => set("opened", e.target.checked)}
          />
          이미 개봉한 재료예요
        </label>
        <details>
          <summary>제품 영양 라벨 입력·확인</summary>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hasLabel}
              onChange={(e) => {
                setHasLabel(e.target.checked);
                if (!lot.label)
                  set("label", { ...emptyNutrients(), per: 100, unit: "g" });
              }}
            />
            실제 라벨을 확인했어요
          </label>
          {hasLabel && lot.label ? (
            <div className="label-nutrients">
              <div className="form-row">
                <FormField label="기준량">
                  <Input
                    aria-label="라벨 기준량"
                    type="number"
                    min="1"
                    value={lot.label.per}
                    onChange={(e) =>
                      set("label", { ...lot.label!, per: +e.target.value })
                    }
                  />
                </FormField>
                <FormField label="기준 단위">
                  <select
                    aria-label="라벨 기준 단위"
                    value={lot.label.unit}
                    onChange={(e) =>
                      set("label", {
                        ...lot.label!,
                        unit: e.target.value as "g" | "ml",
                      })
                    }
                  >
                    <option>g</option>
                    <option>ml</option>
                  </select>
                </FormField>
              </div>
              {(Object.keys(nutrientNames) as (keyof Nutrients)[]).map((k) => (
                <FormField
                  key={k}
                  label={nutrientNames[k] + (k === "kcal" ? " (kcal)" : " (g)")}
                >
                  <Input
                    aria-label={`${nutrientNames[k]} 라벨`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={lot.label?.[k] ?? ""}
                    onChange={(e) =>
                      set("label", {
                        ...lot.label!,
                        [k]: e.target.value === "" ? null : +e.target.value,
                      })
                    }
                  />
                </FormField>
              ))}
            </div>
          ) : null}
        </details>
        {review?.photo.kind === "purchase" ? (
          <label className="checkbox-label">
            <input
              type="checkbox"
              required
              checked={received}
              onChange={(e) => setReceived(e.target.checked)}
            />
            실제로 수령한 재료예요
          </label>
        ) : null}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" data-icon="inline-start" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          재료 저장
        </Button>
      </FieldGroup>
    </form>
  );
}
export function ProfileForm({
  profile,
  busy,
  onSave,
}: {
  profile: Profile;
  busy: boolean;
  onSave: (p: Profile) => Promise<void>;
}) {
  const [p, setP] = useState(profile),
    [csv, setCsv] = useState({
      likes: profile.likes.join(", "),
      allergies: profile.allergies.join(", "),
      excluded: profile.excluded.join(", "),
      equipment: profile.equipment.join(", "),
    });
  return (
    <form
      className="surface profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          ...p,
          onboarded: true,
          ...Object.fromEntries(
            Object.entries(csv).map(([k, v]) => [
              k,
              v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            ]),
          ),
        });
      }}
    >
      <h2>나의 식탁 설정</h2>
      <p className="muted">쉼표로 여러 항목을 입력할 수 있어요.</p>
      <FieldGroup>
        {(
          [
            {
              key: "allergies",
              label: "알레르기",
              placeholder: "예: 우유, 달걀, 땅콩",
            },
            {
              key: "excluded",
              label: "먹지 않는 식품",
              placeholder: "예: 돼지고기, 고수",
            },
            {
              key: "likes",
              label: "좋아하는 음식·맛",
              placeholder: "예: 한식, 담백한 맛, 버섯",
            },
            {
              key: "equipment",
              label: "보유 조리기구",
              placeholder: "예: 프라이팬, 냄비, 전자레인지",
            },
          ] as const
        ).map((f) => (
          <FormField key={f.key} label={f.label}>
            <Input
              aria-label={f.label}
              value={csv[f.key]}
              placeholder={f.placeholder}
              onChange={(e) =>
                setCsv((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          </FormField>
        ))}
        <div className="form-row">
          <FormField label="매운맛">
            <select
              aria-label="매운맛"
              value={p.spice}
              onChange={(e) => setP({ ...p, spice: e.target.value })}
            >
              {["안 맵게", "보통", "매콤하게"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </FormField>
          <FormField label="기본 인분">
            <Input
              aria-label="기본 인분"
              type="number"
              min="1"
              max="8"
              value={p.servings}
              onChange={(e) => setP({ ...p, servings: +e.target.value })}
            />
          </FormField>
        </div>
        <h3>
          영양 목표 <span className="small muted">선택 사항</span>
        </h3>
        <FormField label="목표 기준">
          <select
            aria-label="목표 기준"
            value={p.goalType}
            onChange={(e) =>
              setP({ ...p, goalType: e.target.value as Profile["goalType"] })
            }
          >
            <option value="daily">하루 목표</option>
            <option value="meal">한 끼 목표</option>
          </select>
        </FormField>
        {p.goalType === "daily" ? (
          <FormField label="한 끼 배분 (%)">
            <Input
              aria-label="한 끼 배분"
              type="number"
              min="5"
              max="100"
              step="0.1"
              value={Math.round(p.mealShare * 1000) / 10}
              onChange={(e) => setP({ ...p, mealShare: +e.target.value / 100 })}
            />
          </FormField>
        ) : null}
        <div className="form-row nutrient-form">
          {(Object.keys(nutrientNames) as (keyof Nutrients)[]).map((k) => (
            <FormField
              key={k}
              label={nutrientNames[k] + (k === "kcal" ? " (kcal)" : " (g)")}
            >
              <Input
                aria-label={`${nutrientNames[k]} 목표`}
                type="number"
                min="0"
                step="0.1"
                value={p.goals[k] ?? ""}
                placeholder="미설정"
                onChange={(e) =>
                  setP({
                    ...p,
                    goals: {
                      ...p.goals,
                      [k]: e.target.value === "" ? null : +e.target.value,
                    },
                  })
                }
              />
            </FormField>
          ))}
        </div>
        <p className="small muted">
          목표를 입력하지 않아도 추천받을 수 있어요. 기록하지 않은 식사는 계산에
          포함하지 않아요.
        </p>
        <Button type="submit" size="lg" disabled={busy}>
          <Check data-icon="inline-start" />
          취향과 목표 저장
        </Button>
      </FieldGroup>
    </form>
  );
}
export function RecipeDetail({
  recipe: r,
  state,
  busy,
  onShopping,
  onComplete,
}: {
  recipe: Recipe;
  state: State;
  busy: boolean;
  onShopping: () => Promise<void>;
  onComplete: (
    e: Evaluation,
    used: { lotId: string; quantity: number }[],
    id: string,
  ) => Promise<void>;
}) {
  const [cooking, setCooking] = useState(false),
    [used, setUsed] = useState<Record<string, string>>({}),
    [timerEnd, setTimerEnd] = useState<number | null>(null),
    [remaining, setRemaining] = useState(0),
    [done, setDone] = useState<number[]>([]),
    [evaluation, setEvaluation] = useState<Evaluation>({
      rating: 4,
      taste: "좋았어요",
      portion: "적당해요",
      difficulty: "예상과 비슷해요",
      actualMinutes: r.totalMinutes,
      again: true,
      note: "",
    });
  const completionId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (timerEnd === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setTimerEnd(null);
        toast.success("타이머가 끝났어요!");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerEnd]);
  const related = state.inventory.filter(
    (l) =>
      r.ingredients.some((i) => normalize(i.name) === normalize(l.name)) &&
      l.quantity !== 0,
  );
  return (
    <div className="recipe-detail">
      <RecipeMeta r={r} />
      <p>{r.difficultyReason}</p>
      <Notice>{r.reason}</Notice>
      <h3>
        준비할 재료 <small>{r.servings}인분 전체 분량</small>
      </h3>
      <div className="ingredient-lines">
        {r.ingredients.map((i, n) => (
          <div key={n}>
            <span>{i.name}</span>
            <strong>{amount(i)}</strong>
          </div>
        ))}
      </div>
      <p className="small muted">필요한 도구: {r.equipment.join(", ")}</p>
      {!!r.substitutions?.length && (
        <Notice>
          <strong>보유 재료 대체안</strong>
          {r.substitutions.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
          <p className="small">
            아래 영양 정보와 사용량은 표시된 원래 레시피 기준이에요.
          </p>
        </Notice>
      )}
      {r.missing?.length ? (
        <>
          <Notice>
            부족한 재료:{" "}
            {r.missing.map((i) => `${i.name} ${amount(i)}`).join(", ")}
          </Notice>
          <Button
            variant="outline"
            onClick={() => void onShopping()}
            disabled={busy}
          >
            <ShoppingCart data-icon="inline-start" />
            부족 재료 담기
          </Button>
        </>
      ) : null}
      <h3>1인분 예상 영양</h3>
      <Nutrition recipe={r} />
      {!r.nutrition?.complete ? (
        <p className="small muted">
          확인하지 못한 재료나 중량이 있어 일부 영양 수치를 표시할 수 없어요.
        </p>
      ) : null}
      <details>
        <summary>영양 정보 출처</summary>
        <p>{r.nutrition?.sources.join(" · ") || "확인된 데이터가 없어요."}</p>
        {r.nutrition?.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </details>
      <div className="section-heading">
        <h3>차근차근 요리하기</h3>
        {timerEnd !== null ? (
          <Button variant="outline" onClick={() => setTimerEnd(null)}>
            <Clock data-icon="inline-start" />
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")} 취소
          </Button>
        ) : null}
      </div>
      {r.steps.map((s, i) => (
        <div className={done.includes(i) ? "step completed" : "step"} key={i}>
          <button
            className="step-index"
            onClick={() =>
              setDone((d) =>
                d.includes(i) ? d.filter((x) => x !== i) : [...d, i],
              )
            }
            aria-label={`${i + 1}단계 ${done.includes(i) ? "완료 취소" : "완료"}`}
          >
            {done.includes(i) ? <Check /> : i + 1}
          </button>
          <div>
            <p>{s.text}</p>
            {s.minutes > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTimerEnd(Date.now() + s.minutes * 60000)}
              >
                <Clock data-icon="inline-start" />
                {s.minutes}분 타이머
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {!cooking ? (
        <Button size="lg" onClick={() => setCooking(true)}>
          요리 완료·사용량 확인 <ArrowRight data-icon="inline-end" />
        </Button>
      ) : (
        <form
          className="completion-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onComplete(
              evaluation,
              Object.entries(used)
                .filter(([, q]) => q !== "" && +q > 0)
                .map(([lotId, q]) => ({ lotId, quantity: +q })),
              completionId.current,
            );
          }}
        >
          <h3>실제로 사용한 만큼만</h3>
          <p className="small muted">
            아래 사용량만 재고에서 차감해요. 기록하지 않은 재료는 그대로
            유지돼요.
          </p>
          <FieldGroup>
            {related.map((l) => (
              <FormField
                key={l.id}
                label={`${l.name} · ${dateText(l.expiry)} · 보유 ${amount(l)}`}
              >
                <Input
                  aria-label={`${l.name} 사용량`}
                  type="number"
                  min="0"
                  max={l.quantity ?? 0}
                  step="0.1"
                  placeholder={
                    l.quantity === null
                      ? "수량을 먼저 확인해 주세요"
                      : "사용량 (비우면 차감 안 함)"
                  }
                  disabled={l.quantity === null}
                  value={used[l.id] ?? ""}
                  onChange={(e) =>
                    setUsed((v) => ({ ...v, [l.id]: e.target.value }))
                  }
                />
              </FormField>
            ))}
            <h3>오늘의 한 끼는 어땠나요?</h3>
            <FormField label="별점">
              <select
                aria-label="별점"
                value={evaluation.rating}
                onChange={(e) =>
                  setEvaluation({ ...evaluation, rating: +e.target.value })
                }
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n}점)
                  </option>
                ))}
              </select>
            </FormField>
            {(
              [
                {
                  key: "taste",
                  label: "맛",
                  options: [
                    "좋았어요",
                    "싱거웠어요",
                    "짰어요",
                    "너무 매웠어요",
                    "아쉬웠어요",
                  ],
                },
                {
                  key: "portion",
                  label: "양",
                  options: ["적당해요", "부족해요", "많아요"],
                },
                {
                  key: "difficulty",
                  label: "난이도",
                  options: ["예상과 비슷해요", "더 쉬웠어요", "더 어려웠어요"],
                },
              ] as const
            ).map((f) => (
              <FormField key={f.key} label={f.label}>
                <select
                  aria-label={f.label}
                  value={evaluation[f.key]}
                  onChange={(e) =>
                    setEvaluation({ ...evaluation, [f.key]: e.target.value })
                  }
                >
                  {f.options.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </FormField>
            ))}
            <FormField label="실제 소요 시간 (분)">
              <Input
                aria-label="실제 소요 시간"
                required
                type="number"
                min="1"
                max="1440"
                value={evaluation.actualMinutes}
                onChange={(e) =>
                  setEvaluation({
                    ...evaluation,
                    actualMinutes: +e.target.value,
                  })
                }
              />
            </FormField>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={evaluation.again}
                onChange={(e) =>
                  setEvaluation({ ...evaluation, again: e.target.checked })
                }
              />
              다시 먹고 싶어요
            </label>
            <FormField label="다음 추천에 참고할 메모">
              <Textarea
                maxLength={2000}
                value={evaluation.note}
                onChange={(e) =>
                  setEvaluation({ ...evaluation, note: e.target.value })
                }
                placeholder="예: 다음에는 덜 맵게 먹고 싶어요."
              />
            </FormField>
            <Button size="lg" type="submit" disabled={busy}>
              <Check data-icon="inline-start" />
              재고 차감·평가 저장
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
