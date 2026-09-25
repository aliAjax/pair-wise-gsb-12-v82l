// 状态编排层：页面操作入口；规则调用 rules，落盘调用 storage，不掺 UI
import { defineStore } from "pinia";
import {
  checkDispatch,
  checkReceipt,
  fireBoxRequired,
} from "../rules/checks";
import { loadData, saveData } from "../storage/local";
import type {
  AppData,
  ChangeEntry,
  ChangeItem,
  DispatchInput,
  Issue,
  ReceiptInput,
  RecycleOrder,
  RegistrationInput,
} from "../types";

interface ActionResult {
  ok: boolean;
  /** 阻止操作的核查问题（如班次重叠、温度能力不符、凭证缺失） */
  issues?: Issue[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextOrderNo(seq: number, date = new Date()): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}`;
  return `HS-${ymd}-${String(seq).padStart(3, "0")}`;
}

export const useRecycleStore = defineStore("recycle", {
  state: (): AppData => loadData(),

  getters: {
    vehicleMap: (s) => new Map(s.vehicles.map((v) => [v.id, v])),
    driverMap: (s) => new Map(s.drivers.map((d) => [d.id, d])),
    storeMap: (s) => new Map(s.stores.map((st) => [st.id, st])),
    ordersByTime: (s) => [...s.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  },

  actions: {
    persist() {
      saveData(this.$state as AppData);
    },

    byId(id: string): RecycleOrder | undefined {
      return this.orders.find((o) => o.id === id);
    },

    driverName(id: string): string {
      return this.driverMap.get(id)?.name ?? id;
    },

    vehicleName(id: string): string {
      return this.vehicleMap.get(id)?.plate ?? id;
    },

    storeName(id: string): string {
      return this.storeMap.get(id)?.name ?? id;
    },

    /** 联单是否需要防火箱（温度超 45℃ 或鼓包） */
    needsFireBox(order: RecycleOrder): boolean {
      return fireBoxRequired(order.maxTemp, order.bulged);
    },

    addHistory(order: RecycleOrder, action: ChangeEntry["action"], changes: ChangeItem[], reason?: string) {
      order.history.push({
        id: crypto.randomUUID(),
        at: nowIso(),
        action,
        reason,
        changes,
      });
    },

    // ① 门店登记回收联单（回收单第一联）
    register(input: RegistrationInput): RecycleOrder {
      const order: RecycleOrder = {
        id: crypto.randomUUID(),
        orderNo: nextOrderNo(this.seq),
        storeId: input.storeId,
        packCount: input.packCount,
        maxTemp: input.maxTemp,
        bulged: input.bulged,
        remark: input.remark,
        createdAt: nowIso(),
        status: "待派车",
        holdIssues: [],
        history: [],
      };
      this.addHistory(order, "登记", [
        { field: "storeId", label: "门店", oldValue: "", newValue: this.storeName(input.storeId) },
        { field: "packCount", label: "电池包数量", oldValue: "", newValue: String(input.packCount) },
        { field: "maxTemp", label: "最高温度", oldValue: "", newValue: `${input.maxTemp}℃` },
        {
          field: "bulged",
          label: "是否鼓包",
          oldValue: "",
          newValue: input.bulged ? "是" : "否",
        },
      ]);
      this.orders.unshift(order);
      this.seq += 1;
      this.persist();
      return order;
    },

    // ② 派车前核查车辆/司机时段与温度能力，通过后冻结运输联
    dispatch(orderId: string, input: DispatchInput): ActionResult {
      const order = this.byId(orderId);
      if (!order || order.status !== "待派车") {
        return {
          ok: false,
          issues: [{ code: "STATUS_CONFLICT", message: "仅“待派车”联单可以派车" }],
        };
      }

      const vehicle = this.vehicleMap.get(input.vehicleId);
      const issues = checkDispatch({
        order,
        input,
        vehicleHasFireBox: !!vehicle?.hasFireBox,
        others: this.orders.filter((o) => o.id !== orderId),
        driverName: (id) => this.driverName(id),
      });
      if (issues.length) return { ok: false, issues };

      order.dispatch = {
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        slotCode: input.slotCode,
        planStart: new Date(input.planStart).toISOString(),
        planEnd: new Date(input.planEnd).toISOString(),
        fireBoxRequired: this.needsFireBox(order),
        dispatchedAt: nowIso(),
      };
      order.status = "已派车";
      this.addHistory(order, "派车", [
        { field: "vehicleId", label: "承运车辆", oldValue: "", newValue: this.vehicleName(input.vehicleId) },
        { field: "driverId", label: "司机", oldValue: "", newValue: this.driverName(input.driverId) },
        { field: "slotCode", label: "原库位", oldValue: "", newValue: input.slotCode },
      ]);
      this.persist();
      return { ok: true };
    },

    // ③ 司机到库录入实收/破损/凭证；数量不符或破损缺凭证停进待复核
    receive(orderId: string, input: ReceiptInput): ActionResult {
      const order = this.byId(orderId);
      if (!order || order.status !== "已派车") {
        return {
          ok: false,
          issues: [{ code: "STATUS_CONFLICT", message: "仅“已派车”联单可以录入到库数据" }],
        };
      }

      const { errors, holds } = checkReceipt(order, input);
      if (errors.length) return { ok: false, issues: errors };

      order.receipt = {
        receivedPacks: input.receivedPacks as number,
        damagedPacks: input.damagedPacks,
        voucherNo: input.voucherNo.trim(),
        receivedAt: nowIso(),
      };
      const changes: ChangeItem[] = [
        {
          field: "receivedPacks",
          label: "实收包数",
          oldValue: "",
          newValue: String(input.receivedPacks),
        },
        {
          field: "damagedPacks",
          label: "破损数",
          oldValue: "",
          newValue: String(input.damagedPacks),
        },
        {
          field: "voucherNo",
          label: "入库凭证号",
          oldValue: "",
          newValue: input.voucherNo.trim() || "（未填写）",
        },
      ];

      if (holds.length) {
        // 停进待复核：车辆与原库位继续占用，复核完成前不释放
        order.status = "待复核";
        order.holdIssues = holds;
        this.addHistory(order, "到库录入", changes, holds.map((h) => h.message).join("；"));
      } else {
        order.status = "已完成";
        order.holdIssues = [];
        this.addHistory(order, "到库录入", changes, "数量一致、凭证齐全，联单完成并释放车辆与库位");
      }
      this.persist();
      return { ok: true, issues: holds };
    },

    // ④ 复核完成：记录结论，释放车辆与原库位
    resolveReview(orderId: string, reviewer: string, conclusion: string): ActionResult {
      const order = this.byId(orderId);
      if (!order || order.status !== "待复核") {
        return {
          ok: false,
          issues: [{ code: "STATUS_CONFLICT", message: "仅“待复核”联单可以提交复核结论" }],
        };
      }
      if (!reviewer.trim() || !conclusion.trim()) {
        return {
          ok: false,
          issues: [{ code: "RECV_INCOMPLETE", message: "请填写复核人与复核结论" }],
        };
      }
      order.review = { reviewer: reviewer.trim(), conclusion: conclusion.trim(), reviewedAt: nowIso() };
      order.status = "已完成";
      this.addHistory(
        order,
        "复核完成",
        order.holdIssues.map((h) => ({
          field: h.code,
          label: h.code === "RECV_MISMATCH" ? "数量不符处理" : "凭证缺失处理",
          oldValue: h.message,
          newValue: conclusion.trim(),
        })),
        `复核人 ${reviewer.trim()}；车辆与原库位 ${order.dispatch?.slotCode ?? ""} 已释放`
      );
      order.holdIssues = [];
      this.persist();
      return { ok: true };
    },

    // ⑤ 联单确认（派车）后冻结；改单保留旧值和原因（高温/鼓包能力重新核查）
    //    待派车联单尚未冻结，可直接修改；待复核联单资源锁定，复核完成前不可改
    amend(
      orderId: string,
      patch: Partial<Pick<RecycleOrder, "packCount" | "maxTemp" | "bulged" | "remark" | "storeId">>,
      reason: string
    ): ActionResult {
      const order = this.byId(orderId);
      if (!order) return { ok: false, issues: [{ code: "STATUS_CONFLICT", message: "联单不存在" }] };
      if (order.status === "待复核") {
        return {
          ok: false,
          issues: [
            {
              code: "RESOURCE_LOCKED",
              message: "联单处于待复核，车辆与原库位锁定中，复核完成前不能改单",
            },
          ],
        };
      }
      if (order.status === "已完成" || order.status === "已取消") {
        return {
          ok: false,
          issues: [{ code: "STATUS_CONFLICT", message: `${order.status}联单已冻结归档，不能再改` }],
        };
      }
      const frozen = order.status !== "待派车";
      if (frozen && !reason.trim()) {
        return {
          ok: false,
          issues: [{ code: "RECV_INCOMPLETE", message: "冻结联单改单必须填写改单原因" }],
        };
      }

      const changes: ChangeItem[] = [];
      const push = (label: string, field: string, oldV: string | number, newV: string | number) => {
        if (String(oldV) !== String(newV)) {
          changes.push({ field, label, oldValue: String(oldV), newValue: String(newV) });
        }
      };

      if (patch.storeId !== undefined) push("门店", "storeId", this.storeName(order.storeId), this.storeName(patch.storeId));
      if (patch.packCount !== undefined) push("电池包数量", "packCount", order.packCount, patch.packCount);
      if (patch.maxTemp !== undefined) push("最高温度", "maxTemp", `${order.maxTemp}℃`, `${patch.maxTemp}℃`);
      if (patch.bulged !== undefined) push("是否鼓包", "bulged", order.bulged ? "是" : "否", patch.bulged ? "是" : "否");
      if (patch.remark !== undefined) push("备注", "remark", order.remark || "（空）", patch.remark || "（空）");

      if (!changes.length) {
        return { ok: false, issues: [{ code: "RECV_INCOMPLETE", message: "没有字段发生变化" }] };
      }

      // 已派车联单改了温度/鼓包：现车能力不符则阻止，提示改派带防火箱车辆
      if (
        order.dispatch &&
        (patch.maxTemp !== undefined || patch.bulged !== undefined) &&
        fireBoxRequired(patch.maxTemp ?? order.maxTemp, patch.bulged ?? order.bulged) &&
        !this.vehicleMap.get(order.dispatch.vehicleId)?.hasFireBox
      ) {
        return {
          ok: false,
          issues: [
            {
              code: "AMEND_CAPABILITY",
              message:
                "改单后温度超过45℃或出现鼓包，当前承运车辆无防火箱、温度能力不符，请先改派带防火箱的车辆",
            },
          ],
        };
      }

      Object.assign(order, patch);
      if (order.dispatch) order.dispatch.fireBoxRequired = this.needsFireBox(order);
      this.addHistory(order, "改单", changes, reason.trim());
      this.persist();
      return { ok: true };
    },

    // 已派车/待复核联单改派车辆或司机：重新做时段与能力核查，保留旧值
    reassign(
      orderId: string,
      patch: Partial<Pick<DispatchInput, "vehicleId" | "driverId" | "slotCode" | "planStart" | "planEnd">>,
      reason: string
    ): ActionResult {
      const order = this.byId(orderId);
      if (!order || !order.dispatch) {
        return { ok: false, issues: [{ code: "STATUS_CONFLICT", message: "联单尚未派车" }] };
      }
      if (order.status === "待复核") {
        return {
          ok: false,
          issues: [
            {
              code: "RESOURCE_LOCKED",
              message: "联单处于待复核，车辆与原库位锁定中，复核完成前不能改派",
            },
          ],
        };
      }
      if (order.status !== "已派车") {
        return {
          ok: false,
          issues: [{ code: "STATUS_CONFLICT", message: "当前状态不能改派" }],
        };
      }
      if (!reason.trim()) {
        return {
          ok: false,
          issues: [{ code: "RECV_INCOMPLETE", message: "改派必须填写原因" }],
        };
      }

      const next: DispatchInput = {
        vehicleId: patch.vehicleId ?? order.dispatch.vehicleId,
        driverId: patch.driverId ?? order.dispatch.driverId,
        slotCode: patch.slotCode ?? order.dispatch.slotCode,
        planStart: (patch.planStart ? new Date(patch.planStart).toISOString() : order.dispatch.planStart),
        planEnd: (patch.planEnd ? new Date(patch.planEnd).toISOString() : order.dispatch.planEnd),
      };

      const issues = checkDispatch({
        order,
        input: next,
        vehicleHasFireBox: !!this.vehicleMap.get(next.vehicleId)?.hasFireBox,
        others: this.orders.filter((o) => o.id !== orderId),
        driverName: (id) => this.driverName(id),
      });
      if (issues.length) return { ok: false, issues };

      const changes: ChangeItem[] = [];
      if (next.vehicleId !== order.dispatch.vehicleId) {
        changes.push({
          field: "vehicleId",
          label: "承运车辆",
          oldValue: this.vehicleName(order.dispatch.vehicleId),
          newValue: this.vehicleName(next.vehicleId),
        });
      }
      if (next.driverId !== order.dispatch.driverId) {
        changes.push({
          field: "driverId",
          label: "司机",
          oldValue: this.driverName(order.dispatch.driverId),
          newValue: this.driverName(next.driverId),
        });
      }
      if (next.slotCode !== order.dispatch.slotCode) {
        changes.push({
          field: "slotCode",
          label: "原库位",
          oldValue: order.dispatch.slotCode,
          newValue: next.slotCode,
        });
      }

      order.dispatch.vehicleId = next.vehicleId;
      order.dispatch.driverId = next.driverId;
      order.dispatch.slotCode = next.slotCode;
      order.dispatch.planStart = next.planStart;
      order.dispatch.planEnd = next.planEnd;
      this.addHistory(order, "改派", changes, reason.trim());
      this.persist();
      return { ok: true };
    },

    // 待派车联单可取消（尚未占用资源）
    cancel(orderId: string, reason: string): ActionResult {
      const order = this.byId(orderId);
      if (!order || order.status !== "待派车") {
        return {
          ok: false,
          issues: [{ code: "STATUS_CONFLICT", message: "仅“待派车”联单可以取消" }],
        };
      }
      if (!reason.trim()) {
        return {
          ok: false,
          issues: [{ code: "RECV_INCOMPLETE", message: "取消需要填写原因" }],
        };
      }
      order.status = "已取消";
      this.addHistory(order, "取消", [], reason.trim());
      this.persist();
      return { ok: true };
    },
  },
});
