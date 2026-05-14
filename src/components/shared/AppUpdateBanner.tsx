import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, Sparkles } from "lucide-react";

interface Props {
  visible: boolean;
  onReload: () => void;
}

export function AppUpdateBanner({ visible, onReload }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed left-1/2 -translate-x-1/2 z-[9999] bottom-20 md:bottom-6 max-w-[92vw]"
        >
          <button
            onClick={onReload}
            className="flex items-center gap-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl shadow-2xl shadow-primary-900/30 pl-3 pr-4 py-2.5 transition-colors active:scale-[0.98] border border-primary-500/60"
          >
            <div className="w-7 h-7 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-[12px] font-bold leading-tight">Nova versão disponível</p>
              <p className="text-[10.5px] text-white/80 leading-tight">Toque para atualizar agora</p>
            </div>
            <RefreshCw className="w-4 h-4 ml-1 shrink-0" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
