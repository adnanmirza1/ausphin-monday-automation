import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-rail text-white p-12">
        <div className="font-mono text-xs tracking-widest text-white/50 uppercase">
          Oswin / Osphine
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            The company's
            <br />
            <span className="text-teal">work operating system.</span>
          </h1>
          <p className="mt-4 text-white/60 max-w-sm">
            Boards, workflows, documents, finance and reporting — every
            department, one system.
          </p>
        </div>
        <div className="flex gap-2">
          {["#5B7A99", "#C67A1E", "#E2B93B", "#0B7A6F", "#2E9C63"].map((c) => (
            <span
              key={c}
              className="h-2 w-10 rounded-full"
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-8 bg-canvas">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-muted">
            Welcome back. Use your company email to continue.
          </p>

          <LoginForm />

          <div className="mt-6 rounded-lg border border-hair bg-white p-3 text-xs text-muted">
            <span className="font-semibold text-body">Demo login</span> —{" "}
            adnan.mustafa@toptal.com / password
          </div>
        </div>
      </div>
    </div>
  );
}
