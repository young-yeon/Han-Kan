import { env } from "cloudflare:workers";
import { newState, type State } from "./domain";
export function database() {
  if (!env.DB) throw Error("저장소가 아직 연결되지 않았어요.");
  return env.DB;
}
export async function readState(userId: string) {
  const db = database();
  await db
    .prepare(
      "INSERT OR IGNORE INTO chef_accounts (user_id,version,state,updated_at) VALUES (?,0,?,?)",
    )
    .bind(userId, JSON.stringify(newState()), new Date().toISOString())
    .run();
  const row = await db
    .prepare("SELECT version,state FROM chef_accounts WHERE user_id=?")
    .bind(userId)
    .first<{ version: number; state: string }>();
  if (!row) throw Error("저장소를 읽지 못했어요.");
  return { version: row.version, state: JSON.parse(row.state) as State };
}
export async function mutate(
  userId: string,
  requestId: string,
  action: (state: State) => void,
  expectedVersion?: number,
) {
  const db = database();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { version, state } = await readState(userId);
    if (state.requests.includes(requestId)) return { version, state };
    const receipt = await db
      .prepare("SELECT id FROM chef_receipts WHERE user_id=? AND id=?")
      .bind(userId, requestId)
      .first();
    if (receipt) return { version, state };
    if (expectedVersion !== undefined && expectedVersion !== version)
      throw Error("다른 변경이 있어요. 새로고침 후 다시 확인해 주세요.");
    action(state);
    state.requests.push(requestId);
    state.requests = state.requests.slice(-200);
    const now = new Date().toISOString();
    const results = await db.batch([
      db
        .prepare(
          "UPDATE chef_accounts SET state=?,version=version+1,updated_at=? WHERE user_id=? AND version=?",
        )
        .bind(JSON.stringify(state), now, userId, version),
      db
        .prepare(
          "INSERT OR IGNORE INTO chef_receipts (user_id,id,at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM chef_accounts WHERE user_id=? AND version=? AND json_extract(state,'$.requests[#-1]')=?)",
        )
        .bind(userId, requestId, now, userId, version + 1, requestId),
    ]);
    if (results[0].meta.changes === 1) return { state, version: version + 1 };
  }
  throw Error("동시에 수정 중이에요. 잠시 후 다시 시도해 주세요.");
}
export type Job = {
  id: string;
  user_id: string;
  kind: "photo" | "recommend";
  phase: string;
  data: string;
  error: string | null;
  lease: string | null;
  lease_until: number;
  created_at: string;
  updated_at: string;
};
export async function getJob(userId: string, id: string) {
  return database()
    .prepare("SELECT * FROM chef_jobs WHERE user_id=? AND id=?")
    .bind(userId, id)
    .first<Job>();
}
export async function recentJobs(userId: string) {
  const r = await database()
    .prepare(
      "SELECT * FROM chef_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 12",
    )
    .bind(userId)
    .all<Job>();
  return r.results;
}
export async function createJob(
  userId: string,
  id: string,
  kind: Job["kind"],
  data: unknown,
) {
  const existing = await getJob(userId, id);
  if (existing) return existing;
  const active = await database()
    .prepare(
      "SELECT COUNT(*) AS n FROM chef_jobs WHERE user_id=? AND created_at>? ",
    )
    .bind(userId, new Date(Date.now() - 3600000).toISOString())
    .first<{ n: number }>();
  if ((active?.n ?? 0) >= 20)
    throw Error(
      "시간당 20회까지 분석할 수 있어요. 잠시 후 다시 시도해 주세요.",
    );
  const now = new Date().toISOString();
  await database()
    .prepare(
      "INSERT OR IGNORE INTO chef_jobs (id,user_id,kind,phase,data,lease_until,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)",
    )
    .bind(
      id,
      userId,
      kind,
      kind === "photo" ? "사진 확인 중" : "레시피 구성 중",
      JSON.stringify(data),
      now,
      now,
    )
    .run();
  const job = await getJob(userId, id);
  if (!job) throw Error("작업을 만들지 못했어요.");
  return job;
}
