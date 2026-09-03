// One settings document for the whole extension, stored under a single key
// in chrome.storage.local.
//
// The document has a `core` section (things the panel itself needs) and a
// `modules` map keyed by module id, so a new mod adds its own namespace and
// touches nothing else. Every read goes through `normalize`, which tolerates
// missing, extra and malformed fields: settings written by an older or newer
// version of the extension, or pasted in by hand, still load.

export const STORAGE_KEY = "pagemods";
export const SETTINGS_VERSION = 1;

export type PanelSide = "right" | "left";

export interface CoreSettings {
  /** In-page shortcut that toggles the panel, e.g. "Ctrl+;". */
  shortcut: string;
  panelSide: PanelSide;
  /** Module ids the user switched off; they neither init nor show in the panel. */
  disabledModules: string[];
}

export interface Settings {
  version: number;
  core: CoreSettings;
  modules: Record<string, unknown>;
}

export const DEFAULT_CORE: CoreSettings = {
  shortcut: "Ctrl+;",
  panelSide: "right",
  disabledModules: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce any value into a valid settings document. Never throws. */
export function normalize(raw: unknown): Settings {
  const doc = isRecord(raw) ? raw : {};
  const core = isRecord(doc.core) ? doc.core : {};
  const modules = isRecord(doc.modules) ? doc.modules : {};
  const shortcut =
    typeof core.shortcut === "string" && core.shortcut.trim() !== ""
      ? core.shortcut.trim()
      : DEFAULT_CORE.shortcut;
  const panelSide: PanelSide = core.panelSide === "left" ? "left" : "right";
  const disabledModules = Array.isArray(core.disabledModules)
    ? core.disabledModules.filter((id): id is string => typeof id === "string")
    : [];
  return {
    version: SETTINGS_VERSION,
    core: { shortcut, panelSide, disabledModules },
    modules: { ...modules },
  };
}

/** The subset of chrome.storage.StorageArea this store needs. */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface SettingsStore {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  /** Read-modify-write of one module's namespace. */
  updateModule<T>(id: string, defaults: T, update: (current: T) => T): Promise<T>;
  /** Read-modify-write of the core section. */
  updateCore(update: (current: CoreSettings) => CoreSettings): Promise<CoreSettings>;
}

/** A module's settings, normalized by the module's own function. */
export function moduleSettings<T>(
  settings: Settings,
  id: string,
  normalizeModule: (raw: unknown) => T,
): T {
  return normalizeModule(settings.modules[id]);
}

export function createSettingsStore(area: StorageArea): SettingsStore {
  async function load(): Promise<Settings> {
    const items = await area.get(STORAGE_KEY);
    return normalize(items[STORAGE_KEY]);
  }
  async function save(settings: Settings): Promise<void> {
    await area.set({ [STORAGE_KEY]: normalize(settings) });
  }
  // Read-modify-write cycles from this store run one after another, so two
  // quick clicks in the panel cannot overwrite each other's change.
  let chain: Promise<unknown> = Promise.resolve();
  function serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  }
  return {
    load,
    save: (settings) => serialized(() => save(settings)),
    updateModule<T>(id: string, defaults: T, update: (current: T) => T): Promise<T> {
      return serialized(async () => {
        const settings = await load();
        const current = settings.modules[id] === undefined ? defaults : (settings.modules[id] as T);
        const next = update(current);
        settings.modules[id] = next;
        await save(settings);
        return next;
      });
    },
    updateCore(update) {
      return serialized(async () => {
        const settings = await load();
        settings.core = normalize({ ...settings, core: update(settings.core) }).core;
        await save(settings);
        return settings.core;
      });
    },
  };
}

/** In-memory area for tests and for the settings preview in the panel. */
export function memoryArea(initial: Record<string, unknown> = {}): StorageArea {
  const data = { ...initial };
  return {
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, items);
    },
  };
}

/** Serialize for export: stable key order, readable indentation. */
export function exportSettings(settings: Settings): string {
  return JSON.stringify(normalize(settings), null, 2);
}

/** Parse an import; returns an error message instead of throwing. */
export function importSettings(text: string): { settings: Settings } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `not valid JSON: ${(error as Error).message}` };
  }
  if (!isRecord(parsed)) return { error: "the document must be a JSON object" };
  if (!("core" in parsed) && !("modules" in parsed)) {
    return { error: 'expected a pagemods settings document with "core" and "modules"' };
  }
  return { settings: normalize(parsed) };
}
