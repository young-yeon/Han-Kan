import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { config } from "@/lib/ai";
import { createJob, getJob, mutate, readState, recentJobs } from "@/lib/store";
import { publicJob, advanceJob } from "@/lib/jobs";
import {
  completeMeal,
  setLot,
  undoChange,
  missingIngredients,
  seoulDate,
  similarFingerprint,
  type Lot,
  type Recipe,
} from "@/lib/domain";
import { evaluationSchema, lotSchema, profileSchema } from "@/lib/validation";
import { z } from "zod";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return reply({ error: "로그인이 필요해요." }, 401);
    const id = new URL(request.url).searchParams.get("job");
    if (id) {
      const job = await getJob(user.userId, id);
      return job
        ? reply({ job: publicJob(job) })
        : reply({ error: "작업이 없어요." }, 404);
    }
    const [record, jobs] = await Promise.all([
      readState(user.userId),
      recentJobs(user.userId),
    ]);
    return reply({
      ...record,
      jobs: jobs.map(publicJob),
      config: config(),
      displayName: user.displayName,
    });
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : "불러오지 못했어요." },
      500,
    );
  }
}
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return reply({ error: "로그인이 필요해요." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return reply({ error: "허용되지 않은 요청이에요." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > 18 * 1024 * 1024)
      return reply({ error: "사진 용량을 줄여 주세요." }, 413);
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (!config().ai) throw Error("AI 키가 아직 연결되지 않았어요.");
      if (!env.BUCKET) throw Error("사진 저장소가 연결되지 않았어요.");
      const form = await request.formData();
      const id = z.string().uuid().parse(form.get("requestId"));
      const existing = await getJob(user.userId, id);
      if (existing) return reply({ job: publicJob(existing) });
      const kind = z
        .enum(["purchase", "ingredient", "fridge"])
        .parse(form.get("kind"));
      const received = form.get("received") === "true";
      const fingerprints = z
        .array(z.string().regex(/^[a-f0-9]{16}$/))
        .max(4)
        .parse(JSON.parse(String(form.get("fingerprints") ?? "[]")));
      const files = form
        .getAll("photos")
        .filter((x): x is File => typeof x !== "string");
      if (!files.length || files.length > 4)
        throw Error("사진은 한 번에 1~4장 올려 주세요.");
      if (files.reduce((s, f) => s + f.size, 0) > 16 * 1024 * 1024)
        throw Error("사진 묶음은 16MB 이하로 올려 주세요.");
      const keys: string[] = [],
        hashes: string[] = [];
      try {
        const state = (await readState(user.userId)).state;
        for (const file of files) {
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 5 * 1024 * 1024
          )
            throw Error("JPG·PNG·WebP 사진을 장당 5MB 이하로 올려 주세요.");
          const bytes = await file.arrayBuffer();
          const h = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          ]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
          if (
            hashes.includes(h) ||
            state.photos.some((p) => p.hashes.includes(h))
          )
            throw Error("같은 사진이 이미 등록되어 있어요.");
          hashes.push(h);
          const key = `photos/${user.userId}/${id}/${keys.length}`;
          await env.BUCKET.put(key, bytes, {
            httpMetadata: { contentType: file.type },
            customMetadata: {
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          });
          keys.push(key);
        }
        const similar = fingerprints.some((h) =>
          state.photos.some((p) =>
            (p.fingerprints ?? []).some((old) => similarFingerprint(h, old)),
          ),
        );
        const job = await createJob(user.userId, id, "photo", {
          kind,
          received,
          keys,
          hashes,
          fingerprints,
          similar,
        });
        return reply({ job: publicJob(job) });
      } catch (e) {
        await Promise.all(keys.map((k) => env.BUCKET!.delete(k)));
        throw e;
      }
    }
    const body = (await request.json()) as Record<string, unknown>;
    const action = z.string().parse(body.action);
    const requestId = z.string().uuid().parse(body.requestId);
    if (action === "advance") {
      return reply({
        job: await advanceJob(user.userId, z.string().parse(body.jobId)),
      });
    }
    if (action === "recommend") {
      if (!config().ai) throw Error("AI 키가 아직 연결되지 않았어요.");
      const servings = z.number().int().min(1).max(8).parse(body.servings);
      const minutes = z.number().int().min(5).max(180).parse(body.minutes);
      return reply({
        job: publicJob(
          await createJob(user.userId, requestId, "recommend", {
            servings,
            minutes,
          }),
        ),
      });
    }
    const expected = z.number().int().nonnegative().parse(body.version);
    const record = await mutate(
      user.userId,
      requestId,
      (state) => {
        if (action === "profile") {
          state.profile = profileSchema.parse(body.profile);
          return;
        }
        if (action === "lot") {
          const lot = lotSchema.parse(body.lot);
          setLot(state, lot, "직접 수정", lot.version);
          if (typeof body.shoppingId === "string") {
            const item = state.shopping.find((x) => x.id === body.shoppingId);
            if (item) item.received = true;
          }
          return;
        }
        if (action === "undo") {
          undoChange(state, z.string().parse(body.changeId));
          return;
        }
        if (action === "photo-confirm") {
          const photo = state.photos.find((x) => x.id === body.photoId);
          const observation = photo?.observations.find(
            (x) => x.id === body.observationId,
          );
          if (!photo || !observation) throw Error("분석 결과가 없어요.");
          if (["confirmed", "dismissed"].includes(observation.status ?? ""))
            return;
          if (body.dismiss === true) {
            observation.status = "dismissed";
            return;
          }
          if (photo.kind === "purchase" && body.received !== true)
            throw Error("실제로 수령한 재료만 등록할 수 있어요.");
          const lot = lotSchema.parse(body.lot);
          setLot(state, lot, "사진 확인 반영", lot.version);
          observation.status = "confirmed";
          observation.matchedLotId = lot.id;
          return;
        }
        if (action === "shopping") {
          const recipe = state.recommendations.find(
            (x) => x.id === body.recipeId,
          );
          if (!recipe) throw Error("메뉴가 바뀌었어요. 다시 선택해 주세요.");
          state.shopping = state.shopping.filter(
            (x) => x.recipeId !== recipe.id,
          );
          state.shopping.push(
            ...missingIngredients(recipe, state.inventory).map((i) => ({
              ...i,
              id: crypto.randomUUID(),
              recipeId: recipe.id,
              recipeName: recipe.name,
              received: false,
            })),
          );
          return;
        }
        if (action === "shopping-remove") {
          state.shopping = state.shopping.filter(
            (x) => x.id !== body.shoppingId,
          );
          return;
        }
        if (action === "cook") {
          const recipe =
            state.recommendations.find((x) => x.id === body.recipeId) ??
            state.meals.find((x) => x.recipe.id === body.recipeId)?.recipe;
          if (!recipe) throw Error("메뉴를 다시 선택해 주세요.");
          const evaluation = evaluationSchema.parse(body.evaluation);
          const used = z
            .array(
              z.object({
                lotId: z.string(),
                quantity: z.number().finite().min(0),
              }),
            )
            .max(100)
            .parse(body.used);
          completeMeal(state, {
            id: requestId,
            recipe: recipe as Recipe,
            evaluation,
            used,
            at: new Date().toISOString(),
          });
          return;
        }
        throw Error("지원하지 않는 작업이에요.");
      },
      expected,
    );
    return reply(record);
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? "입력 내용을 확인해 주세요."
        : e instanceof Error
          ? e.message
          : "저장하지 못했어요.";
    return reply({ error: message }, message.includes("다른 변경") ? 409 : 400);
  }
}
