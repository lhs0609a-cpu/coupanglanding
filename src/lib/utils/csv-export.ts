/** CSV 다운로드 유틸리티 */

interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

export function exportToCsv<T>(
  filename: string,
  data: T[],
  columns: CsvColumn<T>[],
) {
  // BOM for Excel UTF-8 compat
  const BOM = '\uFEFF';
  const headers = columns.map((c) => `"${c.header}"`).join(',');
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor(row);
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return val;
      })
      .join(','),
  );

  const csv = BOM + [headers, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
