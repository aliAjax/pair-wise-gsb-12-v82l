// 规则冒烟测试：直接覆盖 src/rules + src/stores 的核心业务路径。
import assert from "node:assert";
import "./localStorage-shim.mjs";
import { createSeedDatabase } from "../src/data/seed.ts";
import {
  evaluateArrival,
  intervalsOverlap,
  needsFirebox,
  suggestVehicles,
  validateDispatch
} from "../src/rules/engine.ts";
import { createPinia, setActivePinia } from "pinia";
import { useWaybillStore } from "../src/stores/waybill.ts";

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log("✓", name);
}

// 1. 温度/鼓包 → 防火箱
ok("46℃ 需要防火箱", needsFirebox(46, false) === true);
ok("45℃ 整不需防火箱（超过45才要）", needsFirebox(45, false) === false);
ok("鼓包即使低温也需防火箱", needsFirebox(30, true) === true);

// 2. 时段重叠
ok("相邻时段不算重叠", intervalsOverlap("2026-09-25T08:00", "2026-09-25T11:00", "2026-09-25T11:00", "2026-09-25T13:00") === false);
ok("交叉时段算重叠", intervalsOverlap("2026-09-25T09:00", "2026-09-25T12:00", "2026-09-25T11:30", "2026-09-25T14:00") === true);

// 3. 派车核查：种子中 v-3 / d-3 在 2026-09-25 09:00-12:00 运输中
const db = createSeedDatabase();
const codes = (issues) => issues.map((i) => i.code).sort();

const highTempDraft = {
  storeId: "st-1", packCount: 5, maxTemp: 47, bulging: false,
  vehicleId: "v-1", driverId: "d-1",
  shiftStart: "2026-09-25T14:00", shiftEnd: "2026-09-25T17:00", slotId: "sl-2"
};
ok("高温派普通车 → VEHICLE_TEMP_MISMATCH",
  codes(validateDispatch(db, highTempDraft)).includes("VEHICLE_TEMP_MISMATCH"));

const suggestion = suggestVehicles(db, highTempDraft).map((v) => v.id);
ok("高温只建议防火箱车辆", suggestion.every((id) => db.vehicles.find((v) => v.id === id)?.capability === "firebox"));
ok("高温建议含 v-4（防火箱且空闲）", suggestion.includes("v-4"));

const overlapDraft = {
  storeId: "st-1", packCount: 5, maxTemp: 30, bulging: false,
  vehicleId: "v-1", driverId: "d-3",
  shiftStart: "2026-09-25T09:30", shiftEnd: "2026-09-25T10:30", slotId: "sl-2"
};
const overlapIssues = codes(validateDispatch(db, overlapDraft));
ok("司机班次重叠 → DRIVER_SHIFT_OVERLAP", overlapIssues.includes("DRIVER_SHIFT_OVERLAP"));

const vehicleOverlapDraft = { ...overlapDraft, driverId: "d-2", vehicleId: "v-3" };
ok("车辆班次重叠 → VEHICLE_SHIFT_OVERLAP", codes(validateDispatch(db, vehicleOverlapDraft)).includes("VEHICLE_SHIFT_OVERLAP"));

const capacityDraft = { ...highTempDraft, vehicleId: "v-4", maxTemp: 30 };
const capBig = { ...capacityDraft, packCount: 99 };
ok("超容量 → VEHICLE_CAPACITY", codes(validateDispatch(db, capBig)).includes("VEHICLE_CAPACITY"));

const slotDraft = { ...highTempDraft, vehicleId: "v-4", maxTemp: 30, slotId: "sl-3" };
ok("库位被进行中单据占用 → SLOT_TAKEN", codes(validateDispatch(db, slotDraft)).includes("SLOT_TAKEN"));
// 已入库单占用的库位应可再用
const slotFreed = { ...slotDraft, slotId: "sl-1" };
ok("已入库单释放的库位可再用", !codes(validateDispatch(db, slotFreed)).includes("SLOT_TAKEN"));

// 4. 到库核查
const base = db.waybills.find((w) => w.id === "seed-wb-2");
const arr = (patch) => evaluateArrival(base, {
  receivedPacks: base.packCount, damagedPacks: 0, voucherNo: "V1", arrivedAt: "", operator: "x", ...patch
});
ok("数量一致无破损 → completed", arr({}).status === "completed");
ok("数量不符 → review", arr({ receivedPacks: 9 }).status === "review");
ok("破损缺凭证 → review", arr({ damagedPacks: 2, voucherNo: "" }).status === "review");
ok("破损有凭证数量一致 → completed", arr({ damagedPacks: 2, voucherNo: "RK1" }).status === "completed");

// 5. Store 全流程 + 改单留痕
setActivePinia(createPinia());
// 用全新空库避免种子干扰：直接替换 localStorage 前置数据
const store = useWaybillStore();
store.resetAll();

const tomorrow = "2026-09-30T08:00";
const tomorrowEnd = "2026-09-30T11:00";
const createRes = store.createWaybill({
  storeId: "st-1", packCount: 6, maxTemp: 48, bulging: false,
  vehicleId: "v-1", driverId: "d-1", shiftStart: tomorrow, shiftEnd: tomorrowEnd, slotId: "sl-1"
});
ok("高温派普通车也可先登记为待派车（派车时再拦截）", createRes.ok === true);
ok("待派车状态", store.getById(createRes.id).status === "pending");
const confirmBlocked = store.confirmDispatch(createRes.id);
ok("确认派车时温度能力不符被拦截", confirmBlocked.ok === false);
ok("拦截原因明确为温度能力不符", confirmBlocked.issues.some((i) => i.code === "VEHICLE_TEMP_MISMATCH"));

const good = store.createWaybill({
  storeId: "st-1", packCount: 6, maxTemp: 48, bulging: false,
  vehicleId: "v-4", driverId: "d-1", shiftStart: tomorrow, shiftEnd: tomorrowEnd, slotId: "sl-1"
});
ok("防火箱车辆建单成功", good.ok === true);
const id = good.id;

// 待派车改单：不需原因，不留痕
const preAmend = store.amend(id, { packCount: 25 });
ok("待派车可直接改单", preAmend.ok === true);
ok("待派车改单不留痕", store.getById(id).amendments.length === 0);

const confirmBad = store.confirmDispatch(id);
ok("超容量时确认派车被拦截", confirmBad.ok === false);
store.amend(id, { packCount: 6 });
const confirmOk = store.confirmDispatch(id);
ok("核查通过后确认派车", confirmOk.ok === true);
ok("确认后联单冻结", store.isFrozen(store.getById(id)) === true);

// 冻结后无原因改单被拒
const noReason = store.amend(id, { vehicleId: "v-3" });
ok("冻结后改单缺原因被拒", noReason.ok === false);

// 冻结后改派重叠车辆被拒（v-3 在种子时段 9-25，不重叠，这里改成高温车能力校验：v-4→普通 v-1 高温不符）
const toStandard = store.amend(id, { vehicleId: "v-1", reason: "测试改派" });
ok("高温改派普通车被规则拦截", toStandard.ok === false);

const amendOk = store.amend(id, { slotId: "sl-2", reason: "A-01库位需要检修，改到A-02", operator: "调度王" });
ok("带原因的合规改单成功", amendOk.ok === true);
const wb = store.getById(id);
ok("改单保留旧值与原因", wb.amendments.length === 1 &&
  wb.amendments[0].reason.includes("检修") &&
  wb.amendments[0].changes[0].oldValue.includes("A-01") &&
  wb.amendments[0].changes[0].newValue.includes("A-02"));

// 到库数量不符 → 待复核，资源不释放
const arrivalRes = store.registerArrival(id, {
  receivedPacks: 5, damagedPacks: 0, voucherNo: "", arrivedAt: "", operator: "仓管李"
});
ok("实收数量不符进入待复核", arrivalRes.status === "review");

// 复核完成：数量差异允许（有结论即可），但无凭证破损仍拦截
const resolveNoNote = store.resolveReview(id, {
  receivedPacks: 5, damagedPacks: 0, voucherNo: "RK9", reviewNote: ""
});
ok("无复核结论不能放行", resolveNoNote.ok === false);
const resolveDone = store.resolveReview(id, {
  receivedPacks: 5, damagedPacks: 0, voucherNo: "RK9", reviewNote: "1包遗失，门店已开差异单，凭RK9入库"
});
ok("复核完成放行", resolveDone.ok === true);
ok("复核后状态为已入库并释放资源", store.getById(id).status === "completed");

// 资源释放后：同车辆同时段可再派、同库位可再用
const reuse = store.createWaybill({
  storeId: "st-2", packCount: 6, maxTemp: 48, bulging: false,
  vehicleId: "v-4", driverId: "d-1", shiftStart: tomorrow, shiftEnd: tomorrowEnd, slotId: "sl-2"
});
ok("释放后车辆与库位可被新单使用", reuse.ok === true);

console.log(`\n全部 ${passed} 项规则冒烟测试通过`);
