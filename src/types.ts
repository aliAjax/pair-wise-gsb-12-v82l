// 领域模型：回收联单、车辆、司机、门店、库位
// 数据层只定义结构，不写任何业务判断（规则见 rules/checks.ts）

export type OrderStatus =
  | "待派车"
  | "已派车"
  | "待复核"
  | "已完成"
  | "已取消";

/** 承运车辆：防火箱是高温/鼓包电池的硬性能力要求 */
export interface Vehicle {
  id: string;
  plate: string;
  hasFireBox: boolean;
}

export interface Driver {
  id: string;
  name: string;
}

export interface StoreInfo {
  id: string;
  name: string;
}

/** 仓库库位，联单派车时预占，待复核期间不释放 */
export interface Slot {
  id: string;
  code: string;
}

export type IssueTone = "danger" | "warn" | "info";

/** 核查问题编码：班次重叠 / 温度能力不符 / 凭证缺失等各自独立，便于分别说明原因 */
export type IssueCode =
  | "WINDOW_INVALID"
  | "SHIFT_OVERLAP"
  | "RESOURCE_LOCKED"
  | "SLOT_OCCUPIED"
  | "TEMP_CAPABILITY"
  | "RECV_INCOMPLETE"
  | "DAMAGED_EXCEED"
  | "RECV_MISMATCH"
  | "VOUCHER_MISSING"
  | "AMEND_CAPABILITY"
  | "STATUS_CONFLICT";

export interface Issue {
  code: IssueCode;
  /** 面向调度员的具体原因说明 */
  message: string;
}

/** 派车联：承运车辆、司机、原库位、运输时段 */
export interface DispatchInfo {
  vehicleId: string;
  driverId: string;
  slotCode: string;
  planStart: string; // ISO 时间
  planEnd: string;
  fireBoxRequired: boolean;
  dispatchedAt: string;
}

/** 到库录入联：实收包数、破损数、入库凭证号 */
export interface ReceiptInfo {
  receivedPacks: number;
  damagedPacks: number;
  voucherNo: string;
  receivedAt: string;
}

export interface ReviewInfo {
  reviewer: string;
  conclusion: string;
  reviewedAt: string;
}

export interface ChangeItem {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

/** 改单/流转痕迹：联单确认后每次改单都保留旧值与原因 */
export interface ChangeEntry {
  id: string;
  at: string;
  action: "登记" | "派车" | "改派" | "到库录入" | "复核完成" | "改单" | "取消";
  reason?: string;
  changes: ChangeItem[];
}

export interface RecycleOrder {
  id: string;
  /** 回收联单号，如 HS-20260925-003 */
  orderNo: string;
  storeId: string;
  packCount: number;
  maxTemp: number; // 最高温度 ℃
  bulged: boolean; // 是否存在电池鼓包
  remark: string;
  createdAt: string;
  status: OrderStatus;
  dispatch?: DispatchInfo;
  receipt?: ReceiptInfo;
  review?: ReviewInfo;
  /** 进入待复核的原因（数量不符 / 凭证缺失分别列出） */
  holdIssues: Issue[];
  history: ChangeEntry[];
}

export interface RegistrationInput {
  storeId: string;
  packCount: number;
  maxTemp: number;
  bulged: boolean;
  remark: string;
}

export interface DispatchInput {
  vehicleId: string;
  driverId: string;
  slotCode: string;
  planStart: string;
  planEnd: string;
}

export interface ReceiptInput {
  receivedPacks: number | null;
  damagedPacks: number;
  voucherNo: string;
}

export interface AppData {
  version: number;
  seq: number;
  stores: StoreInfo[];
  vehicles: Vehicle[];
  drivers: Driver[];
  slots: Slot[];
  orders: RecycleOrder[];
}

export interface FilterState {
  storeId: string;
  vehicleId: string;
  status: OrderStatus | "全部";
  keyword: string;
}
