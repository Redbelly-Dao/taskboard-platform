"use client";
import React from "react";

// A column-driven table that becomes a stack of labelled cards below `md`.
// Wide, dense tables (up to 10 columns) are unreadable on a phone even with horizontal scroll,
// so on small screens each row renders as a card with "LABEL  value" rows.
// Feed it plain column defs; bespoke tables with inline edits / expandable rows keep their own markup
// + the .table-header/.row-alt classes and an overflow-x-auto wrapper.
export type Column<T> = {
  key: string;
  header: React.ReactNode;
  /** Cell renderer. */
  cell: (row: T) => React.ReactNode;
  /** Hidden in the mobile card view (e.g. a redundant action column). */
  hideOnMobile?: boolean;
  /** Right-align numeric/mono columns. */
  align?: "left" | "right";
  className?: string;
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) {
    return <div className="card p-12 text-center text-sm text-outline">{empty}</div>;
  }

  return (
    <div className="card overflow-hidden">
      {/* Desktop / tablet: real table, horizontally scrollable as a last resort */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="card-rule">
              {columns.map((c) => (
                <th key={c.key} className={`table-header ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={`${i % 2 === 1 ? "row-alt" : ""} ${onRowClick ? "cursor-pointer hover:bg-surface-container-high transition-colors" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row */}
      <div className="md:hidden divide-y divide-surface-container-high">
        {rows.map((row, i) => (
          <div
            key={rowKey(row, i)}
            className={`p-4 ${onRowClick ? "active:bg-surface-container-high" : ""}`}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.filter((c) => !c.hideOnMobile).map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 py-1">
                <span className="label mb-0 flex-none pt-0.5">{c.header}</span>
                <span className="text-sm text-on-surface text-right min-w-0">{c.cell(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
