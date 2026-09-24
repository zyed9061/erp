"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, MotionConfig, useInView, useReducedMotion, type HTMLMotionProps, type Variants } from "framer-motion";
import { useLocale } from "@/i18n/client";
import { formatMontant } from "@/lib/format";
import { INTL_LOCALE } from "@/i18n/config";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Shared enter/exit animation for dropdown menus. */
export const menuMotion = {
  initial: { opacity: 0, y: -6, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.97 },
  transition: { duration: 0.16, ease: EASE },
};

/** Respects the OS "reduce motion" setting for every animation below. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and lifts its content in, on mount or (with `inView`) when scrolled into view. */
export function FadeIn({
  delay = 0,
  y = 12,
  inView = false,
  className,
  children,
  ...rest
}: {
  delay?: number;
  y?: number;
  inView?: boolean;
} & HTMLMotionProps<"div">) {
  const target = { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: EASE } };
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      {...(inView
        ? { whileInView: target, viewport: { once: true, margin: "-80px" } }
        : { animate: target })}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Container whose `StaggerItem` children animate in one after another. */
export function Stagger({
  inView = false,
  className,
  children,
  ...rest
}: { inView?: boolean } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once: true, margin: "-80px" } } : { animate: "show" })}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={staggerItem} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/** Card that lifts slightly on hover and presses on tap. */
export function HoverLift({ className, children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Counts up from 0 to `value` once visible, formatted as an amount (TND) or a plain integer. */
export function CountUp({ value, format = "number" }: { value: number; format?: "number" | "currency" }) {
  const { locale } = useLocale();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!inView || reduceMotion) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (latest) => setCurrent(latest),
    });
    return () => controls.stop();
  }, [inView, value, reduceMotion]);

  const shown = reduceMotion ? value : current;
  const text =
    format === "currency"
      ? formatMontant(shown, "TND", locale)
      : Math.round(shown).toLocaleString(INTL_LOCALE[locale]);

  return (
    <span ref={ref} className="tabular-nums">
      {text}
    </span>
  );
}

/** Shakes its content once on mount, for inline error messages. */
export function Shake({ className, children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, x: [0, -8, 8, -5, 5, 0] }}
      transition={{ duration: 0.45 }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
