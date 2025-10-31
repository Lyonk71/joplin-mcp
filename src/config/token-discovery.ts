import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Auto-discover Joplin API token from settings.json
 */
export function discoverJoplinToken(): string | null {
  try {
    // Determine settings path based on OS
    let settingsPath: string;
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS
      settingsPath = join(
        homedir(),
        'Library',
        'Application Support',
        'joplin-desktop',
        'settings.json',
      );
    } else if (platform === 'win32') {
      // Windows
      settingsPath = join(
        process.env.APPDATA || '',
        'joplin-desktop',
        'settings.json',
      );
    } else {
      // Linux and others
      settingsPath = join(
        homedir(),
        '.config',
        'joplin-desktop',
        'settings.json',
      );
    }

    // Check if settings file exists
    if (!existsSync(settingsPath)) {
      console.error(`[Info] Joplin settings not found at: ${settingsPath}`);
      return null;
    }

    // Read and parse settings.json
    const settingsContent = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);

    if (!settings['api.token']) {
      console.error('[Info] API token not found in Joplin settings');
      console.error(
        '[Info] Make sure Web Clipper is enabled in Joplin settings',
      );
      return null;
    }

    const token = settings['api.token'];
    console.error('[Info] Successfully auto-discovered Joplin API token');
    return token;
  } catch (error) {
    console.error(
      '[Warning] Failed to auto-discover Joplin token:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
