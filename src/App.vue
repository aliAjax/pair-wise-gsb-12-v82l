<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useWaybillStore } from "./stores/waybill";
import { isActive, STATUS_TEXT } from "./rules/engine";
import type { WaybillStatus } from "./types";
import DispatchForm from "./components/DispatchForm.vue";
import WaybillDetail from "./components/WaybillDetail.vue";

const store = useWaybillStore();
const { waybills } = storeToRefs(store);

const filterStore = ref("all");
const filterVehicle = ref("all");
const filterStatus = ref<"all" | WaybillStatus>("all");
const keyword = ref("");

const filtered = computed(() =>
  waybills.value.filter((wb) => {
    if (filterStore.value !== "all" && wb.storeId !== filterStore.value) return false;
    if (filterVehicle.value !== "all" && wb.vehicleId !== filterVehicle.value) return false;
    if (filterStatus.value !== "all" && wb.status !== filterStatus.value) return false;
    if (keyword.value.trim()) {
      const kw = keyword.value.trim();
      const driver = store.db.drivers.find((d) => d.id === wb.driverId)?.name ?? "";
      const haystack = `${wb.code} ${driver} ${wb.arrival?.voucherNo ?? ""}`;
      if (!haystack.includes(kw)) return false;
    }
    return true;
  })
);

const metrics = computed(() => {
  const list = waybills.value;
  return [
    { label: "联单总数", value: list.length },
    { label: "运输中", value: list.filter((w) => w.status === "transporting").length },
    { label: "待复核", value: list.filter((w) => w.status === "review").length },
    { label: "已入库", value: list.filter((w) => w.status === "completed").length }
  ];
});

/** 当前进行中联单对车辆的占用情况 */
const activeByVehicle = computed(() => {
  const map = new Map<string, number>();
  for (const wb of waybills.value) {
    if (isActive(wb.status)) map.set(wb.vehicleId, (map.get(wb.vehicleId) ?? 0) + 1);
  }
  return map;
});

const openId = ref<string | null>(null);
const openWaybill = computed(() => waybills.value.find((w) => w.id === openId.value) ?? null);

function vehicleName(id: string) {
  return store.db.vehicles.find((v) => v.id === id)?.plate ?? id;
}
function storeName(id: string) {
  return store.db.stores.find((s) => s.id === id)?.name ?? id;
}
function driverName(id: string) {
  return store.db.drivers.find((d) => d.id === id)?.name ?? id;
}

const statusOptions: ("all" | WaybillStatus)[] = ["all", "pending", "transporting", "review", "completed"];
const statusOptionText: Record<string, string> = {
  all: "全部状态",
  pending: "待派车",
  transporting: "运输中",
  review: "待复核",
  completed: "已入库"
};

function fmtShift(wb: { shiftStart: string; shiftEnd: string }) {
  return `${wb.shiftStart.slice(5, 16).replace("T", " ")} ~ ${wb.shiftEnd.slice(11, 16)}`;
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">退役动力电池回收 · 物流调度</p>
          <h1>动力电池回收联单调度台</h1>
          <p class="subtitle">
            门店回库一联到底：登记 → 派车核查（班次 / 温度能力 / 库位）→ 到库实收 → 复核放行。
            联单确认后冻结，改单保留旧值与原因。
          </p>
        </div>
        <div class="stack">
          <span class="tag">数据层 types/seed</span>
          <span class="tag">规则层 rules</span>
          <span class="tag">存储层 localStorage</span>
          <span class="tag">页面层 Vue 组件</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <DispatchForm />

        <section class="list-panel">
          <div class="toolbar">
            <h2>回收联单</h2>
            <button class="secondary" type="button" @click="store.resetAll()">恢复演示数据</button>
          </div>

          <div class="filters">
            <select v-model="filterStore">
              <option value="all">全部门店</option>
              <option v-for="s in store.db.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <select v-model="filterVehicle">
              <option value="all">全部车辆</option>
              <option v-for="v in store.db.vehicles" :key="v.id" :value="v.id">{{ v.plate }}</option>
            </select>
            <select v-model="filterStatus">
              <option v-for="s in statusOptions" :key="s" :value="s">{{ statusOptionText[s] }}</option>
            </select>
            <input v-model="keyword" placeholder="搜联单号 / 司机 / 凭证号" />
          </div>

          <div class="record-grid">
            <div v-if="filtered.length === 0" class="empty">暂无匹配联单</div>
            <article v-for="wb in filtered" :key="wb.id" class="record"
                     :class="{ reviewing: wb.status === 'review' }">
              <div class="record-head">
                <div>
                  <p class="record-title">{{ wb.code }}</p>
                  <p class="record-sub">{{ storeName(wb.storeId) }} · {{ driverName(wb.driverId) }}</p>
                </div>
                <span :class="['status-badge', wb.status]">{{ STATUS_TEXT[wb.status] }}</span>
              </div>

              <div class="details">
                <span>车辆：{{ vehicleName(wb.vehicleId) }}
                  <em v-if="store.db.vehicles.find(v => v.id === wb.vehicleId)?.capability === 'firebox'"
                      class="fire">防火箱</em>
                </span>
                <span>时段：{{ fmtShift(wb) }}</span>
                <span :class="{ hot: wb.maxTemp > 45 }">温度：{{ wb.maxTemp }}℃{{ wb.bulging ? " / 鼓包" : "" }}</span>
                <span>发出：{{ wb.packCount }} 包
                  <template v-if="wb.arrival">
                    ｜实收 <b :class="{ mismatch: wb.arrival.receivedPacks !== wb.packCount }">{{ wb.arrival.receivedPacks }}</b>
                    ｜破损 {{ wb.arrival.damagedPacks }}
                  </template>
                </span>
              </div>

              <div v-if="wb.status === 'review'" class="alert warn">
                待复核：数量不符或破损缺凭证，车辆与原库位继续锁定，复核完成前不释放。
              </div>
              <div v-else-if="wb.status === 'transporting'" class="alert info">
                运输中：车辆与原库位已占用，司机到库后录入实收包数、破损数与凭证号。
              </div>
              <div v-else-if="wb.status === 'pending'" class="alert muted">
                待派车：尚未占用车辆与库位，请完成班次与温度能力核查后确认派车。
              </div>
              <div v-if="wb.amendments.length" class="amend-flag">
                已改单 {{ wb.amendments.length }} 次（详情可查旧值与原因）
              </div>

              <div class="actions">
                <button v-if="wb.status === 'pending'" type="button" @click="openId = wb.id">
                  核查并确认派车
                </button>
                <button class="secondary" type="button" @click="openId = wb.id">
                  {{ wb.status === "transporting" ? "到库录入" : wb.status === "review" ? "复核处理" : "查看详情" }}
                </button>
              </div>
            </article>
          </div>

          <div class="occupancy">
            <h3>车辆占用（重开页面仍保留）</h3>
            <div v-for="v in store.db.vehicles" :key="v.id" class="occ-row">
              <span class="occ-plate">{{ v.plate }}</span>
              <span :class="['occ-dot', activeByVehicle.get(v.id) ? 'busy' : 'idle']" />
              <span class="occ-text">
                {{ activeByVehicle.get(v.id) ? `执行中/待复核 ${activeByVehicle.get(v.id)} 单` : "空闲，车辆与库位已释放" }}
              </span>
            </div>
          </div>
        </section>
      </section>
    </div>

    <WaybillDetail :waybill="openWaybill" @close="openId = null" />
  </main>
</template>
