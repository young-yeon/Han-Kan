"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  House,
  Refrigerator,
  ShoppingCart,
  ChartNoAxesColumn,
  Camera,
  Plus,
  Leaf,
  Clock,
  Users,
  Sparkles,
  ArrowRight,
  History,
  RotateCcw,
  Search,
  Check,
  LoaderCircle,
  Trash2,
  UserRound,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import {
  newState,
  normalize,
  seoulDate,
  type State,
  type Lot,
  type Recipe,
  type Observation,
  type PhotoAnalysis,
  type ShoppingItem,
  type Nutrients,
} from "@/lib/domain";
import { PhotoPicker } from "./photo-picker";
import { BrandMark } from "./brand-mark";
import { LotForm, ProfileForm, RecipeDetail, type Review } from "./chef-forms";
import {
  api,
  errorMessage,
  newLot,
  dateText,
  amount,
  nutrientNames,
  RecipeCard,
  Blank,
  AgentRoles,
  Notice,
} from "./chef-ui";
type Tab = "today" | "fridge" | "shopping" | "profile";
type Job = {
  id: string;
  kind: string;
  phase: string;
  error?: string | null;
  summary?: string;
  agents?: { role: string; summary: string }[];
};
type Data = {
  state: State;
  version: number;
  jobs: Job[];
  config: { ai: boolean; nutrition: boolean };
};
const nav = [
  { id: "today" as Tab, label: "오늘의 메뉴", icon: House },
  { id: "fridge" as Tab, label: "내 냉장고", icon: Refrigerator },
  { id: "shopping" as Tab, label: "장보기", icon: ShoppingCart },
  { id: "profile" as Tab, label: "취향·기록", icon: ChartNoAxesColumn },
];
export default function ChefApp({ displayName }: { displayName: string }) {
  const [data, setData] = useState<Data>({
    state: newState(),
    version: 0,
    jobs: [],
    config: { ai: false, nutrition: false },
  });
  const [tab, setTab] = useState<Tab>("today"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState<Job | null>(null);
  const [modal, setModal] = useState<
      "photo" | "lot" | "history" | "recipe" | null
    >(null),
    [lot, setLot] = useState<Lot | null>(null),
    [recipe, setRecipe] = useState<Recipe | null>(null),
    [review, setReview] = useState<Review>(null),
    [shopping, setShopping] = useState<ShoppingItem | null>(null);
  const [servings, setServings] = useState(1),
    [minutes, setMinutes] = useState(30),
    [search, setSearch] = useState(""),
    [place, setPlace] = useState("전체");
  const running = useRef(false),
    mounted = useRef(true),
    hydrated = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const d = await api();
      setData(d);
      setError("");
      if (!hydrated.current) {
        setServings(d.state.profile.servings);
        hydrated.current = true;
      }
      return d as Data;
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  const runJob = useCallback(
    async (initial: Job) => {
      if (running.current) return;
      running.current = true;
      setJob(initial);
      try {
        let j = initial;
        while (mounted.current && !["완료", "실패"].includes(j.phase)) {
          const result = await api({
            action: "advance",
            jobId: j.id,
            requestId: crypto.randomUUID(),
          });
          j = result.job;
          setJob(j);
          if (!["완료", "실패"].includes(j.phase))
            await new Promise((r) => setTimeout(r, 1200));
        }
        await refresh();
        if (j.phase === "실패") toast.error(j.error ?? "분석하지 못했어요.");
        else {
          toast.success(
            j.kind === "photo"
              ? "사진 분석이 끝났어요. 확인할 항목을 살펴보세요."
              : "한 끼 제안이 준비됐어요.",
          );
          if (j.kind === "photo") setTab("fridge");
        }
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        running.current = false;
      }
    },
    [refresh],
  );
  useEffect(() => {
    mounted.current = true;
    refresh()
      .then((d) => {
        const active = d.jobs.find((j) => !["완료", "실패"].includes(j.phase));
        if (active) void runJob(active);
      })
      .catch(() => {});
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [refresh, runJob]);
  async function mutate(
    action: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ) {
    const result = await api({
      action,
      ...payload,
      version: data.version,
      requestId: requestId ?? crypto.randomUUID(),
    });
    setData((d) => ({ ...d, state: result.state, version: result.version }));
  }
  async function act(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await mutate(action, payload);
      toast.success("저장했어요.");
    } catch (e) {
      toast.error(errorMessage(e));
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function openLot(value?: Lot, from?: ShoppingItem) {
    setLot(value ?? newLot(from?.name));
    setShopping(from ?? null);
    setReview(null);
    setModal("lot");
  }
  function openReview(photo: PhotoAnalysis, o: Observation) {
    const current = data.state.inventory.find((l) => l.id === o.matchedLotId);
    setLot(
      current ?? {
        ...newLot(o.name),
        quantity: o.quantity,
        unit: o.unit,
        place: o.place,
        expiry: o.expiry,
        dateType: o.dateType,
        label: o.label,
        opened: !o.sealed,
      },
    );
    setReview({ photo, observation: o });
    setShopping(null);
    setModal("lot");
  }
  async function recommend() {
    setBusy(true);
    try {
      const r = await api({
        action: "recommend",
        servings,
        minutes,
        requestId: crypto.randomUUID(),
      });
      void runJob(r.job);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const state = data.state,
    activeJob = !!job && !["완료", "실패"].includes(job.phase),
    pending = state.photos.flatMap((p) =>
      p.observations
        .filter((o) => o.status === "review")
        .map((o) => ({ photo: p, observation: o })),
    ),
    urgent = state.inventory
      .filter((l) => l.quantity !== 0 && l.expiry)
      .sort((a, b) => a.expiry!.localeCompare(b.expiry!))
      .slice(0, 4),
    visibleLots = state.inventory.filter(
      (l) =>
        l.quantity !== 0 &&
        (place === "전체" || l.place === place) &&
        normalize(l.name).includes(normalize(search)),
    );
  const title = {
    today: "오늘, 한칸에서 뭐 먹을까요?",
    fridge: "우리 집 재료를 한눈에",
    shopping: "필요한 만큼만, 장보기",
    profile: "한칸이 알아가는 나의 취향",
  }[tab];
  return (
    <div className="app-shell">
      <Toaster richColors position="top-center" />
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("today");
          }}
        >
          <BrandMark />
          <span>한칸</span>
        </a>
        <nav aria-label="주 메뉴">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "nav-link selected" : "nav-link"}
              onClick={() => setTab(n.id)}
              aria-current={tab === n.id ? "page" : undefined}
            >
              <n.icon />
              <span>{n.label}</span>
              {n.id === "fridge" && pending.length > 0 ? (
                <span className="nav-count">{pending.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf />
          <p>
            있는 재료로,
            <br />
            근사한 한 끼.
          </p>
        </div>
        <a
          href="/signout-with-chatgpt?return_to=/"
          target="_top"
          className="sign-out"
        >
          <LogOut />
          로그아웃
        </a>
      </aside>
      <main className="main-wrap">
        <header className="mobile-brand">
          <BrandMark />
          <strong>한칸</strong>
        </header>
        <header className="page-header">
          <div>
            <h1>{title}</h1>
            <p>
              {
                {
                  today: "있는 재료로, 근사한 한 끼.",
                  fridge: "사진으로 채우고, 요리하면서 가볍게 비워요.",
                  shopping: "보유 재료부터 활용하고, 부족한 재료만 준비해요.",
                  profile: "취향과 한 끼의 기록이 더 좋은 추천으로 이어져요.",
                }[tab]
              }
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTab("profile")}
            aria-label={`${displayName}의 취향 설정`}
          >
            <UserRound data-icon="inline-start" />
          </Button>
        </header>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                onClick={() => void refresh().catch(() => {})}
              >
                다시 불러오기
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <div className="loading-view">
            <LoaderCircle className="spin" />
            <p>냉장고를 열고 있어요.</p>
          </div>
        ) : (
          <>
            {activeJob ? (
              <div className="job-status" role="status">
                <LoaderCircle className="spin" />
                <div>
                  <strong>{job.phase}</strong>
                  <p>
                    한칸이 함께 살펴보고 있어요. 새로고침해도 이어서 진행돼요.
                  </p>
                </div>
              </div>
            ) : null}
            {job?.phase === "실패" ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {job.error}
                  <Button
                    variant="outline"
                    onClick={() =>
                      job.kind === "photo"
                        ? setModal("photo")
                        : void recommend()
                    }
                    disabled={busy}
                  >
                    다시 시도
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {tab === "today" ? (
              <div className="dashboard">
                <div className="primary-column">
                  <section className="capture-panel">
                    <div>
                      <h2>냉장고를 보여주세요</h2>
                      <p>
                        냉장고 속 재료를 사진으로 찍어 올리면
                        <br className="desktop-break" /> 확인 가능한 정보를
                        자동으로 정리해요.
                      </p>
                      <Button size="lg" onClick={() => setModal("photo")}>
                        <Camera data-icon="inline-start" />
                        내 냉장고 보여주기
                      </Button>
                    </div>
                    <img
                      src="/vegetables.png"
                      alt="양상추, 버섯, 양파와 토마토"
                    />
                  </section>
                  <section className="recommendations">
                    <div className="section-heading">
                      <h2>오늘의 한칸</h2>
                      <div className="meal-controls">
                        <label>
                          <Users />
                          <select
                            aria-label="인분"
                            value={servings}
                            onChange={(e) => setServings(+e.target.value)}
                          >
                            {[1, 2, 3, 4, 6, 8].map((n) => (
                              <option key={n} value={n}>
                                {n}인분
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <Clock />
                          <select
                            aria-label="가능한 조리 시간"
                            value={minutes}
                            onChange={(e) => setMinutes(+e.target.value)}
                          >
                            {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                              <option key={n} value={n}>
                                {n}분
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          onClick={() => void recommend()}
                          disabled={activeJob || busy}
                        >
                          <Sparkles data-icon="inline-start" />
                          {state.recommendations.length
                            ? "다시 추천"
                            : "추천받기"}
                        </Button>
                      </div>
                    </div>
                    {!state.profile.onboarded ? (
                      <Notice>
                        <button
                          className="text-link"
                          onClick={() => setTab("profile")}
                        >
                          알레르기와 취향을 먼저 알려주세요 <ArrowRight />
                        </button>
                      </Notice>
                    ) : null}
                    {state.recommendations.length ? (
                      <div className="recipe-list">
                        {state.recommendations.map((r, i) => (
                          <RecipeCard
                            key={r.id}
                            recipe={r}
                            index={i}
                            onOpen={() => {
                              setRecipe(r);
                              setModal("recipe");
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <section className="first-meal">
                        <Blank
                          title="첫 번째 메뉴를 함께 골라볼까요?"
                          description={
                            job?.phase === "완료" && job.kind === "recommend"
                              ? (job.summary ??
                                "조건에 맞는 메뉴가 없어요. 시간이나 재료를 조정해 주세요.")
                              : "내 재료와 취향을 아는 한칸이 식사를 준비해요."
                          }
                        >
                          <Button onClick={() => openLot()}>
                            재료 등록하기
                          </Button>
                        </Blank>
                        <AgentRoles />
                      </section>
                    )}
                    {job?.phase === "완료" && job.agents?.length ? (
                      <details className="agent-results">
                        <summary>한칸의 검토 결과</summary>
                        {job.agents.map((a) => (
                          <p key={a.role}>
                            <strong>{a.role}</strong> {a.summary}
                          </p>
                        ))}
                      </details>
                    ) : null}
                  </section>
                </div>
                <aside className="right-rail">
                  <section className="rail-panel">
                    <h3>먼저 먹으면 좋아요</h3>
                    {urgent.length ? (
                      urgent.map((l) => (
                        <button
                          className="urgent-row"
                          key={l.id}
                          onClick={() => openLot(l)}
                        >
                          <span className="ingredient-icon">
                            <Leaf />
                          </span>
                          <span>
                            <strong>{l.name}</strong>
                            <small>{amount(l)}</small>
                          </span>
                          <span
                            className={
                              l.expiry! < seoulDate()
                                ? "date-expired"
                                : "date-near"
                            }
                          >
                            {l.expiry! < seoulDate()
                              ? "기한 경과"
                              : l.expiry!.slice(5).replace("-", "/")}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="rail-empty">
                        <Leaf />
                        <p>
                          등록된 기한이 없어요.
                          <br />
                          재료의 날짜를 알려주면
                          <br />
                          먼저 먹기 좋은 순서로 정리할게요.
                        </p>
                      </div>
                    )}
                  </section>
                  <section className="rail-panel">
                    <h3>나의 영양 목표</h3>
                    <p className="small muted">
                      {state.profile.goalType === "daily"
                        ? "하루 목표 중 한 끼 배분"
                        : "한 끼 목표"}{" "}
                      · 실제 섭취량과 별개예요
                    </p>
                    {(Object.keys(nutrientNames) as (keyof Nutrients)[]).map(
                      (k) => (
                        <div className="target-row" key={k}>
                          <span>{nutrientNames[k]}</span>
                          <strong>
                            {state.profile.goals[k] !== null
                              ? Math.round(
                                  state.profile.goals[k]! *
                                    (state.profile.goalType === "daily"
                                      ? state.profile.mealShare
                                      : 1),
                                ) + (k === "kcal" ? " kcal" : " g")
                              : "—"}
                          </strong>
                          <div className="target-line" />
                        </div>
                      ),
                    )}
                    <button
                      className="text-link"
                      onClick={() => setTab("profile")}
                    >
                      목표 설정 <ChevronRight />
                    </button>
                  </section>
                </aside>
              </div>
            ) : null}
            {tab === "fridge" ? (
              <section>
                <div className="toolbar">
                  <div className="search-field">
                    <Search />
                    <input
                      aria-label="재료 검색"
                      placeholder="어떤 재료를 찾으세요?"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="보관 위치 필터"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                  >
                    {["전체", "냉장", "냉동", "실온"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <Button variant="outline" onClick={() => setModal("history")}>
                    <History data-icon="inline-start" />
                    변경 내역
                  </Button>
                  <Button variant="outline" onClick={() => openLot()}>
                    <Plus data-icon="inline-start" />
                    직접 추가
                  </Button>
                  <Button onClick={() => setModal("photo")}>
                    <Camera data-icon="inline-start" />
                    사진 추가
                  </Button>
                </div>
                {pending.length ? (
                  <section className="review-panel">
                    <h3>
                      확인하면 더 정확해져요{" "}
                      <Badge variant="secondary">{pending.length}</Badge>
                    </h3>
                    <p>
                      확실한 정보는 이미 반영했어요. 아래 항목만 확인해 주세요.
                    </p>
                    {pending.map(({ photo, observation: o }) => (
                      <div className="review-row" key={o.id}>
                        <div>
                          <strong>{o.name}</strong>
                          <p>{o.reviewReason}</p>
                          {o.packageCapacity ? (
                            <small>포장 표기: {o.packageCapacity}</small>
                          ) : null}
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => openReview(photo, o)}
                        >
                          확인
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`${o.name} 인식 제외`}
                          onClick={() =>
                            void act("photo-confirm", {
                              photoId: photo.id,
                              observationId: o.id,
                              dismiss: true,
                            })
                          }
                        >
                          제외
                        </Button>
                      </div>
                    ))}
                  </section>
                ) : null}
                <div className="inventory-heading">
                  <h2>
                    보유 재료{" "}
                    <span>
                      {state.inventory.filter((l) => l.quantity !== 0).length}
                    </span>
                  </h2>
                  <span className="small muted">
                    포장별로 수량과 기한을 관리해요
                  </span>
                </div>
                {visibleLots.length ? (
                  <div className="inventory-grid">
                    {visibleLots.map((l) => (
                      <button
                        className="ingredient-card"
                        key={l.id}
                        onClick={() => openLot(l)}
                      >
                        <div className="ingredient-top">
                          <span className="ingredient-icon">
                            <Leaf />
                          </span>
                          <Badge variant="outline">{l.place}</Badge>
                        </div>
                        <h3>{l.name}</h3>
                        <strong className="quantity">{amount(l)}</strong>
                        <p
                          className={
                            l.expiry && l.expiry < seoulDate()
                              ? "date-expired"
                              : ""
                          }
                        >
                          {l.dateType === "미상" ? "기한" : l.dateType}{" "}
                          {dateText(l.expiry)}
                        </p>
                        <small>
                          {l.opened ? "개봉함" : "미개봉 / 확인 전"}
                          <ChevronRight />
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="surface">
                    <Blank
                      title={
                        search
                          ? "찾는 재료가 없어요"
                          : "아직 냉장고가 비어 있어요"
                      }
                      description="사진을 찍거나 재료를 직접 등록해 보세요."
                    >
                      <Button onClick={() => openLot()}>
                        <Plus data-icon="inline-start" />첫 재료 등록
                      </Button>
                    </Blank>
                  </div>
                )}
                {state.photos.length ? (
                  <details className="agent-results">
                    <summary>최근 사진 분석 {state.photos.length}건</summary>
                    {state.photos.slice(0, 10).map((p) => (
                      <div key={p.id}>
                        <strong>
                          {new Date(p.at).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })}
                        </strong>
                        <p>{p.summary}</p>
                        <p>
                          자동 반영{" "}
                          {
                            p.observations.filter((o) => o.status === "auto")
                              .length
                          }{" "}
                          · 확인 필요{" "}
                          {
                            p.observations.filter((o) => o.status === "review")
                              .length
                          }{" "}
                          · 확인 완료{" "}
                          {
                            p.observations.filter(
                              (o) => o.status === "confirmed",
                            ).length
                          }
                        </p>
                      </div>
                    ))}
                  </details>
                ) : null}
              </section>
            ) : null}
            {tab === "shopping" ? (
              <section className="surface shopping-surface">
                <div className="section-heading">
                  <h2>장보기 목록</h2>
                  <span>
                    {state.shopping.filter((x) => !x.received).length}개 남음
                  </span>
                </div>
                {state.shopping.length ? (
                  state.shopping.map((i) => (
                    <div className="shopping-row" key={i.id}>
                      <span className="ingredient-icon">
                        {i.received ? <Check /> : <ShoppingCart />}
                      </span>
                      <div>
                        <h3>{i.name}</h3>
                        <p>
                          {amount(i)} · {i.recipeName}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={i.received}
                        onClick={() =>
                          openLot(
                            {
                              ...newLot(i.name),
                              quantity: i.quantity,
                              unit: i.unit,
                            },
                            i,
                          )
                        }
                      >
                        {i.received ? "재고 등록됨" : "구매 완료·등록"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${i.name} 목록 삭제`}
                        onClick={() =>
                          void act("shopping-remove", { shoppingId: i.id })
                        }
                      >
                        <Trash2 data-icon="inline-start" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <Blank
                    title="지금은 살 재료가 없어요"
                    description="추천 메뉴에서 ‘부족 재료 담기’를 누르면 필요한 만큼 정리해 드려요."
                  >
                    <Button variant="outline" onClick={() => setTab("today")}>
                      메뉴 보러 가기 <ArrowRight data-icon="inline-end" />
                    </Button>
                  </Blank>
                )}
              </section>
            ) : null}
            {tab === "profile" ? (
              <div className="profile-layout">
                <ProfileForm
                  profile={state.profile}
                  onSave={(p) => act("profile", { profile: p })}
                  busy={busy}
                />
                <div>
                  <section className="rail-panel">
                    <h3>연결 상태</h3>
                    <p className="connection-row">
                      <span>사진 분석·메뉴 추천</span>
                      <Badge variant={data.config.ai ? "secondary" : "outline"}>
                        {data.config.ai ? "연결됨" : "미연동"}
                      </Badge>
                    </p>
                    <p className="connection-row">
                      <span>공공 영양 데이터</span>
                      <Badge
                        variant={
                          data.config.nutrition ? "secondary" : "outline"
                        }
                      >
                        {data.config.nutrition ? "연결됨" : "미연동"}
                      </Badge>
                    </p>
                    <p className="small muted">
                      확인된 영양 정보가 없으면 수치를 만들지 않고 미상으로
                      표시해요.
                    </p>
                  </section>
                  <section className="rail-panel meal-history">
                    <h3>나의 요리 기록</h3>
                    {state.meals.length ? (
                      state.meals.map((m) => (
                        <article key={m.id}>
                          <strong>{m.recipe.name}</strong>
                          <p>
                            {"★".repeat(m.evaluation.rating)} · 실제{" "}
                            {m.evaluation.actualMinutes}분
                          </p>
                          <small>
                            {new Date(m.at).toLocaleDateString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })}{" "}
                            ·{" "}
                            {m.evaluation.again
                              ? "다시 먹고 싶어요"
                              : "다른 메뉴를 원해요"}
                          </small>
                          {m.evaluation.note ? (
                            <p>{m.evaluation.note}</p>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="muted">
                        요리를 마치고 남긴 평가가
                        <br />
                        다음 추천의 힌트가 돼요.
                      </p>
                    )}
                  </section>
                </div>
              </div>
            ) : null}
          </>
        )}
        <footer className="page-footer">
          <Leaf />
          <span>한칸 · 있는 재료로, 근사한 한 끼.</span>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="모바일 메뉴">
        {nav.map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? "selected" : ""}
            onClick={() => setTab(n.id)}
          >
            <n.icon />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="chef-dialog">
          <DialogHeader>
            <DialogTitle>
              {
                {
                  photo: "사진으로 재료 추가",
                  lot: review ? "인식한 재료 확인" : "재료 등록·수정",
                  history: "재고 변경 내역",
                  recipe: recipe?.name ?? "레시피",
                }[modal ?? "photo"]
              }
            </DialogTitle>
            <DialogDescription>
              {
                {
                  photo:
                    "확실한 정보만 자동 반영하고, 애매한 항목은 확인받아요.",
                  lot: "같은 재료라도 포장과 기한이 다르면 따로 등록해 주세요.",
                  history:
                    "이후 변경이 없는 항목은 이전 상태로 되돌릴 수 있어요.",
                  recipe: "재료를 확인하고 나만의 속도로 요리해 보세요.",
                }[modal ?? "photo"]
              }
            </DialogDescription>
          </DialogHeader>
          {modal === "photo" ? (
            <PhotoPicker
              busy={busy || activeJob}
              enabled={data.config.ai}
              onSubmit={async (form) => {
                setBusy(true);
                try {
                  const result = await api(form);
                  setModal(null);
                  void runJob(result.job);
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
          {modal === "lot" && lot ? (
            <LotForm
              key={lot.id + (review?.observation.id ?? "")}
              initial={lot}
              inventory={state.inventory}
              review={review}
              busy={busy}
              onSave={async (value, received) => {
                setBusy(true);
                try {
                  await mutate(review ? "photo-confirm" : "lot", {
                    lot: value,
                    photoId: review?.photo.id,
                    observationId: review?.observation.id,
                    received,
                    shoppingId: shopping?.id,
                  });
                  setModal(null);
                  toast.success("재료를 저장했어요.");
                } catch (e) {
                  toast.error(errorMessage(e));
                  await refresh().catch(() => {});
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
          {modal === "history" ? (
            <div>
              {state.changes.length ? (
                state.changes.slice(0, 60).map((c) => (
                  <div className="change-row" key={c.id}>
                    <div>
                      <strong>{c.after?.name ?? c.before?.name}</strong>
                      <p>
                        {c.before ? amount(c.before) : "새 재료"} →{" "}
                        {c.after ? amount(c.after) : "삭제"}
                      </p>
                      <small>
                        {c.reason} ·{" "}
                        {c.after?.expiry
                          ? dateText(c.after.expiry)
                          : "기한 미상"}{" "}
                        ·{" "}
                        {new Date(c.at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                        })}
                      </small>
                    </div>
                    <Button
                      variant="outline"
                      disabled={c.undone || busy}
                      onClick={() => void act("undo", { changeId: c.id })}
                    >
                      <RotateCcw data-icon="inline-start" />
                      {c.undone ? "취소됨" : "되돌리기"}
                    </Button>
                  </div>
                ))
              ) : (
                <p>아직 변경 내역이 없어요.</p>
              )}
            </div>
          ) : null}
          {modal === "recipe" && recipe ? (
            <RecipeDetail
              recipe={recipe}
              state={state}
              busy={busy}
              onShopping={() => act("shopping", { recipeId: recipe.id })}
              onComplete={async (evaluation, used, id) => {
                setBusy(true);
                try {
                  await mutate(
                    "cook",
                    { recipeId: recipe.id, evaluation, used },
                    id,
                  );
                  setModal(null);
                  toast.success("잘 먹었습니다! 다음 추천에 반영할게요.");
                } catch (e) {
                  toast.error(errorMessage(e));
                  await refresh().catch(() => {});
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
