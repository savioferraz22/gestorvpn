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
    "bg-bg-surface border border-border-base rounded-xl transition-colors";
  const shadow = "";
  const hover = interactive
    ? "hover:bg-bg-surface-hover cursor-pointer"
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
