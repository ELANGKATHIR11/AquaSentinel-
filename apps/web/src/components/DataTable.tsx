/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Search, SlidersHorizontal } from 'lucide-react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  paginationSize?: number;
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Search records...',
  searchKeys = [],
  paginationSize = 10,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Sorting logic
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Filter & Sort computations
  const processedData = useMemo(() => {
    let result = [...data];

    // 1. Search filter
    if (searchTerm.trim() !== '' && searchKeys.length > 0) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter((item) =>
        searchKeys.some((k) => {
          const val = item[k];
          if (val === undefined || val === null) return false;
          return String(val).toLowerCase().includes(lowerSearch);
        })
      );
    }

    // 2. Sort order
    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey as keyof T];
        const valB = b[sortKey as keyof T];

        if (valA === undefined) return 1;
        if (valB === undefined) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();

        if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
        if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, searchTerm, searchKeys, sortKey, sortDirection]);

  // Pagination bounds
  const totalPages = Math.max(1, Math.ceil(processedData.length / paginationSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * paginationSize;
    return processedData.slice(start, start + paginationSize);
  }, [processedData, currentPage, paginationSize]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search Bar & Stats */}
      {searchKeys.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-700"
            />
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Showing {Math.min(processedData.length, (currentPage - 1) * paginationSize + 1)}-
            {Math.min(processedData.length, currentPage * paginationSize)} of {processedData.length} records
          </div>
        </div>
      )}

      {/* Table Canvas */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/20">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 text-[10px] font-mono uppercase tracking-wider">
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  onClick={() => col.sortable !== false && handleSort(col.key as string)}
                  className={`px-4 py-3 font-medium select-none ${col.sortable !== false ? 'cursor-pointer hover:text-slate-200' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable !== false && sortKey === col.key && (
                      sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-xs">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500 font-mono">
                  NO RECORDS FOUND
                </td>
              </tr>
            ) : (
              paginatedData.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key as string} className="px-4 py-3 text-slate-300">
                      {col.render ? col.render(item) : String(item[col.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}
            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs font-semibold rounded-lg text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500 font-mono">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}
            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs font-semibold rounded-lg text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
