import React from "react";

export type CardProps = {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  elevated?: boolean;
  as?: React.ElementType;
  onClick?: (e: React.MouseEvent) => void;
  key?: React.Key | null;
};

const PADDING_MAP: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export function Card({
  children,
  className = "",
  padding = "md",
  interactive = false,
  elevated = false,
  as: Tag = "div",
  onClick,
}: CardProps) {
  const base =
    "bg-bg-surface border border-border-base/60 rounded-2xl transition-all";
  const shadow = elevated
    ? "shadow-[var(--shadow-card-md)]"
    : "shadow-[var(--shadow-card-sm)]";
  const hover = interactive
    ? "hover:border-border-base hover:-translate-y-[1px] cursor-pointer"
    : "";
  return (
    <Tag
      onClick={onClick}
      className={`${base} ${shadow} ${hover} ${PADDING_MAP[padding]} ${className}`}
    >
      {children}
    </Tag>
  );
}

export default Card;
