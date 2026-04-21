import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Empty } from "./Empty";
import { Skeleton } from "./Skeleton";

export type Column<T> = {
  id: string;
  header: ReactNode;
  accessor?: (row: T) => string | number | null | undefined;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
};

type SortDir = "asc" | "desc" | null;

export type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  density?: "comfortable" | "compact";
  initialSort?: { id: string; dir: SortDir };
  stickyHeader?: boolean;
  pageSize?: number;
  rowClassName?: (row: T) => string | undefined;
};

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  onRowClick,
  emptyTitle = "Sem resultados",
  emptyDescription,
  loading,
  density = "comfortable",
  initialSort,
  stickyHeader = true,
  pageSize,
  rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; dir: SortDir }>(
    initialSort ?? { id: "", dir: null },
  );
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort.dir) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.accessor) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.accessor!(a);
      const bv = col.accessor!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "pt-BR", { numeric: true }) * dir;
    });
  }, [rows, columns, sort]);

  const total = sorted.length;
  const totalPages = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const visible = pageSize
    ? sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    : sorted;

  function toggleSort(id: string) {
    setSort((prev) => {
      if (prev.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return { id: "", dir: null };
    });
  }

  const padY = density === "compact" ? "py-2" : "py-3";

  return (
    <div className="overflow-hidden rounded-2xl border border-border-base/60 bg-bg-surface shadow-[var(--shadow-card-sm)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead
            className={`bg-bg-surface-hover/60 ${
              stickyHeader ? "sticky top-0 z-10" : ""
            }`}
          >
            <tr>
              {columns.map((col) => {
                const active = sort.id === col.id && sort.dir;
                const canSort = col.sortable !== false && !!col.accessor;
                const align =
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left";
                return (
                  <th
                    key={col.id}
                    style={col.width ? { width: col.width } : undefined}
                    className={`${align} border-b border-border-base/60 px-3 ${padY} text-[11px] font-bold uppercase tracking-wide text-text-muted ${
                      col.headerClassName ?? ""
                    }`}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className="inline-flex items-center gap-1 hover:text-text-base"
                      >
                        {col.header}
                        {active === "asc" ? (
                          <ArrowUp size={11} />
                        ) : active === "desc" ? (
                          <ArrowDown size={11} />
                        ) : (
                          <ChevronsUpDown size={11} className="opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && visible.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border-base/40 last:border-0">
                  {columns.map((col) => (
                    <td key={col.id} className={`px-3 ${padY}`}>
                      <Skeleton width="70%" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6">
                  <Empty title={emptyTitle} description={emptyDescription} compact />
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const id = getRowId(row);
                const extra = rowClassName?.(row) ?? "";
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-b border-border-base/40 last:border-0 transition-colors ${
                      onRowClick
                        ? "cursor-pointer hover:bg-bg-surface-hover/60"
                        : ""
                    } ${extra}`}
                  >
                    {columns.map((col) => {
                      const align =
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left";
                      return (
                        <td
                          key={col.id}
                          className={`${align} px-3 ${padY} text-text-base ${
                            col.cellClassName ?? ""
                          }`}
                        >
                          {col.cell ? col.cell(row) : (col.accessor?.(row) ?? "")}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pageSize && total > pageSize && (
        <div className="flex items-center justify-between border-t border-border-base/60 bg-bg-surface-hover/30 px-3 py-2 text-xs text-text-muted">
          <span>
            Página {currentPage + 1} de {totalPages} · {total} itens
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded-lg border border-border-base/60 bg-bg-surface px-2 py-1 font-semibold hover:bg-bg-surface-hover disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="rounded-lg border border-border-base/60 bg-bg-surface px-2 py-1 font-semibold hover:bg-bg-surface-hover disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
