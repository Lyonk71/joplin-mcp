import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Get the package version from package.json
 * Works in both development (ts-node) and production (compiled)
 */
export function getVersion(): string {
  try {
    // Get the directory of this file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // package.json is one level up from dist/ (or src/ during dev)
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    return packageJson.version || '0.1.0';
  } catch {
    // Fallback if package.json can't be read
    return '0.1.0';
  }
}
