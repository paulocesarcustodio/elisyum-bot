"use client"

import * as React from "react"
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  searchPlaceholder?: string
  isLoading?: boolean
  pageSize?: number
  pageSizeOptions?: number[]
  emptyMessage?: string
  onPageSizeChange?: (size: number) => void
  disableSearch?: boolean
  disablePagination?: boolean
}

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = "Buscar...",
  isLoading = false,
  pageSize = 50,
  pageSizeOptions = [10, 20, 50, 100],
  emptyMessage = "Nenhum resultado.",
  onPageSizeChange,
  disableSearch = false,
  disablePagination = false,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [search, setSearch] = React.useState("")

  const filteredData = React.useMemo(
    () => {
      if (!search) return data
      const q = search.toLowerCase()
      return data.filter((row) =>
        Object.values(row as Record<string, unknown>).some((value) =>
          String(value ?? "").toLowerCase().includes(q)
        )
      )
    },
    [data, search]
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(!disablePagination && {
      getPaginationRowModel: getPaginationRowModel(),
      initialState: { pagination: { pageSize } },
    }),
  })

  const totalPages = table.getPageCount()

  return (
    <section>
      {!disableSearch && (
        <div className="flex items-center gap-2 mb-4">
          <input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              table.setPageIndex(0)
            }}
            className="w-full px-3 py-2 rounded-md border bg-card text-foreground text-sm"
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : table.getRowModel().rows.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">{emptyMessage}</p>
      ) : (
        <div className="rounded-md border bg-gradient-to-br from-card via-[#18181c] to-[#141416]">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.getCanSort() && "cursor-pointer select-none",
                        (header.column.columnDef.meta as Record<string, string>)?.headerClassName
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder ? null : (
                        <span className="inline-flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {{
                            asc: " ↑",
                            desc: " ↓",
                          }[header.column.getIsSorted() as string] ?? null}
                        </span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={(cell.column.columnDef.meta as Record<string, string>)?.cellClassName}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!disablePagination && (
        <div className="flex justify-between items-center mt-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {filteredData.length} registro{filteredData.length !== 1 ? "s" : ""}
            </span>
            <span className="text-sm text-muted-foreground">·</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const val = Number(e.target.value)
                table.setPageSize(val)
                onPageSizeChange?.(val)
              }}
              className="px-2 py-1 rounded-md border bg-card text-foreground text-sm"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}/página
                </option>
              ))}
            </select>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                {table.getState().pagination.pageIndex + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Próximo
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
