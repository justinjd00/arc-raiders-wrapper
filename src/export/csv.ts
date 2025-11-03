import * as fs from 'fs';
import * as path from 'path';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

function objectToCSVRow(obj: Record<string, unknown>): string {
  const values = Object.values(obj).map(escapeCSV);
  return values.join(',');
}

function flattenObject(obj: unknown, prefix = ''): Record<string, unknown> {
  if (obj === null || obj === undefined) {
    return {};
  }
  
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return prefix ? { [prefix]: obj } : {};
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

export async function exportToCSV<T>(
  data: T[],
  filePath: string,
  options?: { headers?: string[] }
): Promise<void> {
  if (data.length === 0) {
    throw new Error('Cannot export empty array to CSV');
  }

  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const flattened = data.map(item => flattenObject(item as Record<string, unknown>));
  const headers = options?.headers || Object.keys(flattened[0]);
  const headerRow = headers.map(escapeCSV).join(',');
  const dataRows = flattened.map(obj => {
    const values = headers.map(header => escapeCSV(obj[header]));
    return values.join(',');
  });
  
  const csv = [headerRow, ...dataRows].join('\n');
  fs.writeFileSync(filePath, csv, 'utf-8');
}

export function exportToCSVString<T>(
  data: T[],
  options?: { headers?: string[] }
): string {
  if (data.length === 0) {
    return '';
  }

  const flattened = data.map(item => flattenObject(item as Record<string, unknown>));
  const headers = options?.headers || Object.keys(flattened[0]);
  const headerRow = headers.map(escapeCSV).join(',');
  const dataRows = flattened.map(obj => {
    const values = headers.map(header => escapeCSV(obj[header]));
    return values.join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

