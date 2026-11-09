"use client";
import { useState, useRef, useEffect } from "react";
import {
  Camera,
  Upload,
  Trash2,
  ScanLine,
  Crop,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { toast } from "sonner";
import { FormField, Notice, errorMessage } from "./chef-ui";
async function fingerprint(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, 9, 8).data;
  let binary = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const p = (y * 9 + x) * 4,
        q = p + 4;
      binary +=
        pixels[p] + pixels[p + 1] + pixels[p + 2] >
        pixels[q] + pixels[q + 1] + pixels[q + 2]
          ? "1"
          : "0";
    }
  return Array.from({ length: 16 }, (_, i) =>
    parseInt(binary.slice(i * 4, i * 4 + 4), 2).toString(16),
  ).join("");
}
export function PhotoPicker({
  onSubmit,
  busy,
  enabled,
}: {
  onSubmit: (form: FormData) => Promise<void>;
  busy: boolean;
  enabled: boolean;
}) {
  const [kind, setKind] = useState("fridge"),
    [received, setReceived] = useState(false),
    [photos, setPhotos] = useState<{ file: File; url: string }[]>([]),
    [crop, setCrop] = useState<number | null>(null),
    [bounds, setBounds] = useState({ x: 0, y: 0, w: 100, h: 100 }),
    [processing, setProcessing] = useState(false);
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    urls = useRef<string[]>([]);
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);
  async function add(files: FileList | null) {
    if (!files) return;
    setProcessing(true);
    try {
      const next: { file: File; url: string }[] = [];
      for (const f of Array.from(files).slice(0, 4 - photos.length)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.type))
          throw Error(
            "JPG·PNG·WebP 사진을 선택해 주세요. HEIC는 JPG로 변환해 주세요.",
          );
        if (f.size > 20 * 1024 * 1024)
          throw Error("사진 원본은 20MB 이하로 선택해 주세요.");
        const bitmap = await createImageBitmap(f);
        const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas
          .getContext("2d")!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(Error("사진을 변환하지 못했어요.")),
            "image/jpeg",
            0.9,
          ),
        );
        const file = new File([blob], f.name.replace(/\.[^.]+$/, ".jpg"), {
          type: "image/jpeg",
        });
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        next.push({ file, url });
      }
      setPhotos((p) => [...p, ...next]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProcessing(false);
    }
  }
  async function applyCrop() {
    if (crop === null) return;
    try {
      const source = photos[crop],
        bitmap = await createImageBitmap(source.file),
        canvas = document.createElement("canvas");
      canvas.width = Math.round((bitmap.width * bounds.w) / 100);
      canvas.height = Math.round((bitmap.height * bounds.h) / 100);
      canvas
        .getContext("2d")!
        .drawImage(
          bitmap,
          (bitmap.width * bounds.x) / 100,
          (bitmap.height * bounds.y) / 100,
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      bitmap.close();
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9),
      );
      const file = new File([blob], source.file.name, { type: "image/jpeg" }),
        url = URL.createObjectURL(file);
      urls.current.push(url);
      setPhotos((p) => p.map((x, i) => (i === crop ? { file, url } : x)));
      setCrop(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <div>
      <FieldGroup>
        <FormField label="어떤 사진인가요?">
          <select
            aria-label="사진 종류"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="fridge">냉장고 전체 사진</option>
            <option value="ingredient">식재료·포장 사진</option>
            <option value="purchase">구매 페이지 캡처</option>
          </select>
        </FormField>
        <Notice>
          사진에 보이지 않는 재료는 삭제하지 않아요. 이름·수량·기한이 불명확하면
          확인을 요청해요. 분석 후 사진 원본은 삭제해요.
        </Notice>
        {!enabled ? (
          <Notice>
            사진 분석이 아직 연결되지 않았어요. 직접 재료 추가를 이용할 수
            있어요.
          </Notice>
        ) : null}
        <input
          ref={camera}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => void add(e.target.files)}
        />
        <input
          ref={gallery}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => void add(e.target.files)}
        />
        <div className="upload-zone">
          <ScanLine />
          <h3>냉장고의 지금을 담아주세요</h3>
          <p>한 번에 최대 4장 · JPG, PNG, WebP</p>
          <div className="button-row">
            <Button
              type="button"
              onClick={() => camera.current?.click()}
              disabled={processing || photos.length >= 4}
            >
              <Camera data-icon="inline-start" />
              사진 촬영
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => gallery.current?.click()}
              disabled={processing || photos.length >= 4}
            >
              <Upload data-icon="inline-start" />
              파일 선택
            </Button>
          </div>
        </div>
        <div className="photo-grid">
          {photos.map((p, i) => (
            <article key={p.url}>
              <img src={p.url} alt={`분석할 사진 ${i + 1}`} />
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCrop(i);
                    setBounds({ x: 0, y: 0, w: 100, h: 100 });
                  }}
                >
                  <Crop data-icon="inline-start" />
                  잘라내기
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${i + 1}번 사진 제거`}
                  onClick={() => setPhotos((v) => v.filter((_, n) => i !== n))}
                >
                  <Trash2 data-icon="inline-start" />
                </Button>
              </div>
            </article>
          ))}
        </div>
        {crop !== null ? (
          <section className="crop-editor">
            <h3>분석할 영역 선택</h3>
            <div className="crop-preview">
              <img src={photos[crop].url} alt="잘라낼 사진" />
              <div
                style={{
                  left: bounds.x + "%",
                  top: bounds.y + "%",
                  width: bounds.w + "%",
                  height: bounds.h + "%",
                }}
              />
            </div>
            {(["x", "y", "w", "h"] as const).map((k) => (
              <FormField
                key={k}
                label={
                  { x: "왼쪽 위치", y: "위쪽 위치", w: "너비", h: "높이" }[k]
                }
              >
                <input
                  aria-label={
                    { x: "왼쪽 위치", y: "위쪽 위치", w: "너비", h: "높이" }[k]
                  }
                  type="range"
                  min={k === "w" || k === "h" ? 10 : 0}
                  max={
                    k === "x"
                      ? 100 - bounds.w
                      : k === "y"
                        ? 100 - bounds.h
                        : k === "w"
                          ? 100 - bounds.x
                          : 100 - bounds.y
                  }
                  value={bounds[k]}
                  onChange={(e) =>
                    setBounds((b) => ({ ...b, [k]: +e.target.value }))
                  }
                />
              </FormField>
            ))}
            <Button onClick={() => void applyCrop()}>영역 적용</Button>
          </section>
        ) : null}
        {kind === "purchase" ? (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={received}
              onChange={(e) => setReceived(e.target.checked)}
            />
            이미 수령한 상품이에요 (미수령은 확인 대기)
          </label>
        ) : null}
        <Button
          size="lg"
          disabled={
            busy || processing || !enabled || !photos.length || crop !== null
          }
          onClick={async () => {
            const form = new FormData();
            form.set("requestId", requestId.current);
            form.set("kind", kind);
            form.set(
              "fingerprints",
              JSON.stringify(
                await Promise.all(photos.map((p) => fingerprint(p.file))),
              ),
            );
            form.set("received", String(received));
            photos.forEach((p) => form.append("photos", p.file));
            void onSubmit(form);
          }}
        >
          {busy || processing ? (
            <LoaderCircle className="spin" data-icon="inline-start" />
          ) : (
            <ScanLine data-icon="inline-start" />
          )}
          사진 분석하기
        </Button>
      </FieldGroup>
    </div>
  );
}
