import { z } from "zod";
const text = z.string().trim().max(300);
export const unit = z.enum(["g", "ml", "개", "팩"]);
const nutrient = z.number().finite().min(0).max(100000).nullable();
export const nutrients = z.object({
  kcal: nutrient,
  protein: nutrient,
  carbs: nutrient,
  fat: nutrient,
});
export const label = nutrients
  .extend({ per: z.number().positive().max(10000), unit: z.enum(["g", "ml"]) })
  .nullable();
export const lotSchema = z.object({
  id: z.string().min(1).max(100),
  name: text.min(1).max(80),
  quantity: z.number().finite().min(0).max(1000000).nullable(),
  unit,
  place: z.enum(["냉장", "냉동", "실온"]),
  expiry: z.string().nullable(),
  dateType: z.enum(["미상", "소비기한", "유통기한", "품질유지기한"]),
  opened: z.boolean(),
  purchasedAt: z.string().max(30),
  observedAt: z.string().nullable(),
  version: z.number().int().nonnegative(),
  label,
});
export const profileSchema = z.object({
  onboarded: z.boolean(),
  likes: z.array(text).max(30),
  allergies: z.array(text).max(30),
  excluded: z.array(text).max(30),
  equipment: z.array(text).max(30),
  spice: text,
  servings: z.number().int().min(1).max(8),
  goalType: z.enum(["daily", "meal"]),
  mealShare: z.number().min(0.05).max(1),
  goals: nutrients,
});
export const evaluationSchema = z.object({
  rating: z.number().int().min(1).max(5),
  taste: text,
  portion: text,
  difficulty: text,
  actualMinutes: z.number().int().min(1).max(1440),
  again: z.boolean(),
  note: z.string().max(2000),
});
export const ingredientSchema = z.object({
  name: text.min(1).max(80),
  quantity: z.number().finite().positive().max(100000),
  unit,
  grams: z.number().finite().positive().max(100000).nullable(),
  allergens: z.array(text).max(20),
});
export const recipeSchema = z.object({
  id: text.min(1),
  name: text.min(1),
  description: text,
  reason: text,
  difficulty: z.enum(["쉬움", "보통", "어려움"]),
  difficultyReason: text,
  totalMinutes: z.number().int().positive().max(1440),
  activeMinutes: z.number().int().positive().max(1440),
  servings: z.number().int().min(1).max(8),
  equipment: z.array(text).max(15),
  tags: z.array(text).max(15),
  ingredients: z.array(ingredientSchema).min(1).max(20),
  steps: z
    .array(
      z.object({
        text: z.string().min(1).max(1200),
        minutes: z.number().min(0).max(1440),
      }),
    )
    .min(1)
    .max(15),
});
export const observationSchema = z.object({
  id: text,
  name: text.min(1).max(80),
  nameEvidence: text,
  identityClear: z.boolean(),
  quantity: z.number().finite().min(0).max(1000000).nullable(),
  unit,
  quantityEvidence: text,
  wholeQuantityVisible: z.boolean(),
  sealed: z.boolean(),
  packageCapacity: text.nullable(),
  expiry: text.nullable(),
  dateType: z.enum(["미상", "소비기한", "유통기한", "품질유지기한"]),
  expiryEvidence: text,
  place: z.enum(["냉장", "냉동", "실온"]),
  matchedLotId: text.nullable(),
  matchEvidence: text,
  uncertain: z.array(text),
  label,
});
export const photoSchema = z.object({
  observations: z.array(observationSchema).max(80),
  summary: text,
});
export const recipeResultSchema = z.object({
  recipes: z.array(recipeSchema).max(3),
  summary: text,
});
export const reviewSchema = z.object({
  summary: text,
  needsRevision: z.boolean(),
  instructions: z.array(text).max(12),
  substitutions: z.array(z.object({ recipeId: text, text })).max(15),
});
export const verdictSchema = z.object({
  summary: text,
  verdicts: z
    .array(z.object({ recipeId: text, allowed: z.boolean(), reason: text }))
    .max(3),
});
// The Responses API strict schema mirrors the runtime parser; every property is required.
export function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const properties = Object.fromEntries(
      Object.entries(schema.shape).map(([k, v]) => [
        k,
        jsonSchema(v as z.ZodTypeAny),
      ]),
    );
    return {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  }
  if (schema instanceof z.ZodArray)
    return { type: "array", items: jsonSchema(schema.element) };
  if (schema instanceof z.ZodNullable)
    return { anyOf: [jsonSchema(schema.unwrap()), { type: "null" }] };
  if (schema instanceof z.ZodEnum)
    return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodNumber)
    return { type: schema.isInt ? "integer" : "number" };
  throw Error("Unsupported schema");
}
