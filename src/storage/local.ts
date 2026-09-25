// 存储层：只负责 localStorage 的序列化/反序列化，业务数据结构见 types
import type { AppData, FilterState } from "../types";
import { buildSeedData } from "../data/seed";

const DATA_KEY = "dfwlfront-3-recycle-v1";
const FILTER_KEY = "dfwlfront-3-recycle-filter-v1";

export function loadData(): AppData {
  const raw = localStorage.getItem(DATA_KEY);
  if (!raw) {
    const seed = buildSeedData();
    saveData(seed);
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed.orders || !parsed.vehicles || !parsed.drivers || !parsed.stores) {
      throw new Error("数据结构不完整");
    }
    return parsed;
  } catch {
    // 数据损坏时回退到种子数据，避免页面白屏
    const seed = buildSeedData();
    saveData(seed);
    return seed;
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

const DEFAULT_FILTER: FilterState = { storeId: "", vehicleId: "", status: "全部", keyword: "" };

export function loadFilter(): FilterState {
  const raw = localStorage.getItem(FILTER_KEY);
  if (!raw) return { ...DEFAULT_FILTER };
  try {
    return { ...DEFAULT_FILTER, ...(JSON.parse(raw) as Partial<FilterState>) };
  } catch {
    return { ...DEFAULT_FILTER };
  }
}

export function saveFilter(filter: FilterState): void {
  localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
}
