// 业务规则层：纯函数，不读写存储、不依赖页面。
// 所有"能不能派车 / 要不要防火箱 / 是否进待复核 / 资源是否释放"的判断都在这里。
import type {
  Arrival,
  Database,
  Issue,
  IssueCode,
  Vehicle,
  Waybill,
  WaybillStatus
} from "../types";

export const TEMP_LIMIT = 45; // 超过该温度（℃）必须使用防火箱车辆

/** 阻断派车的问题（不区分具体编码时统一判断） */
export const ISSUE_TEXT: Record<IssueCode, string> = {
  DRIVER_SHIFT_OVERLAP: "班次重叠：该司机在同一时段已有其他回收联单任务",
  VEHICLE_SHIFT_OVERLAP: "班次重叠：该车辆在同一时段已被其他回收联单占用",
  VEHICLE_TEMP_MISMATCH:
    "车辆温度能力不符：最高温度超过45℃或电池鼓包，必须改派带防火箱的车辆",
  VEHICLE_CAPACITY: "车辆容量不足：所选车辆额定装载量小于电池包数量，请改派车辆",
  VOUCHER_MISSING: "凭证缺失：存在破损电池包但未填写入库凭证号",
  QUANTITY_MISMATCH: "数量不符：司机到库实收包数与门店登记发出包数不一致",
  SLOT_TAKEN: "原库位已被其他进行中的联单占用"
};

/** 派车登记输入 */
export interface DispatchDraft {
  storeId: string;
  packCount: number;
  maxTemp: number;
  bulging: boolean;
  vehicleId: string;
  driverId: string;
  shiftStart: string;
  shiftEnd: string;
  slotId: string;
}

export function toTime(value: string): number {
  return new Date(value).getTime();
}

export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = toTime(aStart);
  const ae = toTime(aEnd);
  const bs = toTime(bStart);
  const be = toTime(bEnd);
  if ([as, ae, bs, be].some((t) => Number.isNaN(t))) return false;
  return as < be && bs < ae;
}

/** 高温或鼓包 → 需要防火箱车辆 */
export function needsFirebox(maxTemp: number, bulging: boolean): boolean {
  return maxTemp > TEMP_LIMIT || bulging;
}

/**
 * 资源（车辆 / 司机 / 库位）被实际占用的状态：
 * 运输中、待复核；待派车草稿与已入库单都不占用。
 * 待复核完成前不释放，复核完成（completed）才释放。
 */
export function isActive(status: WaybillStatus): boolean {
  return status === "transporting" || status === "review";
}

function otherActiveWaybills(db: Database, selfId?: string): Waybill[] {
  return db.waybills.filter((wb) => wb.id !== selfId && isActive(wb.status));
}

/**
 * 核查级别：
 * - "dispatch"（默认）：确认派车前的完整核查（班次重叠 / 温度能力 / 容量 / 库位）；
 * - "draft"：登记或待派车草稿修改时，只核查与其他在途单冲突的硬占用（库位），
 *   车辆/司机/温度/容量等留给"确认派车"时拦截并说明原因。
 */
export type CheckLevel = "draft" | "dispatch";

export function validateDispatch(
  db: Database,
  draft: DispatchDraft,
  selfId?: string,
  level: CheckLevel = "dispatch"
): Issue[] {
  const issues: Issue[] = [];
  const others = otherActiveWaybills(db, selfId);

  const start = toTime(draft.shiftStart);
  const end = toTime(draft.shiftEnd);
  if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
    issues.push({
      code: "VEHICLE_SHIFT_OVERLAP",
      message: "时段设置有误：结束时间必须晚于开始时间",
      field: "shiftEnd"
    });
  }

  if (level === "dispatch") {
    const overlap = (wb: Waybill) =>
      intervalsOverlap(draft.shiftStart, draft.shiftEnd, wb.shiftStart, wb.shiftEnd);

    if (others.some((wb) => wb.vehicleId === draft.vehicleId && overlap(wb))) {
      issues.push({ code: "VEHICLE_SHIFT_OVERLAP", message: ISSUE_TEXT.VEHICLE_SHIFT_OVERLAP, field: "vehicleId" });
    }
    if (others.some((wb) => wb.driverId === draft.driverId && overlap(wb))) {
      issues.push({ code: "DRIVER_SHIFT_OVERLAP", message: ISSUE_TEXT.DRIVER_SHIFT_OVERLAP, field: "driverId" });
    }

    const vehicle = db.vehicles.find((v) => v.id === draft.vehicleId);
    if (vehicle && needsFirebox(draft.maxTemp, draft.bulging) && vehicle.capability !== "firebox") {
      issues.push({ code: "VEHICLE_TEMP_MISMATCH", message: ISSUE_TEXT.VEHICLE_TEMP_MISMATCH, field: "vehicleId" });
    }

    if (vehicle && draft.packCount > vehicle.capacity) {
      issues.push({
        code: "VEHICLE_CAPACITY",
        message: `${ISSUE_TEXT.VEHICLE_CAPACITY}（本单 ${draft.packCount} 包，该车辆额定 ${vehicle.capacity} 包）`,
        field: "vehicleId"
      });
    }
  }

  if (others.some((wb) => wb.slotId === draft.slotId)) {
    issues.push({ code: "SLOT_TAKEN", message: ISSUE_TEXT.SLOT_TAKEN, field: "slotId" });
  }

  return issues;
}

/** 智能改派建议：高温/鼓包只列防火箱车辆，并按时段空闲、容量充足过滤 */
export function suggestVehicles(db: Database, draft: DispatchDraft, selfId?: string): Vehicle[] {
  const fireboxRequired = needsFirebox(draft.maxTemp, draft.bulging);
  return db.vehicles
    .filter((v) => (fireboxRequired ? v.capability === "firebox" : true))
    .filter((v) => v.capacity >= draft.packCount)
    .filter((v) =>
      otherActiveWaybills(db, selfId).every(
        (wb) =>
          wb.vehicleId !== v.id ||
          !intervalsOverlap(draft.shiftStart, draft.shiftEnd, wb.shiftStart, wb.shiftEnd)
      )
    );
}

/** 推荐司机：该时段无班次重叠 */
export function suggestDriverIds(db: Database, draft: DispatchDraft, selfId?: string): Set<string> {
  const busy = new Set(
    otherActiveWaybills(db, selfId)
      .filter((wb) => intervalsOverlap(draft.shiftStart, draft.shiftEnd, wb.shiftStart, wb.shiftEnd))
      .map((wb) => wb.driverId)
  );
  return new Set(db.drivers.filter((d) => !busy.has(d.id)).map((d) => d.id));
}

/**
 * 到库接收核查。
 * - 实收包数与发出数不符 → 待复核
 * - 有破损但缺少入库凭证号 → 待复核
 * - 其余 → 已入库，释放车辆与原库位
 */
export function evaluateArrival(
  waybill: Waybill,
  arrival: Arrival
): { status: WaybillStatus; issues: Issue[] } {
  const issues: Issue[] = [];
  if (arrival.receivedPacks !== waybill.packCount) {
    issues.push({
      code: "QUANTITY_MISMATCH",
      message: `${ISSUE_TEXT.QUANTITY_MISMATCH}（发出 ${waybill.packCount} 包 / 实收 ${arrival.receivedPacks} 包，差异 ${
        arrival.receivedPacks - waybill.packCount
      } 包）`
    });
  }
  if (arrival.damagedPacks > 0 && !arrival.voucherNo.trim()) {
    issues.push({ code: "VOUCHER_MISSING", message: ISSUE_TEXT.VOUCHER_MISSING });
  }
  if (arrival.damagedPacks > arrival.receivedPacks) {
    issues.push({ code: "QUANTITY_MISMATCH", message: "破损数不能大于实收包数" });
  }
  return { status: issues.length > 0 ? "review" : "completed", issues };
}

/** 复核完成：车辆与原库位在此刻才释放 */
export function canReleaseResources(status: WaybillStatus): boolean {
  return status === "completed";
}

export const STATUS_TEXT: Record<WaybillStatus, string> = {
  pending: "待派车",
  transporting: "运输中",
  review: "待复核",
  completed: "已入库"
};

/** 生成联单号 HS-YYYYMMDD-XXX */
export function nextWaybillCode(db: Database, now = new Date()): string {
  db.seq += 1;
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `HS-${ymd}-${String(db.seq).padStart(3, "0")}`;
}

/** 联单确认（派车）后冻结，普通字段只能改单 */
export function isFrozen(wb: Waybill): boolean {
  return wb.status !== "pending";
}
