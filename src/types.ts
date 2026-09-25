// 回收联单领域模型：只定义数据结构，不含任何业务判断与存储逻辑。

/** 联单生命周期状态 */
export type WaybillStatus =
  | "pending" // 待派车：已登记，等待核查并确认派车
  | "transporting" // 运输中：联单确认冻结，车辆与司机已占用
  | "review" // 待复核：数量不符或破损缺凭证，车辆与原库位继续锁定
  | "completed"; // 已入库：车辆与库位释放

/** 车辆温度防护能力 */
export type VehicleCapability = "standard" | "firebox"; // 普通车辆 / 带防火箱车辆

export interface Store {
  id: string;
  name: string;
  contact?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  capability: VehicleCapability;
  capacity: number; // 额定电池包装载数量
}

export interface Driver {
  id: string;
  name: string;
  phone?: string;
}

export type SlotStatus = "free" | "reserved" | "locked" | "stored";
// 空闲 / 已预占(运输中) / 复核锁定 / 已入库占用

export interface Slot {
  id: string;
  code: string;
  area: string; // 库区
}

/** 到库实收信息 */
export interface Arrival {
  receivedPacks: number; // 实收包数
  damagedPacks: number; // 破损数
  voucherNo: string; // 入库凭证号
  arrivedAt: string; // 到库时间 ISO
  operator: string; // 仓库接收人
}

/** 改单留痕 */
export interface Amendment {
  id: string;
  at: string; // ISO 时间
  operator: string;
  reason: string; // 改单原因
  changes: { field: string; oldValue: string; newValue: string }[];
}

/**
 * 校验问题编码：
 * DRIVER_SHIFT_OVERLAP 班次重叠（司机）
 * VEHICLE_SHIFT_OVERLAP 班次重叠（车辆）
 * VEHICLE_TEMP_MISMATCH 车辆温度能力不符（高温/鼓包却未派防火箱车辆）
 * VOUCHER_MISSING 凭证缺失（有破损但无入库凭证号）
 * QUANTITY_MISMATCH 数量不符（实收与发出不一致）
 * SLOT_TAKEN 库位已被占用
 */
export type IssueCode =
  | "DRIVER_SHIFT_OVERLAP"
  | "VEHICLE_SHIFT_OVERLAP"
  | "VEHICLE_TEMP_MISMATCH"
  | "VEHICLE_CAPACITY"
  | "VOUCHER_MISSING"
  | "QUANTITY_MISMATCH"
  | "SLOT_TAKEN";

export interface Issue {
  code: IssueCode;
  message: string;
  field?: string;
}

export interface Waybill {
  id: string;
  code: string; // 联单号 HS-YYYYMMDD-XXX
  storeId: string;
  packCount: number; // 电池包数量（发出）
  maxTemp: number; // 最高温度 ℃
  bulging: boolean; // 是否鼓包
  vehicleId: string;
  driverId: string;
  /** 运输时段（datetime-local 文本：YYYY-MM-DDTHH:mm） */
  shiftStart: string;
  shiftEnd: string;
  slotId: string; // 原库位（预占，复核完成前不释放）
  status: WaybillStatus;
  createdAt: string;
  dispatchedAt?: string;
  arrival?: Arrival;
  reviewNote?: string; // 待复核的复核结论（复核完成时填写）
  resolvedAt?: string; // 复核完成时间，此时释放车辆与原库位
  amendments: Amendment[];
}

/** 持久化到 localStorage 的整库数据 */
export interface Database {
  version: number;
  seq: number; // 联单号自增序列
  stores: Store[];
  vehicles: Vehicle[];
  drivers: Driver[];
  slots: Slot[];
  waybills: Waybill[];
}
