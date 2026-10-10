"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "quiet" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-[3.5rem] items-center justify-center gap-2 rounded-full px-7 text-lg font-semibold transition active:scale-[0.98] disabled:opacity-50",
        variant === "primary" && "bg-moss-700 text-moss-50 shadow-lg shadow-moss-900/20 hover:bg-moss-800",
        variant === "ghost" && "border-2 border-moss-700/20 text-moss-800 hover:bg-moss-100",
        variant === "quiet" && "text-bark-600 underline-offset-4 hover:underline",
        className
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-4xl bg-white/80 p-6 shadow-sm ring-1 ring-bark-200/60", className)}>{children}</div>;
}

export function Pill({ children, tone = "moss" }: { children: ReactNode; tone?: "moss" | "sky" | "ember" | "bark" }) {
  const tones = {
    moss: "bg-moss-100 text-moss-800",
    sky: "bg-sky-100 text-sky-700",
    ember: "bg-ember-400/20 text-ember-600",
    bark: "bg-bark-100 text-bark-700"
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium", tones[tone])}>{children}</span>;
}

const NAV = [
  { href: "/", label: "Today", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/journal", label: "Journal", icon: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zm0 13a3 3 0 0 1 3-3h11" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" }
];

export function Shell({ children, hideNav = false }: { children: ReactNode; hideNav?: boolean }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-28 pt-8">
      {children}
      {!hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-around rounded-full bg-moss-900/95 px-2 py-2 text-moss-100 shadow-xl backdrop-blur">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    "flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-xs font-medium transition",
                    active ? "bg-moss-700 text-white" : "text-moss-200 hover:text-white"
                  )}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                    <path d={n.icon} />
                  </svg>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export function Ring({ value, max, children }: { value: number; max: number; children?: ReactNode }) {
  const r = 88;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / Math.max(1, max));
  const over = value >= max;
  return (
    <div className="relative mx-auto h-56 w-56">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="14" className="stroke-bark-100" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cx("transition-all duration-700", over ? "stroke-ember-500" : "stroke-moss-500")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Stamp({ title, date, pass = true }: { title: string; date: string; pass?: boolean }) {
  return (
    <div className="animate-stamp mx-auto w-60 rotate-[-6deg]">
      <svg viewBox="0 0 240 240" className="w-full drop-shadow-sm">
        <circle cx="120" cy="120" r="108" fill="none" strokeWidth="6" className={pass ? "stroke-moss-600" : "stroke-bark-400"} strokeDasharray="4 6" />
        <circle cx="120" cy="120" r="92" fill="none" strokeWidth="3" className={pass ? "stroke-moss-600" : "stroke-bark-400"} />
        <path d="M120 64 l18 30 h-11 l16 26 h-14 l14 24 h-46 l14 -24 h-14 l16 -26 h-11 z" className={pass ? "fill-moss-600" : "fill-bark-400"} />
        <text x="120" y="172" textAnchor="middle" className={cx("font-sans text-[15px] font-bold uppercase tracking-[0.2em]", pass ? "fill-moss-700" : "fill-bark-500")}>
          {pass ? "Touched grass" : "Self-checked"}
        </text>
        <text x="120" y="192" textAnchor="middle" className="fill-bark-500 font-sans text-[11px]">
          {date}
        </text>
      </svg>
      <p className="mt-2 text-center font-display text-xl text-moss-900">{title}</p>
    </div>
  );
}
