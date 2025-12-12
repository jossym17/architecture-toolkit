// Plugin Manager - Extensible plugin system for architecture toolkit

import * as fs from 'fs/promises';
import * as path from 'path';
import { Artifact } from '../models/artifact.js';

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
  /** Called before an artifact is created */
  beforeCreate?: (artifact: Partial<Artifact>) => Promise<Partial<Artifact>>;
  /** Called after an artifact is created */
  afterCreate?: (artifact: Artifact) => Promise<void>;
  /** Called before an artifact is updated */
  beforeUpdate?: (id: string, changes: Partial<Artifact>) => Promise<Partial<Artifact>>;
  /** Called after an artifact is updated */
  afterUpdate?: (artifact: Artifact) => Promise<void>;
  /** Called before an artifact is deleted */
  beforeDelete?: (id: string) => Promise<boolean>;
  /** Called after an artifact is deleted */
  afterDelete?: (id: string) => Promise<void>;
  /** Called when status changes */
  onStatusChange?: (artifact: Artifact, oldStatus: string, newStatus: string) => Promise<void>;
}

/**
 * Export format definition
 */
export interface ExportFormat {
  /** Format identifier */
  id: string;
  /** Display name */
  name: string;
  /** File extension */
  extension: string;
  /** Export function */
  export: (artifacts: Artifact[]) => Promise<string>;
}

/**
 * Custom artifact type definition
 */
export interface CustomArtifactType {
  /** Type identifier */
  id: string;
  /** Display name */
  name: string;
  /** ID prefix (e.g., 'CUSTOM') */
  prefix: string;
  /** Required fields */
  requiredFields: string[];
  /** Optional fields */
  optionalFields?: string[];
  /** Valid statuses */
  statuses: string[];
  /** Default status */
  defaultStatus: string;
}

/**
 * Plugin definition
 */
export interface Plugin {
  /** Unique plugin identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Lifecycle hooks */
  hooks?: PluginHooks;
  /** Custom export formats */
  exportFormats?: ExportFormat[];
  /** Custom artifact types */
  artifactTypes?: CustomArtifactType[];
  /** Plugin initialization */
  initialize?: () => Promise<void>;
  /** Plugin cleanup */
  destroy?: () => Promise<void>;
}

/**
 * Plugin registration result
 */
export interface PluginRegistration {
  success: boolean;
  pluginId: string;
  error?: string;
}

/**
 * Plugin manager for loading and managing plugins
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private hooks: Map<keyof PluginHooks, Array<{ pluginId: string; handler: Function }>> = new Map();
  private exportFormats: Map<string, ExportFormat> = new Map();
  private artifactTypes: Map<string, CustomArtifactType> = new Map();
  private configDir: string;

  constructor(configDir: string = '.arch') {
    this.configDir = configDir;
    this.initializeHookRegistry();
  }

  private initializeHookRegistry(): void {
    const hookNames: (keyof PluginHooks)[] = [
      'beforeCreate', 'afterCreate',
      'beforeUpdate', 'afterUpdate',
      'beforeDelete', 'afterDelete',
      'onStatusChange'
    ];
    hookNames.forEach(name => this.hooks.set(name, []));
  }

  /**
   * Register a plugin
   */
  async register(plugin: Plugin): Promise<PluginRegistration> {
    if (this.plugins.has(plugin.id)) {
      return { success: false, pluginId: plugin.id, error: `Plugin ${plugin.id} already registered` };
    }

    try {
      // Initialize plugin
      if (plugin.initialize) {
        await plugin.initialize();
      }

      // Register hooks
      if (plugin.hooks) {
        for (const [hookName, handler] of Object.entries(plugin.hooks)) {
          if (handler) {
            const hookList = this.hooks.get(hookName as keyof PluginHooks);
            hookList?.push({ pluginId: plugin.id, handler });
          }
        }
      }

      // Register export formats
      if (plugin.exportFormats) {
        for (const format of plugin.exportFormats) {
          this.exportFormats.set(format.id, format);
        }
      }

      // Register artifact types
      if (plugin.artifactTypes) {
        for (const type of plugin.artifactTypes) {
          this.artifactTypes.set(type.id, type);
        }
      }

      this.plugins.set(plugin.id, plugin);
      return { success: true, pluginId: plugin.id };
    } catch (error) {
      return { success: false, pluginId: plugin.id, error: (error as Error).message };
    }
  }

  /**
   * Unregister a plugin
   */
  async unregister(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    // Cleanup plugin
    if (plugin.destroy) {
      await plugin.destroy();
    }

    // Remove hooks
    for (const [, handlers] of this.hooks) {
      const index = handlers.findIndex(h => h.pluginId === pluginId);
      if (index !== -1) handlers.splice(index, 1);
    }

    // Remove export formats
    if (plugin.exportFormats) {
      for (const format of plugin.exportFormats) {
        this.exportFormats.delete(format.id);
      }
    }

    // Remove artifact types
    if (plugin.artifactTypes) {
      for (const type of plugin.artifactTypes) {
        this.artifactTypes.delete(type.id);
      }
    }

    this.plugins.delete(pluginId);
    return true;
  }

  /**
   * Execute a hook
   */
  async executeHook<T>(hookName: keyof PluginHooks, ...args: unknown[]): Promise<T | undefined> {
    const handlers = this.hooks.get(hookName) || [];
    let result: unknown = args[0];

    for (const { handler } of handlers) {
      const hookResult = await handler(...args);
      if (hookResult !== undefined) {
        result = hookResult;
      }
    }

    return result as T;
  }

  /**
   * Get all registered export formats
   */
  getExportFormats(): ExportFormat[] {
    return Array.from(this.exportFormats.values());
  }

  /**
   * Get export format by ID
   */
  getExportFormat(id: string): ExportFormat | undefined {
    return this.exportFormats.get(id);
  }

  /**
   * Get all custom artifact types
   */
  getArtifactTypes(): CustomArtifactType[] {
    return Array.from(this.artifactTypes.values());
  }

  /**
   * Get artifact type by ID
   */
  getArtifactType(id: string): CustomArtifactType | undefined {
    return this.artifactTypes.get(id);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin by ID
   */
  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Load plugins from config directory
   */
  async loadFromConfig(): Promise<PluginRegistration[]> {
    const results: PluginRegistration[] = [];
    const pluginsDir = path.join(this.configDir, 'plugins');

    try {
      await fs.access(pluginsDir);
      const files = await fs.readdir(pluginsDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await fs.readFile(path.join(pluginsDir, file), 'utf-8');
          const pluginConfig = JSON.parse(content) as Plugin;
          const result = await this.register(pluginConfig);
          results.push(result);
        } catch {
          results.push({ success: false, pluginId: file, error: 'Failed to load plugin config' });
        }
      }
    } catch {
      // Plugins directory doesn't exist, that's fine
    }

    return results;
  }

  /**
   * Save plugin config
   */
  async savePluginConfig(plugin: Plugin): Promise<void> {
    const pluginsDir = path.join(this.configDir, 'plugins');
    await fs.mkdir(pluginsDir, { recursive: true });
    
    const configPath = path.join(pluginsDir, `${plugin.id}.json`);
    await fs.writeFile(configPath, JSON.stringify(plugin, null, 2), 'utf-8');
  }
}
