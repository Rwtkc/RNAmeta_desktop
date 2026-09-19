import { useEffect, useMemo, useState } from "react";
import type { BedRow } from "./genomeBrowserTypes";

const BED_HEADERS = [
  "chrom", "chromStart", "chromEnd", "name", "score", "strand",
  "thickStart", "thickEnd", "itemRgb", "blockCount", "blockSizes", "blockStarts"
];

function tableColumns(rows: BedRow[]) {
  const bedColumns = Object.keys(rows[0] ?? {})
    .filter((key) => /^bed_col_\d+$/.test(key))
    .sort((left, right) => Number(left.slice(8)) - Number(right.slice(8)));
  const first = bedColumns.slice(0, 3);
  const remaining = bedColumns.slice(3);
  return [
    ...first.map((id, index) => ({ id, label: BED_HEADERS[index] ?? `extra_${index + 1}` })),
    { id: "transcript_interval", label: "Transcript interval" },
    { id: "transcript_id", label: "Transcript ID" },
    { id: "igv_link", label: "IGV link" },
    ...remaining.map((id, index) => ({ id, label: BED_HEADERS[index + 3] ?? `extra_${index + 4}` }))
  ];
}

function visiblePages(page: number, totalPages: number) {
  if (totalPages <= 8) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, page - 2), totalPages - 7);
  return [...Array.from({ length: 6 }, (_, index) => start + index), totalPages - 1, totalPages]
    .filter((value, index, values) => value <= totalPages && values.indexOf(value) === index);
}

export function GenomeBrowserTable({ rows, selectedRow, onSelect }: {
  rows: BedRow[];
  selectedRow: BedRow | null;
  onSelect: (row: BedRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const columns = useMemo(() => tableColumns(rows), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => columns.some(({ id }) => String(row[id] ?? "").toLowerCase().includes(normalized)));
  }, [columns, query, rows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [rows]);

  const changePage = (value: number) => setPage(Math.min(totalPages, Math.max(1, value)));
  const pages = visiblePages(safePage, totalPages);

  return <section className="browser-panel browser-panel--table">
    <div className="browser-react-table">
      <div className="browser-react-table__toolbar">
        <div className="browser-panel__eyebrow">Transcript mapping table</div>
        <label className="browser-react-table__search">
          <input aria-label="Search table" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search transcript or BED fields" />
        </label>
      </div>
      <div className="browser-transcript-table-wrap">
        <table className="browser-transcript-table">
          <thead><tr>{columns.map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead>
          <tbody>{pageRows.map((row) => <tr key={row.row_key} className={selectedRow?.row_key === row.row_key ? "browser-transcript-table__row--selected" : ""}>
            {columns.map((column) => <td key={column.id}>{column.id === "igv_link"
              ? <button className="browser-transcript-table__link browser-transcript-table__link--button" type="button" onClick={() => onSelect(row)}>Open in IGV</button>
              : String(row[column.id] ?? "")}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="browser-react-table__footer">
        <span>Showing {filteredRows.length ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, filteredRows.length)} of {filteredRows.length} rows</span>
        <div className="browser-react-table__pager">
          <button type="button" disabled={safePage <= 1} onClick={() => changePage(safePage - 1)}>Previous</button>
          {pages.map((pageNumber, index) => <span className="browser-react-table__page-group" key={pageNumber}>
            {index > 0 && pageNumber > pages[index - 1] + 1 ? <span className="browser-pager-ellipsis">...</span> : null}
            <button type="button" className={pageNumber === safePage ? "is-active" : ""} onClick={() => changePage(pageNumber)}>{pageNumber}</button>
          </span>)}
          <label className="browser-react-table__jump"><span>Go to page</span><input aria-label="Go to page" type="number" min="1" max={totalPages} value={safePage} onChange={(event) => changePage(Number(event.target.value) || 1)} /></label>
          <button type="button" disabled={safePage >= totalPages} onClick={() => changePage(safePage + 1)}>Next</button>
        </div>
      </div>
    </div>
  </section>;
}
