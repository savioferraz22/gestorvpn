import React from "react";

type SkeletonProps = {
  variant?: "rect" | "line" | "circle";
  width?: number | string;
  height?: number | string;
  className?: string;
  rounded?: string;
};

export function Skeleton({
  variant = "rect",
  width,
  height,
  className = "",
  rounded,
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width: width ?? (variant === "line" ? "100%" : undefined),
    height:
      height ??
      (variant === "line"
        ? "0.75rem"
        : variant === "circle"
          ? (width ?? "2rem")
          : undefined),
  };
  const r =
    rounded ?? (variant === "circle" ? "rounded-full" : "rounded-md");
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`inline-block animate-pulse bg-bg-surface-hover ${r} ${className}`}
    />
  );
}

export function SkeletonStack({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i}>
          <Skeleton variant="line" width={`${60 + ((i * 17) % 35)}%`} />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
