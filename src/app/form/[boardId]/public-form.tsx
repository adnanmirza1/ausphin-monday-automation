"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { StatusLabel } from "@/lib/constants";
import { submitForm, type SubmitState } from "@/app/actions/form";

export type FormField = {
  id: string;
  name: string;
  type: string;
  labels: StatusLabel[];
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
  title,
  desc,
  fields,
}: {
  boardId: string;
  title: string;
  desc: string;
  fields: FormField[];
}) {
  const action = submitForm.bind(null, boardId);
  const [state, formAction, pending] = useActionState<SubmitState | null, FormData>(
    action,
    null
  );

  if (state?.ok) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-2xl border border-hair bg-white p-8 text-center shadow-soft">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-grass/10 text-2xl">
            ✓
          </div>
          <h1 className="mt-3 text-xl font-bold text-ink">Submitted</h1>
          <p className="mt-1 text-sm text-muted">{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        {/* Header band */}
        <div className="rounded-t-2xl bg-rail px-6 py-5 text-white">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/50">
            Oswin · Intake Form
          </p>
          <h1 className="mt-1 text-xl font-bold">{title}</h1>
          {desc && <p className="mt-1 text-sm text-white/60">{desc}</p>}
        </div>

        <form
          action={formAction}
          className="flex flex-col gap-4 rounded-b-2xl border border-t-0 border-hair bg-white p-6 shadow-soft"
        >
          <Field label="Name" required>
            <input name="__name" required className={inp} placeholder="Your full name" />
          </Field>

          {fields.map((f) => (
            <Field key={f.id} label={f.name}>
              {f.type === "status" ? (
                <select name={f.id} defaultValue="" className={inp}>
                  <option value="">—</option>
                  {f.labels.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              ) : f.type === "signature" ? (
                <SignatureField name={f.id} />
              ) : HTML_TYPE[f.type] === "textarea" ? (
                <textarea name={f.id} rows={3} className={inp} />
              ) : (
                <input name={f.id} type={HTML_TYPE[f.type] ?? "text"} className={inp} />
              )}
            </Field>
          ))}

          {state?.error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
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
