import {
  checkDispatch,
  checkReceipt,
  fireBoxRequired,
  windowsOverlap,
} from "./../src/rules/checks";
import type { DispatchInfo, RecycleOrder } from "./../src/types";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error("FAIL:", msg);
  }
}

// 1. 防火箱规则：>45℃ 或鼓包
assert(fireBoxRequired(46, false) === true, "46℃ 需要防火箱");
assert(fireBoxRequired(45, false) === false, "正好45℃ 不需要");
assert(fireBoxRequired(30, true) === true, "鼓包需要防火箱");
assert(fireBoxRequired(30, false) === false, "低温无鼓包不需要");

const d: DispatchInfo = {
  vehicleId: "v1",
  driverId: "d1",
  slotCode: "A-01",
  planStart: "2026-09-25T10:00:00.000Z",
  planEnd: "2026-09-25T12:00:00.000Z",
  fireBoxRequired: false,
  dispatchedAt: "2026-09-25T09:00:00.000Z",
};

// 2. 时段重叠
assert(
  windowsOverlap(d, {
    vehicleId: "v2",
    driverId: "d2",
    slotCode: "A-02",
    planStart: "2026-09-25T11:00:00.000Z",
    planEnd: "2026-09-25T13:00:00.000Z",
  }) === true,
  "重叠时段应判定为重叠"
);
assert(
  windowsOverlap(d, {
    vehicleId: "v2",
    driverId: "d2",
    slotCode: "A-02",
    planStart: "2026-09-25T12:00:00.000Z",
    planEnd: "2026-09-25T13:00:00.000Z",
  }) === false,
  "端点相接不算重叠"
);

const baseOrder = (over: Partial<RecycleOrder>): RecycleOrder =>
  ({
    id: "new",
    orderNo: "HS-NEW",
    storeId: "store-1",
    packCount: 10,
    maxTemp: 30,
    bulged: false,
    remark: "",
    createdAt: "",
    status: "待派车",
    holdIssues: [],
    history: [],
    ...over,
  } as RecycleOrder);

const other = baseOrder({
  id: "o1",
  orderNo: "HS-001",
  status: "已派车",
  dispatch: d,
});

const ctx = (inputOver: Record<string, unknown>, others = [other], orderOver: Partial<RecycleOrder> = {}) =>
  checkDispatch({
    order: baseOrder(orderOver),
    input: {
      vehicleId: "v1",
      driverId: "d1",
      slotCode: "A-02",
      planStart: "2026-09-25T11:00:00.000Z",
      planEnd: "2026-09-25T13:00:00.000Z",
      ...inputOver,
    } as never,
    vehicleHasFireBox: false,
    others,
    driverName: () => "董飞",
  });

// 3. 班次重叠：同车/同司机在重叠时段
let issues = ctx({});
assert(issues.some((i) => i.code === "SHIFT_OVERLAP"), "同车时段重叠应报 SHIFT_OVERLAP");
assert(issues.filter((i) => i.code === "SHIFT_OVERLAP").length === 2, "车辆与司机应分别报重叠原因");

// 4. 温度能力不符
issues = ctx(
  { vehicleId: "v2", driverId: "d2" },
  [],
  { maxTemp: 47, bulged: false }
);
assert(issues.some((i) => i.code === "TEMP_CAPABILITY"), "47℃派普通车应报 TEMP_CAPABILITY");
assert(issues.every((i) => i.code !== "SHIFT_OVERLAP"), "换车换司机不应报重叠");

issues = ctx(
  { vehicleId: "v2", driverId: "d2" },
  [],
  { maxTemp: 47, bulged: false }
);
// 带防火箱车不应报能力问题
issues = checkDispatch({
  order: baseOrder({ maxTemp: 47 }),
  input: {
    vehicleId: "v3",
    driverId: "d2",
    slotCode: "A-02",
    planStart: "2026-09-25T11:00:00.000Z",
    planEnd: "2026-09-25T13:00:00.000Z",
  },
  vehicleHasFireBox: true,
  others: [],
  driverName: () => "董飞",
});
assert(issues.length === 0, "防火箱车承运高温电池应无问题");

// 5. 待复核未释放 → RESOURCE_LOCKED
const locked = baseOrder({ id: "o2", orderNo: "HS-002", status: "待复核", dispatch: d });
issues = ctx({}, [locked]);
assert(issues.some((i) => i.code === "RESOURCE_LOCKED"), "待复核联单占用车辆应报 RESOURCE_LOCKED");
assert(!issues.some((i) => i.code === "SHIFT_OVERLAP"), "待复核不应只报普通重叠");

// 6. 库位占用
issues = ctx({ slotCode: "A-01" }, [other]);
assert(issues.some((i) => i.code === "SLOT_OCCUPIED"), "同库位应报 SLOT_OCCUPIED");

// 7. 非法时段
issues = ctx({ planStart: "", planEnd: "" }, [other]);
assert(issues.some((i) => i.code === "WINDOW_INVALID"), "空时段应报 WINDOW_INVALID");

// 8. 到库核查
const order = baseOrder({ packCount: 10 });
let r = checkReceipt(order, { receivedPacks: 10, damagedPacks: 0, voucherNo: "" });
assert(r.errors.length === 0 && r.holds.length === 0, "数量一致无破损应直接完成");

r = checkReceipt(order, { receivedPacks: 9, damagedPacks: 0, voucherNo: "" });
assert(r.holds.some((i) => i.code === "RECV_MISMATCH"), "少1包应停进待复核（数量不符）");

r = checkReceipt(order, { receivedPacks: 10, damagedPacks: 2, voucherNo: "" });
assert(r.holds.some((i) => i.code === "VOUCHER_MISSING"), "破损无凭证应停进待复核");

r = checkReceipt(order, { receivedPacks: 10, damagedPacks: 2, voucherNo: "RK-1" });
assert(r.holds.length === 0, "破损有凭证不应挂起");

r = checkReceipt(order, { receivedPacks: 10, damagedPacks: 11, voucherNo: "RK-1" });
assert(r.errors.some((i) => i.code === "DAMAGED_EXCEED"), "破损大于实收应阻止提交");

r = checkReceipt(order, { receivedPacks: null, damagedPacks: 0, voucherNo: "" });
assert(r.errors.some((i) => i.code === "RECV_INCOMPLETE"), "实收未填应阻止");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
