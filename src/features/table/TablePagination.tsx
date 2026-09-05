import { ArrowLeft, ArrowRight } from "lucide-react";
import type { TableDataController } from "./useTableData";
export function TablePagination({
  table,
  locked,
}: {
  table: TableDataController;
  locked: boolean;
}) {
  return (
    <footer className="table-pagination">
      <div>
        <span>
          Page {table.page + 1}
          {table.data && ` · ${table.data.rows.length} rows`}
        </span>
        {table.filter && <span className="filter-active">Filtered</span>}
      </div>
      <label>
        Rows per page
        <select
          aria-label="Rows per page"
          value={table.pageSize}
          disabled={locked}
          onChange={(event) => table.setPageSize(Number(event.target.value))}
        >
          {[25, 50, 100].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </label>
      <div className="pagination-buttons">
        <button
          aria-label="Previous page"
          disabled={table.page === 0 || locked}
          onClick={() => table.setPage(table.page - 1)}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          aria-label="Next page"
          disabled={!table.data?.hasMore || locked}
          onClick={() => table.setPage(table.page + 1)}
        >
          <ArrowRight size={15} />
        </button>
      </div>
    </footer>
  );
}
