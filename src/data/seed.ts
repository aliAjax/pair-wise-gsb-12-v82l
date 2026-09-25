// 初始演示数据：门店、车辆（含防火箱能力）、司机、库位。
import type { Database } from "../types";

export function createSeedDatabase(): Database {
  return {
    version: 1,
    seq: 2,
    stores: [
      { id: "st-1", name: "城东旗舰店", contact: "王店长 13800010001" },
      { id: "st-2", name: "城北服务中心", contact: "李店长 13800020002" },
      { id: "st-3", name: "城南换电站", contact: "赵店长 13800030003" }
    ],
    vehicles: [
      { id: "v-1", plate: "沪A·82L6", capability: "standard", capacity: 30 },
      { id: "v-2", plate: "沪B·73K9", capability: "standard", capacity: 24 },
      { id: "v-3", plate: "沪D·55F1（防火箱）", capability: "firebox", capacity: 20 },
      { id: "v-4", plate: "沪E·90T7（防火箱）", capability: "firebox", capacity: 18 }
    ],
    drivers: [
      { id: "d-1", name: "董飞", phone: "13911110001" },
      { id: "d-2", name: "周航", phone: "13911120002" },
      { id: "d-3", name: "陈默", phone: "13911130003" }
    ],
    slots: [
      { id: "sl-1", code: "A-01", area: "A区（常温）" },
      { id: "sl-2", code: "A-02", area: "A区（常温）" },
      { id: "sl-3", code: "B-01", area: "B区（防火）" },
      { id: "sl-4", code: "B-02", area: "B区（防火）" },
      { id: "sl-5", code: "B-03", area: "B区（防火）" }
    ],
    waybills: [
      {
        id: "seed-wb-1",
        code: "HS-20260924-001",
        storeId: "st-2",
        packCount: 12,
        maxTemp: 36,
        bulging: false,
        vehicleId: "v-1",
        driverId: "d-1",
        shiftStart: "2026-09-24T08:00",
        shiftEnd: "2026-09-24T11:00",
        slotId: "sl-1",
        status: "completed",
        createdAt: "2026-09-24T07:30:00.000Z",
        dispatchedAt: "2026-09-24T08:05:00.000Z",
        arrival: {
          receivedPacks: 12,
          damagedPacks: 0,
          voucherNo: "RK2026092401",
          arrivedAt: "2026-09-24T10:40:00.000Z",
          operator: "仓管·孙倩"
        },
        amendments: []
      },
      {
        id: "seed-wb-2",
        code: "HS-20260924-002",
        storeId: "st-3",
        packCount: 10,
        maxTemp: 47,
        bulging: true,
        vehicleId: "v-3",
        driverId: "d-3",
        shiftStart: "2026-09-25T09:00",
        shiftEnd: "2026-09-25T12:00",
        slotId: "sl-3",
        status: "transporting",
        createdAt: "2026-09-25T08:10:00.000Z",
        dispatchedAt: "2026-09-25T09:00:00.000Z",
        amendments: []
      }
    ]
  };
}
