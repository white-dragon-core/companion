import fs from 'fs/promises';
import * as TOML from 'toml';

export interface Config {
  roots: string[];
  test_extra_options?: Record<string, any>;
}

export interface ConfigResponse {
  testRoots: string[];
  testExtraOptions: Record<string, any>;
}

export async function loadConfig(path: string = 'testez-companion.toml'): Promise<Config> {
  try {
    const contents = await fs.readFile(path, 'utf-8');
    return TOML.parse(contents) as Config;
  } catch (error) {
    throw new Error(`Failed to load config from ${path}: ${error}`);
  }
}