import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle } from "lucide-react";

interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export function AlertDialog({ isOpen, title, message, onClose }: AlertDialogProps) {
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
          <div className="w-12 h-12 bg-primary-100/50 text-primary-600 rounded-full flex items-center justify-center mb-4 border border-primary-200">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-text-base mb-2">{title}</h3>
          <p className="text-sm text-text-muted mb-6 whitespace-pre-wrap">{message}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm active:scale-95"
          >
            Entendi
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
