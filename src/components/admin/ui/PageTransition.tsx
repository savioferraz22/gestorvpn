import React, { useEffect, useState } from "react";
import { motion } from "motion/react";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export type PageTransitionProps = {
  pageKey: string;
  children: React.ReactNode;
  className?: string;
  key?: React.Key | null;
};

export function PageTransition({
  pageKey,
  children,
  className,
}: PageTransitionProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      key={pageKey}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default PageTransition;
