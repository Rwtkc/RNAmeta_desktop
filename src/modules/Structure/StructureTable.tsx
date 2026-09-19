import { useEffect, useMemo, useState } from "react";
import type { BedRow } from "@/modules/GenomeBrowser/genomeBrowserTypes";

const COLUMNS = [
  ["bed_col_1", "chrom"],
  ["bed_col_2", "chromStart"],
  ["bed_col_3", "chromEnd"],
  ["transcript_interval", "Transcript interval"],
  ["transcript_id", "Transcript ID"],
  ["gene_id", "Gene ID"],
  ["transcript_length", "Transcript length"],
  ["structure_action", "Structure"]
] as const;

function visiblePages(page: number, totalPages: number) {
  if (totalPages <= 8) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, page - 2), totalPages - 7);
  return [...Array.from({ length: 6 }, (_, index) => start + index), totalPages - 1, totalPages]
    .filter((value, index, values) => value <= totalPages && values.indexOf(value) === index);
}

export function StructureTable({ rows, selectedRow, disabled, onSelect }: {
  rows: BedRow[];
  selectedRow: BedRow | null;
  disabled: boolean;
  onSelect: (row: BedRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => COLUMNS.some(([id]) =>
      id !== "structure_action" && String(row[id] ?? "").toLowerCase().includes(normalized)
    ));
  }, [query, rows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pages = visiblePages(safePage, totalPages);
  useEffect(() => setPage(1), [rows]);
  const changePage = (value: number) => setPage(Math.min(totalPages, Math.max(1, value)));

  return <section className="browser-panel browser-panel--table structure-table-panel">
    <div className="browser-react-table">
      <div className="browser-react-table__toolbar">
        <div className="browser-panel__eyebrow">Transcript mapping table</div>
        <label className="browser-react-table__search">
          <input aria-label="Search Structure mapping table" value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder="Search transcript or BED fields" />
        </label>
      </div>
      <div className="browser-transcript-table-wrap">
        <table className="browser-transcript-table structure-table">
          <thead><tr>{COLUMNS.map(([id, label]) => <th key={id}>{label}</th>)}</tr></thead>
          <tbody>{pageRows.map((row) => <tr key={row.row_key}
            className={selectedRow?.row_key === row.row_key ? "browser-transcript-table__row--selected" : ""}>
            {COLUMNS.map(([id]) => <td key={id}>{id === "structure_action"
              ? <button type="button" className="browser-transcript-table__link browser-transcript-table__link--button"
                  disabled={disabled} onClick={() => onSelect(row)}>Run RNAfold</button>
              : String(row[id] ?? "")}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="browser-react-table__footer">
        <span>Showing {filteredRows.length ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, filteredRows.length)} of {filteredRows.length} rows</span>
        <div className="browser-react-table__pager">
          <button type="button" disabled={safePage <= 1} onClick={() => changePage(safePage - 1)}>Previous</button>
          {pages.map((pageNumber) => <span className="browser-react-table__page-group" key={pageNumber}>
            <button type="button" className={pageNumber === safePage ? "is-active" : ""}
              onClick={() => changePage(pageNumber)}>{pageNumber}</button>
          </span>)}
          <button type="button" disabled={safePage >= totalPages} onClick={() => changePage(safePage + 1)}>Next</button>
        </div>
      </div>
    </div>
  </section>;
}
