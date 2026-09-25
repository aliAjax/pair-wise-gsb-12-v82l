// 状态层：用 Pinia 串起数据(types/seed)、规则(rules)与存储(storage)。
// 页面只调用这里的 action，不直接写 localStorage、不内联规则判断。
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Arrival, Database, Issue, Waybill } from "../types";
import { loadDatabase, resetDatabase, saveDatabase } from "../storage";
import {
  type DispatchDraft,
  evaluateArrival,
  isFrozen,
  nextWaybillCode,
  validateDispatch
} from "../rules/engine";

export interface AmendDraft {
  packCount?: number;
  maxTemp?: number;
  bulging?: boolean;
  vehicleId?: string;
  driverId?: string;
  shiftStart?: string;
  shiftEnd?: string;
  slotId?: string;
}

const FIELD_LABELS: Record<string, string> = {
  storeId: "门店",
  packCount: "电池包数量",
  maxTemp: "最高温度",
  bulging: "是否鼓包",
  vehicleId: "承运车辆",
  driverId: "司机",
  shiftStart: "时段开始",
  shiftEnd: "时段结束",
  slotId: "原库位",
  receivedPacks: "实收包数",
  damagedPacks: "破损数",
  voucherNo: "入库凭证号"
};

export const useWaybillStore = defineStore("waybills", () => {
  const db = ref<Database>(loadDatabase());

  function persist() {
    saveDatabase(db.value);
  }

  const waybills = computed(() =>
    [...db.value.waybills].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );

  function getById(id: string): Waybill | undefined {
    return db.value.waybills.find((wb) => wb.id === id);
  }

  /** 新建回收联单（状态：待派车）。草稿阶段只提示，不做派车级阻断 */
  function createWaybill(draft: DispatchDraft): { ok: boolean; issues: Issue[]; id?: string } {
    const issues = validateDispatch(db.value, draft, undefined, "draft");
    if (issues.length > 0) return { ok: false, issues };

    const id = crypto.randomUUID();
    const wb: Waybill = {
      id,
      code: nextWaybillCode(db.value),
      ...draft,
      status: "pending",
      createdAt: new Date().toISOString(),
      amendments: []
    };
    db.value.waybills.push(wb);
    persist();
    return { ok: true, issues: [], id };
  }

  /** 确认派车：联单冻结，车辆/司机/库位正式占用 */
  function confirmDispatch(id: string): { ok: boolean; issues: Issue[] } {
    const wb = getById(id);
    if (!wb || wb.status !== "pending") return { ok: false, issues: [] };
    const issues = validateDispatch(db.value, toDraft(wb), wb.id);
    if (issues.length > 0) return { ok: false, issues };
    wb.status = "transporting";
    wb.dispatchedAt = new Date().toISOString();
    persist();
    return { ok: true, issues: [] };
  }

  /** 司机到库，仓库录入实收；数量不符或破损缺凭证 → 待复核（资源继续锁定） */
  function registerArrival(
    id: string,
    arrival: Arrival
  ): { ok: boolean; status: Waybill["status"]; issues: Issue[] } {
    const wb = getById(id);
    if (!wb || wb.status !== "transporting") {
      return { ok: false, status: "transporting", issues: [] };
    }
    const { status, issues } = evaluateArrival(wb, arrival);
    wb.arrival = arrival;
    wb.status = status;
    persist();
    return { ok: true, status, issues };
  }

  /** 复核完成：必须补齐凭证与数量结论，此时释放车辆与原库位 */
  function resolveReview(
    id: string,
    patch: { receivedPacks: number; damagedPacks: number; voucherNo: string; reviewNote: string }
  ): { ok: boolean; issues: Issue[] } {
    const wb = getById(id);
    if (!wb || wb.status !== "review") return { ok: false, issues: [] };

    const updatedArrival: Arrival = {
      ...(wb.arrival as Arrival),
      receivedPacks: patch.receivedPacks,
      damagedPacks: patch.damagedPacks,
      voucherNo: patch.voucherNo
    };
    const check = evaluateArrival(wb, updatedArrival);
    const blocking = check.issues.filter((i) => i.code !== "QUANTITY_MISMATCH");
    if (blocking.length > 0 || !patch.reviewNote.trim()) {
      return {
        ok: false,
        issues: patch.reviewNote.trim()
          ? blocking
          : [...blocking, { code: "VOUCHER_MISSING", message: "请填写复核结论后再释放车辆与库位" }]
      };
    }

    recordChanges(wb, {
      receivedPacks: [String(wb.arrival?.receivedPacks ?? ""), String(patch.receivedPacks)],
      damagedPacks: [String(wb.arrival?.damagedPacks ?? ""), String(patch.damagedPacks)],
      voucherNo: [wb.arrival?.voucherNo ?? "", patch.voucherNo]
    }, "复核处理：" + patch.reviewNote.trim(), "仓管复核");

    wb.arrival = updatedArrival;
    wb.reviewNote = patch.reviewNote.trim();
    wb.resolvedAt = new Date().toISOString();
    wb.status = "completed"; // 车辆与原库位此刻释放
    persist();
    return { ok: true, issues: [] };
  }

  /**
   * 改单：
   * - 待派车（未冻结）：可直接修改，不要求原因；
   * - 已确认冻结：必须填原因，旧值与原因永久保留在 amendments。
   */
  function amend(
    id: string,
    patch: AmendDraft & { reason?: string; operator?: string }
  ): { ok: boolean; issues: Issue[] } {
    const wb = getById(id);
    if (!wb || wb.status === "completed") return { ok: false, issues: [] };

    const reason = (patch.reason ?? "").trim();
    const operator = patch.operator ?? "";
    const frozenBefore = wb.status !== "pending";
    if (frozenBefore && !reason) {
      return { ok: false, issues: [{ code: "VOUCHER_MISSING", message: "联单已冻结，改单必须填写原因" }] };
    }

    const changes: AmendDraft = { ...patch };
    delete (changes as Partial<AmendDraft> & { reason?: string }).reason;
    delete (changes as Partial<AmendDraft> & { operator?: string }).operator;

    const merged = { ...toDraft(wb), ...stripUndefined(changes) };
    // 待派车草稿只做硬占用校验；已冻结联单改单走完整派车核查
    const level = wb.status === "pending" ? "draft" : "dispatch";
    const issues = validateDispatch(db.value, merged, wb.id, level);
    if (issues.length > 0) return { ok: false, issues };

    if (frozenBefore) {
      const pairs: Record<string, [string, string]> = {};
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) continue;
        pairs[key] = [formatValue(wb, key), displayValue(key, value)];
      }
      recordChanges(wb, pairs, reason, operator);
    }

    Object.assign(wb, merged);
    persist();
    return { ok: true, issues: [] };
  }

  function recordChanges(
    wb: Waybill,
    pairs: Record<string, [string, string]>,
    reason: string,
    operator: string
  ) {
    const changeList = Object.entries(pairs)
      .filter(([, [oldV, newV]]) => oldV !== newV)
      .map(([field, [oldValue, newValue]]) => ({
        field: FIELD_LABELS[field] ?? field,
        oldValue,
        newValue
      }));
    if (changeList.length === 0) return;
    wb.amendments.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      operator: operator || "调度员",
      reason,
      changes: changeList
    });
  }

  function displayValue(key: string, raw: unknown): string {
    if (key === "bulging") return raw === true || raw === "true" ? "是" : "否";
    const id = String(raw ?? "");
    switch (key) {
      case "storeId":
        return db.value.stores.find((x) => x.id === id)?.name ?? id;
      case "vehicleId":
        return db.value.vehicles.find((x) => x.id === id)?.plate ?? id;
      case "driverId":
        return db.value.drivers.find((x) => x.id === id)?.name ?? id;
      case "slotId": {
        const slot = db.value.slots.find((x) => x.id === id);
        return slot ? `${slot.code}（${slot.area}）` : id;
      }
      default:
        return id;
    }
  }

  function formatValue(wb: Waybill, key: string): string {
    const value = (wb as unknown as Record<string, unknown>)[key];
    return displayValue(key, value);
  }

  function stripUndefined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
  }

  function toDraft(wb: Waybill): DispatchDraft {
    return {
      storeId: wb.storeId,
      packCount: wb.packCount,
      maxTemp: wb.maxTemp,
      bulging: wb.bulging,
      vehicleId: wb.vehicleId,
      driverId: wb.driverId,
      shiftStart: wb.shiftStart,
      shiftEnd: wb.shiftEnd,
      slotId: wb.slotId
    };
  }

  function resetAll() {
    db.value = resetDatabase();
  }

  return {
    db,
    waybills,
    getById,
    createWaybill,
    confirmDispatch,
    registerArrival,
    resolveReview,
    amend,
    resetAll,
    isFrozen
  };
});
