export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export interface CsvOptions<T> {
  /**
   * Column definitions. Without them every top-level key becomes a column and
   * nested objects or arrays are written as JSON.
   */
  columns?: ReadonlyArray<CsvColumn<T> | (keyof T & string)>;
  /** Default `","`. Use `";"` for German Excel. */
  delimiter?: string;
}

function cell(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Guard against CSV injection when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return safe.includes(delimiter) || /["\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with proper quoting. */
export function toCSV<T extends object>(rows: readonly T[], options: CsvOptions<T> = {}): string {
  const delimiter = options.delimiter ?? ',';
  const columns: CsvColumn<T>[] = (
    options.columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))]
  ).map((c) =>
    typeof c === 'string'
      ? { header: c, value: (row: T) => (row as Record<string, unknown>)[c] }
      : c
  );

  const lines = [columns.map((c) => cell(c.header, delimiter)).join(delimiter)];
  for (const row of rows)
    lines.push(columns.map((c) => cell(c.value(row), delimiter)).join(delimiter));
  return lines.join('\r\n');
}

export function toJSON(data: unknown, pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : undefined);
}

/** @deprecated Use `toJSON`. */
export const exportToJSONString = toJSON;
/** @deprecated Use `toCSV`. */
export const exportToCSVString = <T extends object>(rows: readonly T[]) => toCSV(rows);
