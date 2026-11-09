"use client";
import type { ReactNode } from "react";
import {
  ChefHat,
  Heart,
  ShoppingCart,
  Utensils,
  Leaf,
  ArrowRight,
  Clock,
  Flame,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  seoulDate,
  type Lot,
  type Recipe,
  type Nutrients,
  type State,
} from "@/lib/domain";
export const nutrientNames: Record<keyof Nutrients, string> = {
  kcal: "에너지",
  protein: "단백질",
  carbs: "탄수화물",
  fat: "지방",
};
export const amount = (lot: { quantity: number | null; unit: string }) =>
  lot.quantity === null
    ? "수량 미상"
    : `${lot.quantity.toLocaleString()}${lot.unit}`;
export const dateText = (d: string | null) =>
  d ? d.replaceAll("-", ". ") : "기한 미상";
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "다시 시도해 주세요.";
export async function api(body?: unknown) {
  const r = await fetch(
    "/api/chef",
    body
      ? {
          method: "POST",
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = (await r.json()) as {
    error?: string;
    state: State;
    version: number;
    config: { ai: boolean; nutrition: boolean };
    jobs: {
      id: string;
      kind: string;
      phase: string;
      error?: string;
      summary?: string;
    }[];
    job: {
      id: string;
      kind: string;
      phase: string;
      error?: string;
      summary?: string;
    };
  };
  if (!r.ok) throw Error(data.error ?? "연결하지 못했어요.");
  return data;
}
export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </Field>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <Leaf />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function Blank({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <Utensils className="empty-icon" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  );
}
export function newLot(name = ""): Lot {
  return {
    id: crypto.randomUUID(),
    name,
    quantity: null,
    unit: "개",
    place: "냉장",
    expiry: null,
    dateType: "미상",
    opened: false,
    purchasedAt: seoulDate(),
    observedAt: null,
    version: 0,
    label: null,
  };
}
export function AgentRoles() {
  return (
    <div className="agent-roles">
      {[
        {
          icon: ChefHat,
          title: "레시피 개발자",
          text: "보유 재료로 가능한 메뉴를 제안해요.",
        },
        {
          icon: Heart,
          title: "영양 분석가",
          text: "한 끼의 영양과 분량을 살펴요.",
        },
        {
          icon: ShoppingCart,
          title: "장보기 담당",
          text: "대체 재료와 부족분을 정리해요.",
        },
      ].map((a) => (
        <div key={a.title}>
          <a.icon />
          <span>
            <strong>{a.title}</strong>
            <p>{a.text}</p>
          </span>
        </div>
      ))}
    </div>
  );
}
export function Nutrition({ recipe: r }: { recipe: Recipe }) {
  return (
    <div className="nutrition-chips">
      {(Object.keys(nutrientNames) as (keyof Nutrients)[]).map((k) => (
        <span key={k}>
          {nutrientNames[k]}{" "}
          <strong>
            {r.nutrition?.[k] ?? "—"}
            {r.nutrition?.[k] != null ? (k === "kcal" ? " kcal" : " g") : ""}
          </strong>
        </span>
      ))}
    </div>
  );
}
export function RecipeMeta({ r }: { r: Recipe }) {
  return (
    <div className="recipe-meta">
      <span>
        <Clock />
        {r.totalMinutes}분 <small>직접 {r.activeMinutes}분</small>
      </span>
      <span>
        <Flame />
        {r.difficulty}
      </span>
      <span>
        <Users />
        {r.servings}인분
      </span>
    </div>
  );
}
export function RecipeCard({
  recipe: r,
  index,
  onOpen,
}: {
  recipe: Recipe;
  index: number;
  onOpen: () => void;
}) {
  return (
    <article
      className={index === 0 ? "recipe-card main-recipe" : "recipe-card"}
    >
      <div className="recipe-heading">
        <span className="recipe-number">0{index + 1}</span>
        <Badge variant="secondary">
          {index === 0 ? "오늘의 추천" : "다른 한 끼"}
        </Badge>
      </div>
      <h3>{r.name}</h3>
      <p>{r.description}</p>
      <RecipeMeta r={r} />
      <Nutrition recipe={r} />
      <p className="recipe-reason">
        <Leaf />
        {r.reason}
      </p>
      <div className="recipe-bottom">
        <span className="small">
          {r.missing?.length
            ? `부족 재료 ${r.missing.length}개`
            : "보유 재료로 준비 가능"}
        </span>
        <Button variant={index === 0 ? "default" : "outline"} onClick={onOpen}>
          레시피 보기 <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </article>
  );
}
