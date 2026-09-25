// 数据层：门店、车辆、司机、库位等基础档案与初始演示数据
import { fireBoxRequired } from "../rules/checks";
import type { AppData, DispatchInfo, RecycleOrder } from "../types";

const now = Date.now();
const iso = (offsetMin: number) => new Date(now + offsetMin * 60000).toISOString();
function dispatch(
  partial: Omit<DispatchInfo, "dispatchedAt" | "fireBoxRequired"> & {
    maxTemp: number;
    bulged: boolean;
  }
): DispatchInfo {
  const { maxTemp, bulged, ...rest } = partial;
  return { ...rest, fireBoxRequired: fireBoxRequired(maxTemp, bulged), dispatchedAt: iso(-60) };
}

const orders: RecycleOrder[] = [
  {
    id: "seed-order-1",
    orderNo: "HS-20260925-001",
    storeId: "store-1",
    packCount: 20,
    maxTemp: 38,
    bulged: false,
    remark: "门店常规退役包，托盘完好",
    createdAt: iso(-180),
    status: "已派车",
    dispatch: dispatch({
      vehicleId: "v1",
      driverId: "d1",
      slotCode: "A-01",
      planStart: iso(-30),
      planEnd: iso(150),
      maxTemp: 38,
      bulged: false,
    }),
    holdIssues: [],
    history: [
      {
        id: "seed-h-1",
        at: iso(-180),
        action: "登记",
        changes: [],
      },
      {
        id: "seed-h-2",
        at: iso(-60),
        action: "派车",
        changes: [],
      },
    ],
  },
  {
    id: "seed-order-2",
    orderNo: "HS-20260925-002",
    storeId: "store-2",
    packCount: 16,
    maxTemp: 52,
    bulged: false,
    remark: "温控告警，最高温度偏高",
    createdAt: iso(-240),
    status: "待复核",
    dispatch: dispatch({
      vehicleId: "v3",
      driverId: "d3",
      slotCode: "B-02",
      planStart: iso(-200),
      planEnd: iso(-20),
      maxTemp: 52,
      bulged: false,
    }),
    receipt: {
      receivedPacks: 15,
      damagedPacks: 1,
      voucherNo: "",
      receivedAt: iso(-20),
    },
    holdIssues: [
      {
        code: "RECV_MISMATCH",
        message: "数量不符：出车 16 包，实收 15 包（少 1 包），联单停进待复核，车辆与原库位暂不释放",
      },
      {
        code: "VOUCHER_MISSING",
        message: "有 1 包破损但未填入库凭证号，凭证缺失，联单停进待复核",
      },
    ],
    history: [
      { id: "seed-h-3", at: iso(-240), action: "登记", changes: [] },
      { id: "seed-h-4", at: iso(-210), action: "派车", changes: [] },
      { id: "seed-h-5", at: iso(-20), action: "到库录入", changes: [] },
    ],
  },
  {
    id: "seed-order-3",
    orderNo: "HS-20260925-003",
    storeId: "store-3",
    packCount: 12,
    maxTemp: 33,
    bulged: false,
    remark: "",
    createdAt: iso(-90),
    status: "待派车",
    holdIssues: [],
    history: [{ id: "seed-h-6", at: iso(-90), action: "登记", changes: [] }],
  },
];

export function buildSeedData(): AppData {
  return {
    version: 1,
    seq: 4,
    stores: [
      { id: "store-1", name: "城北门店" },
      { id: "store-2", name: "城东门店" },
      { id: "store-3", name: "城南门店" },
    ],
    vehicles: [
      { id: "v1", plate: "沪A-82L6", hasFireBox: false },
      { id: "v2", plate: "沪B-73K9", hasFireBox: false },
      { id: "v3", plate: "沪F-51H0", hasFireBox: true },
    ],
    drivers: [
      { id: "d1", name: "董飞" },
      { id: "d2", name: "周航" },
      { id: "d3", name: "林越" },
    ],
    slots: [
      { id: "s1", code: "A-01" },
      { id: "s2", code: "A-02" },
      { id: "s3", code: "B-02" },
    ],
    orders,
  };
}
