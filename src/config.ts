import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type OutputFormat = 'text' | 'json';

export interface ConfigFile {
  maxLineLength?: number;
  tabWidth?: number;
  format?: OutputFormat;
}

const CONFIG_FILENAME = '.wraplintrc';

/**
 * Reads .wraplintrc from the given directory, if present. The file is JSON
 * despite the extensionless dotfile name (the same convention .eslintrc.json
 * uses). Returns an empty object if no config file exists there.
 */
export function loadConfig(dir: string): ConfigFile {
  const path = join(dir, CONFIG_FILENAME);
  if (!existsSync(path)) return {};

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${CONFIG_FILENAME}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${CONFIG_FILENAME} is not valid JSON: ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${CONFIG_FILENAME} must contain a JSON object`);
  }

  const obj = parsed as Record<string, unknown>;
  const config: ConfigFile = {};

  if ('maxLineLength' in obj) {
    const value = obj.maxLineLength;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${CONFIG_FILENAME}: "maxLineLength" must be a positive number`);
    }
    config.maxLineLength = value;
  }

  if ('tabWidth' in obj) {
    const value = obj.tabWidth;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${CONFIG_FILENAME}: "tabWidth" must be a positive number`);
    }
    config.tabWidth = value;
  }

  if ('format' in obj) {
    const value = obj.format;
    if (value !== 'text' && value !== 'json') {
      throw new Error(`${CONFIG_FILENAME}: "format" must be "text" or "json"`);
    }
    config.format = value;
  }

  return config;
}
