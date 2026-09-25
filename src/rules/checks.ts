// 规则层：全部为纯函数，不依赖 Vue / localStorage，可单独测试
import type {
  DispatchInfo,
  DispatchInput,
  Issue,
  OrderStatus,
  ReceiptInput,
  RecycleOrder,
} from "../types";

/** 温度红线：超过 45℃ 必须使用带防火箱的车辆 */
export const TEMP_LIMIT = 45;

/** 会占用车辆、司机、库位的联单状态（待复核期间不释放） */
export const OCCUPYING_STATUSES: OrderStatus[] = ["已派车", "待复核"];

export interface DispatchContext {
  order: RecycleOrder;
  input: DispatchInput;
  /** 候选车辆是否带防火箱 */
  vehicleHasFireBox: boolean;
  /** 除本联单外的其他联单 */
  others: RecycleOrder[];
  driverName: (id: string) => string;
}

/** 温度超 45℃ 或有鼓包，即触发防火箱派车规则，必须改派带防火箱的车辆 */
export function fireBoxRequired(maxTemp: number, bulged: boolean): boolean {
  return maxTemp > TEMP_LIMIT || bulged;
}

function toTime(value: string): number {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

export function isWindowValid(input: DispatchInput): boolean {
  const start = toTime(input.planStart);
  const end = toTime(input.planEnd);
  return !Number.isNaN(start) && !Number.isNaN(end) && end > start;
}

/** 两个运输时段是否重叠（端点相接不算重叠） */
export function windowsOverlap(a: DispatchInfo, b: DispatchInput): boolean {
  const as = toTime(a.planStart);
  const ae = toTime(a.planEnd);
  const bs = toTime(b.planStart);
  const be = toTime(b.planEnd);
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return bs < ae && as < be;
}

function fmtWindow(d: DispatchInfo): string {
  return `${d.planStart.slice(5, 16).replace("T", " ")} ~ ${d.planEnd
    .slice(5, 16)
    .replace("T", " ")}`;
}

/**
 * 派车前核查，三类典型原因分别给出独立编码与说明：
 * - SHIFT_OVERLAP 班次重叠：车辆/司机在其他在途联单的运输时段内
 * - RESOURCE_LOCKED 资源未释放：车辆/司机挂在待复核联单上，复核完成前不释放
 * - TEMP_CAPABILITY 车辆温度能力不符：高温/鼓包却派无防火箱车辆，需改派
 * - SLOT_OCCUPIED 原库位未释放：库位被其他在途/待复核联单占用
 */
export function checkDispatch(ctx: DispatchContext): Issue[] {
  const { order, input, vehicleHasFireBox, others, driverName } = ctx;
  const issues: Issue[] = [];

  if (!isWindowValid(input)) {
    issues.push({
      code: "WINDOW_INVALID",
      message: "运输时段不合法：开始时间需早于结束时间，且均不能为空",
    });
    return issues;
  }

  if (fireBoxRequired(order.maxTemp, order.bulged) && !vehicleHasFireBox) {
    const reasons: string[] = [];
    if (order.maxTemp > TEMP_LIMIT) reasons.push(`最高温度 ${order.maxTemp}℃ 超过 ${TEMP_LIMIT}℃`);
    if (order.bulged) reasons.push("存在电池鼓包");
    issues.push({
      code: "TEMP_CAPABILITY",
      message: `车辆温度能力不符：${reasons.join("、")}，须改派带防火箱的车辆`,
    });
  }

  for (const other of others) {
    if (!OCCUPYING_STATUSES.includes(other.status) || !other.dispatch) continue;
    if (!windowsOverlap(other.dispatch, input)) continue;

    if (other.dispatch.vehicleId === input.vehicleId) {
      issues.push(
        other.status === "待复核"
          ? {
              code: "RESOURCE_LOCKED",
              message: `车辆在联单 ${other.orderNo} 中处于待复核，车辆尚未释放，复核完成前不能派车`,
            }
          : {
              code: "SHIFT_OVERLAP",
              message: `班次重叠：车辆该时段已被联单 ${other.orderNo} 占用（${fmtWindow(
                other.dispatch
              )}）`,
            }
      );
    }

    if (other.dispatch.driverId === input.driverId) {
      issues.push(
        other.status === "待复核"
          ? {
              code: "RESOURCE_LOCKED",
              message: `司机 ${driverName(other.dispatch.driverId)} 在联单 ${
                other.orderNo
              } 中处于待复核，司机尚未释放，复核完成前不能派车`,
            }
          : {
              code: "SHIFT_OVERLAP",
              message: `班次重叠：司机 ${driverName(other.dispatch.driverId)} 该时段已被联单 ${
                other.orderNo
              } 占用（${fmtWindow(other.dispatch)}）`,
            }
      );
    }

    if (other.dispatch.slotCode === input.slotCode) {
      issues.push({
        code: "SLOT_OCCUPIED",
        message: `原库位 ${other.dispatch.slotCode} 被联单 ${other.orderNo} 占用（${
          other.status === "待复核" ? "待复核未释放" : "尚未到库"
        }），不能重复预占`,
      });
    }
  }

  return issues;
}

export interface ReceiptCheckResult {
  /** 阻止录入的数据问题（需当场改数） */
  errors: Issue[];
  /** 触发待复核的问题（数量不符 / 凭证缺失） */
  holds: Issue[];
}

/**
 * 到库录入核查：
 * - 实收未填 / 破损数非法 / 破损大于实收：阻止提交
 * - 实收 ≠ 出车包数：数量不符，停进待复核
 * - 有破损但缺入库凭证号：凭证缺失，停进待复核
 */
export function checkReceipt(order: RecycleOrder, input: ReceiptInput): ReceiptCheckResult {
  const errors: Issue[] = [];
  const holds: Issue[] = [];

  const received = input.receivedPacks;
  if (received === null || received === undefined || Number.isNaN(received) || received < 0) {
    errors.push({ code: "RECV_INCOMPLETE", message: "请录入实收包数（非负整数）" });
    return { errors, holds };
  }
  if (input.damagedPacks < 0) {
    errors.push({ code: "RECV_INCOMPLETE", message: "破损数不能为负" });
    return { errors, holds };
  }
  if (input.damagedPacks > received) {
    errors.push({
      code: "DAMAGED_EXCEED",
      message: `破损数 ${input.damagedPacks} 不能大于实收包数 ${received}`,
    });
  }

  if (received !== order.packCount) {
    const diff = received - order.packCount;
    holds.push({
      code: "RECV_MISMATCH",
      message: `数量不符：出车 ${order.packCount} 包，实收 ${received} 包（${
        diff > 0 ? `多 ${diff}` : `少 ${-diff}`
      } 包），联单停进待复核，车辆与原库位暂不释放`,
    });
  }
  if (input.damagedPacks > 0 && !input.voucherNo.trim()) {
    holds.push({
      code: "VOUCHER_MISSING",
      message: `有 ${input.damagedPacks} 包破损但未填入库凭证号，凭证缺失，联单停进待复核`,
    });
  }

  return { errors, holds };
}
