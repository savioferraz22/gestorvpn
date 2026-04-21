import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { AdminTab } from "../../../types";
import { Sidebar, type SidebarBadges } from "./Sidebar";

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  tab: AdminTab;
  onNavigate: (id: AdminTab) => void;
  onLogout: () => void;
  badges: SidebarBadges;
};

export function MobileDrawer({
  open,
  onClose,
  tab,
  onNavigate,
  onLogout,
  badges,
}: MobileDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-y-0 left-0 z-50 w-[260px] md:hidden"
          >
            <div className="relative h-full">
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-bg-surface-hover text-text-muted hover:text-text-base"
                aria-label="Fechar menu"
              >
                <X size={16} />
              </button>
              <Sidebar
                tab={tab}
                onNavigate={(id) => {
                  onNavigate(id);
                  onClose();
                }}
                onLogout={() => {
                  onClose();
                  onLogout();
                }}
                badges={badges}
                className="h-full w-full"
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
