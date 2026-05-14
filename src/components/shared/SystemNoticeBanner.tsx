import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, AlertOctagon, Info, ChevronDown } from "lucide-react";
import type { SystemNotice, SystemNoticeSeverity } from "../../services/api";

interface Props {
  notice: SystemNotice | null;
  variant: "full" | "compact";
}

const SEVERITY_STYLES: Record<SystemNoticeSeverity, {
  bg: string;
  border: string;
  iconBg: string;
  iconText: string;
  title: string;
  body: string;
  pill: string;
  Icon: typeof AlertTriangle;
  label: string;
}> = {
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconBg: "bg-amber-500",
    iconText: "text-white",
    title: "text-amber-900",
    body: "text-amber-800",
    pill: "bg-amber-200 text-amber-900",
    Icon: AlertTriangle,
    label: "Aviso",
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    iconBg: "bg-red-600",
    iconText: "text-white",
    title: "text-red-900",
    body: "text-red-800",
    pill: "bg-red-200 text-red-900",
    Icon: AlertOctagon,
    label: "Urgente",
  },
  info: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    iconBg: "bg-sky-600",
    iconText: "text-white",
    title: "text-sky-900",
    body: "text-sky-800",
    pill: "bg-sky-200 text-sky-900",
    Icon: Info,
    label: "Informação",
  },
};

export function SystemNoticeBanner({ notice, variant }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!notice || !notice.active) return null;
  const title = (notice.title || "").trim();
  const message = (notice.message || "").trim();
  if (!title && !message) return null;

  const styles = SEVERITY_STYLES[notice.severity] || SEVERITY_STYLES.warning;
  const { Icon } = styles;

  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${styles.bg} border-b ${styles.border} flex-shrink-0`}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 flex items-center gap-2 text-left"
        >
          <Icon className={`w-4 h-4 ${styles.title} shrink-0`} />
          <span className={`text-[12px] font-bold ${styles.title} shrink-0`}>{title || styles.label}</span>
          {message && (
            <span className={`text-[11px] ${styles.body} truncate flex-1`}>
              — {message}
            </span>
          )}
          {message && (
            <ChevronDown
              className={`w-3.5 h-3.5 ${styles.title} shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          )}
        </button>
        <AnimatePresence initial={false}>
          {expanded && message && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <p className={`px-4 pb-3 text-[12px] ${styles.body} whitespace-pre-line leading-relaxed`}>
                {message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${styles.bg} border ${styles.border} rounded-2xl p-4 flex items-start gap-3 shadow-sm`}
    >
      <div className={`w-10 h-10 ${styles.iconBg} rounded-2xl flex items-center justify-center ${styles.iconText} shrink-0 shadow-sm`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-[14px] font-bold ${styles.title} tracking-tight`}>
            {title || styles.label}
          </h3>
          <span className={`${styles.pill} text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter`}>
            {styles.label}
          </span>
        </div>
        {message && (
          <p className={`text-[12px] ${styles.body} leading-relaxed font-medium mt-1 whitespace-pre-line`}>
            {message}
          </p>
        )}
      </div>
    </motion.div>
  );
}
