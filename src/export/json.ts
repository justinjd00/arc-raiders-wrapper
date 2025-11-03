import * as fs from 'fs';
import * as path from 'path';

export async function exportToJSON<T>(data: T, filePath: string): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const dir = path.dirname(filePath);
  
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, json, 'utf-8');
}

export function exportToJSONString<T>(data: T): string {
  return JSON.stringify(data, null, 2);
}

