import { Check } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** 进入视口一次即触发（触发后即断开）；SSR 初始 false，客户端 IntersectionObserver 揭示。 */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, inView };
}

/** 装饰性外框；demo 内下拉/弹层走 portal，不受此定位影响。 */
function DemoFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute -inset-3.5 -z-10">
        <div className="absolute inset-0 rounded-[1.75rem_0.5rem] border border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent" />
        <div className="absolute -right-6 -top-8 size-44 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <div className="rounded-xl border bg-card p-4 sm:p-5">{children}</div>
    </div>
  );
}

export interface FeatureRowProps {
  index: string;
  name: string;
  snippet: string;
  title: string;
  description: string;
  bullets: string[];
  reverse?: boolean;
  children: ReactNode;
}

export function FeatureRow(props: FeatureRowProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "grid items-center gap-8 transition-all duration-700 ease-out lg:grid-cols-2 lg:gap-14",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        inView ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className={cn("space-y-4", props.reverse && "lg:order-2")}>
        <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="text-primary">{props.index}</span>
          <span className="text-border">/</span>
          {props.name}
        </span>
        <h3 className="text-2xl font-normal">{props.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{props.description}</p>
        <ul className="space-y-2 pt-1">
          {props.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">{bullet}</span>
            </li>
          ))}
        </ul>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs leading-relaxed text-muted-foreground">
          <code>{props.snippet}</code>
        </pre>
      </div>
      <div className={cn("min-w-0", props.reverse && "lg:order-1")}>
        <DemoFrame>{props.children}</DemoFrame>
      </div>
    </div>
  );
}

function CodePanel({ label, code }: { label: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full border" />
        <span className="size-2.5 rounded-full border" />
        <span className="size-2.5 rounded-full border" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">{label}</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export interface UsageRowProps {
  title: string;
  description: string;
  bullets: string[];
  label: string;
  code: string;
  reverse?: boolean;
}

export function UsageRow(props: UsageRowProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "grid items-center gap-8 transition-all duration-700 ease-out lg:grid-cols-2 lg:gap-14",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        inView ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className={cn("space-y-4", props.reverse && "lg:order-2")}>
        <h3 className="text-xl font-semibold">{props.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{props.description}</p>
        <ul className="space-y-2 pt-1">
          {props.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("min-w-0", props.reverse && "lg:order-1")}>
        <CodePanel label={props.label} code={props.code} />
      </div>
    </div>
  );
}
