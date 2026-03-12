import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-bg-surface rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col items-center text-center"
        >
          <div className="w-12 h-12 bg-amber-100/50 text-amber-600 rounded-full flex items-center justify-center mb-4 border border-amber-200">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-text-base mb-2">{title}</h3>
          <p className="text-sm text-text-muted mb-6">{message}</p>
          <div className="flex gap-3 w-full">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-text-base bg-bg-surface-hover hover:bg-bg-base border border-border-base transition-colors active:scale-95"
            >
              Cancelar
            </button>
            <button
              onClick={() => { onConfirm(); onCancel(); }}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm active:scale-95"
            >
              Confirmar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
