<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import OrderCard from "./components/OrderCard.vue";
import RegisterForm from "./components/RegisterForm.vue";
import ResourcePanel from "./components/ResourcePanel.vue";
import DispatchDialog from "./components/DispatchDialog.vue";
import ReceiveDialog from "./components/ReceiveDialog.vue";
import ReviewDialog from "./components/ReviewDialog.vue";
import AmendDialog from "./components/AmendDialog.vue";
import BaseModal from "./components/BaseModal.vue";
import { useRecycleStore } from "./store/recycle";
import { loadFilter, saveFilter } from "./storage/local";
import type { FilterState, OrderStatus, RecycleOrder } from "./types";

const store = useRecycleStore();

const STATUS_OPTIONS: (OrderStatus | "全部")[] = [
  "全部",
  "待派车",
  "已派车",
  "待复核",
  "已完成",
  "已取消",
];

const filter = reactive<FilterState>(loadFilter());
watch(filter, (v) => saveFilter(v), { deep: true });

const filteredOrders = computed(() =>
  store.ordersByTime.filter((o) => {
    if (filter.storeId && o.storeId !== filter.storeId) return false;
    if (filter.vehicleId && o.dispatch?.vehicleId !== filter.vehicleId) return false;
    if (filter.status !== "全部" && o.status !== filter.status) return false;
    if (filter.keyword.trim() && !o.orderNo.includes(filter.keyword.trim())) return false;
    return true;
  })
);

const metrics = computed(() => {
  const list = store.orders;
  const packs = list
    .filter((o) => o.status !== "已取消")
    .reduce((sum, o) => sum + o.packCount, 0);
  return [
    { label: "联单总数", value: list.length },
    { label: "待派车", value: list.filter((o) => o.status === "待派车").length },
    { label: "运输中", value: list.filter((o) => o.status === "已派车").length },
    { label: "待复核（资源锁定）", value: list.filter((o) => o.status === "待复核").length },
    { label: "登记电池包", value: packs },
  ];
});

// 弹窗状态
type DialogState =
  | { type: "none" }
  | { type: "dispatch"; order: RecycleOrder }
  | { type: "reassign"; order: RecycleOrder }
  | { type: "receive"; order: RecycleOrder }
  | { type: "review"; order: RecycleOrder }
  | { type: "amend"; order: RecycleOrder }
  | { type: "cancel"; order: RecycleOrder };

const dialog = ref<DialogState>({ type: "none" });
const cancelReason = ref("");
const cancelError = ref("");
const toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2600);
}

function close() {
  dialog.value = { type: "none" };
  cancelReason.value = "";
  cancelError.value = "";
}

function confirmCancel() {
  if (dialog.value.type !== "cancel") return;
  const res = store.cancel(dialog.value.order.id, cancelReason.value);
  if (!res.ok) {
    cancelError.value = res.issues?.[0]?.message ?? "取消失败";
    return;
  }
  showToast("联单已取消");
  close();
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">退役动力电池回收 · 联单闭环</p>
          <h1>车辆调度小工具</h1>
          <p class="subtitle">
            回收单扩展为登记联 / 运输联 / 接收联三联一体：派车前核查车辆与司机时段，
            温度超 45℃ 或电池鼓包改派带防火箱车辆；到库数量不符或破损缺凭证停进待复核，
            复核完成前不释放车辆与原库位；联单确认后冻结，改单保留旧值与原因。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Pinia</span>
          <span class="tag">TypeScript</span>
          <span class="tag">数据/规则/存储/页面分层</span>
        </div>
      </header>

      <section class="metrics metrics-5">
        <article v-for="m in metrics" :key="m.label" class="metric" :class="{ alert: m.label.includes('待复核') && m.value > 0 }">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <section class="workspace workspace-wide">
        <div class="side-col">
          <RegisterForm @created="(o) => showToast(`联单 ${o.orderNo} 已登记`)" />
          <ResourcePanel />
        </div>

        <section class="list-panel">
          <div class="toolbar">
            <h2>回收联单</h2>
            <div class="filters">
              <label class="inline-filter">
                门店
                <select v-model="filter.storeId">
                  <option value="">全部门店</option>
                  <option v-for="s in store.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </label>
              <label class="inline-filter">
                车辆
                <select v-model="filter.vehicleId">
                  <option value>全部车辆</option>
                  <option v-for="v in store.vehicles" :key="v.id" :value="v.id">
                    {{ v.plate }}{{ v.hasFireBox ? "（防火箱）" : "" }}
                  </option>
                </select>
              </label>
              <label class="inline-filter">
                状态
                <select v-model="filter.status">
                  <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ s }}</option>
                </select>
              </label>
              <input v-model="filter.keyword" class="keyword" placeholder="联单号搜索" />
            </div>
          </div>

          <div class="record-grid">
            <div v-if="filteredOrders.length === 0" class="empty">暂无匹配的回收联单</div>
            <OrderCard
              v-for="order in filteredOrders"
              :key="order.id"
              :order="order"
              @dispatch="dialog = { type: 'dispatch', order }"
              @receive="dialog = { type: 'receive', order }"
              @review="dialog = { type: 'review', order }"
              @reassign="dialog = { type: 'reassign', order }"
              @amend="dialog = { type: 'amend', order }"
              @cancel="dialog = { type: 'cancel', order }"
            />
          </div>
        </section>
      </section>
    </div>

    <!-- 弹窗 -->
    <DispatchDialog
      v-if="dialog.type === 'dispatch'"
      :order="dialog.order"
      mode="dispatch"
      @close="close()"
      @done="() => { showToast('派车成功，联单运输联已冻结'); close(); }"
    />
    <DispatchDialog
      v-else-if="dialog.type === 'reassign'"
      :order="dialog.order"
      mode="reassign"
      @close="close()"
      @done="() => { showToast('改派完成，旧值与原因已留痕'); close(); }"
    />
    <ReceiveDialog
      v-else-if="dialog.type === 'receive'"
      :order="dialog.order"
      @close="close()"
      @done="() => { showToast('到库录入已提交'); close(); }"
    />
    <ReviewDialog
      v-else-if="dialog.type === 'review'"
      :order="dialog.order"
      @close="close()"
      @done="() => { showToast('复核完成，车辆与原库位已释放'); close(); }"
    />
    <AmendDialog
      v-else-if="dialog.type === 'amend'"
      :order="dialog.order"
      @close="close()"
      @done="() => { showToast('改单已保存，旧值与原因已留痕'); close(); }"
    />
    <BaseModal
      v-else-if="dialog.type === 'cancel'"
      :title="`取消联单 ${dialog.order.orderNo}`"
      width="440px"
      @close="close()"
    >
      <label>
        取消原因
        <textarea v-model="cancelReason" placeholder="仅待派车联单可取消" />
      </label>
      <p v-if="cancelError" class="form-error">{{ cancelError }}</p>
      <template #footer>
        <button type="button" class="secondary" @click="close()">返回</button>
        <button type="button" class="danger" @click="confirmCancel">确认取消</button>
      </template>
    </BaseModal>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </main>
</template>
