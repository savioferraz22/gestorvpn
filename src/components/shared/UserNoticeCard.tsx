import React, { useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, AlertOctagon, Info, Trash2 } from "lucide-react";
import type { SystemNoticeSeverity, UserNotification } from "../../services/api";

// Notificação direcionada (admin → este cliente): fica na área do cliente
// até ele clicar em "Excluir". Visual espelha o SystemNoticeBanner.

const SEVERITY_STYLES: Record<SystemNoticeSeverity, {
  bg: string;
  border: string;
  iconBg: string;
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
    title: "text-sky-900",
    body: "text-sky-800",
    pill: "bg-sky-200 text-sky-900",
    Icon: Info,
    label: "Informação",
  },
};

function formatWhen(dateString: string) {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface Props {
  notification: UserNotification;
  onDelete: (id: string) => Promise<void> | void;
  key?: React.Key | null;
}

export function UserNoticeCard({ notification, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);

  const styles = SEVERITY_STYLES[notification.severity] || SEVERITY_STYLES.info;
  const { Icon } = styles;
  const title = (notification.title || "").trim();
  const message = (notification.message || "").trim();
  if (!title && !message) return null;

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(notification.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className={`${styles.bg} border ${styles.border} rounded-2xl p-4 flex items-start gap-3 shadow-sm`}
    >
      <div className={`w-10 h-10 ${styles.iconBg} rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-[14px] font-bold ${styles.title} tracking-tight`}>
            {title || styles.label}
          </h3>
          <span className={`${styles.pill} text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter`}>
            Mensagem para você
          </span>
        </div>
        {message && (
          <p className={`text-[12px] ${styles.body} leading-relaxed font-medium mt-1 whitespace-pre-line`}>
            {message}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className={`text-[10px] ${styles.body} opacity-70 font-medium`}>
            {formatWhen(notification.created_at)}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className={`inline-flex items-center gap-1 text-[11px] font-bold ${styles.title} bg-white/60 hover:bg-white/90 border ${styles.border} rounded-md px-2 py-1 transition-colors active:scale-[0.97] disabled:opacity-50`}
          >
            <Trash2 className="w-3 h-3" />
            {deleting ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
