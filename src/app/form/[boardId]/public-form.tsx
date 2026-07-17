"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { StatusLabel } from "@/lib/constants";
import type { FormAppearance } from "@/lib/board-types";
import { submitForm, submitFormById, type SubmitState } from "@/app/actions/form";

export type FormField = {
  id: string;
  name: string;
  type: string;
  labels: StatusLabel[];
};

const FONT_STACK: Record<string, string> = {
  sans: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
};

const HTML_TYPE: Record<string, string> = {
  email: "email",
  phone: "tel",
  number: "number",
  date: "date",
  text: "text",
  longtext: "textarea",
};

export function PublicForm({
  boardId,
  formId,
  title,
  desc,
  fields,
  appearance,
}: {
  boardId: string;
  formId?: string;
  title: string;
  desc: string;
  fields: FormField[];
  appearance?: FormAppearance;
}) {
  const action = formId ? submitFormById.bind(null, formId) : submitForm.bind(null, boardId);
  const [state, formAction, pending] = useActionState<SubmitState | null, FormData>(
    action,
    null
  );

  const ap = appearance ?? {};
  const radius = ap.radius ?? 16;
  const pageStyle: React.CSSProperties = {
    background: ap.bg || undefined,
    fontFamily: ap.font ? FONT_STACK[ap.font] : undefined,
  };
  const inputStyle: React.CSSProperties = { borderRadius: Math.max(6, radius - 6) };
  const btnStyle: React.CSSProperties = { background: ap.button || undefined, borderRadius: Math.max(6, radius - 6) };

  if (state?.ok) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6" style={pageStyle}>
        <div className="w-full max-w-md border border-hair bg-white p-8 text-center shadow-soft" style={{ borderRadius: radius }}>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-grass/10 text-2xl">✓</div>
          <h1 className="mt-3 text-xl font-bold text-ink">Submitted</h1>
          <p className="mt-1 text-sm text-muted">{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-10" style={pageStyle}>
      <div className="mx-auto w-full max-w-lg">
        {/* Header band */}
        <div
          className="bg-rail px-6 py-5 text-white"
          style={{
            background: ap.brand || undefined,
            color: ap.text || undefined,
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
          }}
        >
          {ap.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ap.logo} alt="logo" className="mb-2 h-8 max-w-[160px] object-contain" />
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-widest opacity-60">Oswin · Intake Form</p>
          )}
          <h1 className="mt-1 text-xl font-bold">{title}</h1>
          {desc && <p className="mt-1 text-sm opacity-70">{desc}</p>}
        </div>

        <form
          action={formAction}
          className="flex flex-col gap-4 border border-t-0 border-hair bg-white p-6 shadow-soft"
          style={{ borderBottomLeftRadius: radius, borderBottomRightRadius: radius }}
        >
          <Field label="Name" required>
            <input name="__name" required className={inp} style={inputStyle} placeholder="Your full name" />
          </Field>

          {fields.map((f) => (
            <Field key={f.id} label={f.name}>
              {f.type === "status" ? (
                <select name={f.id} defaultValue="" className={inp} style={inputStyle}>
                  <option value="">—</option>
                  {f.labels.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              ) : f.type === "signature" ? (
                <SignatureField name={f.id} />
              ) : HTML_TYPE[f.type] === "textarea" ? (
                <textarea name={f.id} rows={3} className={inp} style={inputStyle} />
              ) : (
                <input name={f.id} type={HTML_TYPE[f.type] ?? "text"} className={inp} style={inputStyle} />
              )}
            </Field>
          ))}

          {state?.error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            style={btnStyle}
          >
            {pending ? "Submitting…" : "Submit"}
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-muted">Powered by Oswin Work OS</p>
      </div>
    </div>
  );
}

function SignatureField({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#141b26";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pt(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvasRef.current!.width / r.width),
      y: (e.clientY - r.top) * (canvasRef.current!.height / r.height),
    };
  }
  function down(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pt(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pt(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setValue("");
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <canvas
        ref={canvasRef}
        width={440}
        height={140}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-lg border border-hair bg-white"
        style={{ cursor: "crosshair" }}
      />
      <button
        type="button"
        onClick={clear}
        className="mt-1 text-xs text-muted hover:text-danger"
      >
        Clear signature
      </button>
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-teal";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-body">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}
