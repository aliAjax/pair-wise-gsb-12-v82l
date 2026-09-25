// 存储层：只管 localStorage 的读写与版本迁移，不包含任何业务规则。
import type { Database } from "./types";
import { createSeedDatabase } from "./data/seed";

const STORAGE_KEY = "dfwlfront-3-recycle-waybills";
const CURRENT_VERSION = 1;

export function loadDatabase(): Database {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = createSeedDatabase();
    saveDatabase(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as Database;
    return migrate(parsed);
  } catch {
    // 数据损坏时回退到演示数据，避免页面白屏
    const seeded = createSeedDatabase();
    saveDatabase(seeded);
    return seeded;
  }
}

export function saveDatabase(db: Database): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetDatabase(): Database {
  const seeded = createSeedDatabase();
  saveDatabase(seeded);
  return seeded;
}

function migrate(db: Database): Database {
  // 后续版本升级时在此按 db.version 逐步迁移
  if (!db.version) db.version = CURRENT_VERSION;
  if (typeof db.seq !== "number") db.seq = db.waybills?.length ?? 0;
  db.stores ??= [];
  db.vehicles ??= [];
  db.drivers ??= [];
  db.slots ??= [];
  db.waybills ??= [];
  for (const wb of db.waybills) wb.amendments ??= [];
  return db;
}
