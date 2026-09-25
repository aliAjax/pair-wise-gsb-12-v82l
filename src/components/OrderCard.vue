<script setup lang="ts">
import { useRecycleStore } from "../store/recycle";
import type { RecycleOrder } from "../types";

const props = defineProps<{ order: RecycleOrder }>();
const emit = defineEmits<{
  dispatch: [];
  receive: [];
  review: [];
  reassign: [];
  amend: [];
  cancel: [];
}>();

const store = useRecycleStore();

const STATUS_CLASS: Record<string, string> = {
  待派车: "st-pending",
  已派车: "st-transit",
  待复核: "st-hold",
  已完成: "st-done",
  已取消: "st-cancel",
};

function fmt(iso?: string): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}
</script>

<template>
  <article class="order-card" :class="STATUS_CLASS[order.status]">
    <header class="order-head">
      <div>
        <p class="order-no">{{ order.orderNo }}</p>
        <p class="order-sub">
          {{ store.storeName(order.storeId) }} · 登记于 {{ fmt(order.createdAt) }}
        </p>
      </div>
      <span class="status" :class="STATUS_CLASS[order.status]">{{ order.status }}</span>
    </header>

    <!-- 第一联：门店登记 -->
    <section class="sheet">
      <h4>登记联（门店回收）</h4>
      <div class="details">
        <span>电池包数量：<strong>{{ order.packCount }}</strong> 包</span>
        <span>最高温度：<strong :class="{ hot: order.maxTemp > 45 }">{{ order.maxTemp }}℃</strong></span>
        <span>电池鼓包：<strong :class="{ hot: order.bulged }">{{ order.bulged ? "是" : "否" }}</strong></span>
        <span v-if="order.dispatch">
          防火箱要求：<strong>{{ order.dispatch.fireBoxRequired ? "需要" : "不需要" }}</strong>
        </span>
      </div>
      <p v-if="order.remark" class="note">备注：{{ order.remark }}</p>
    </section>

    <!-- 第二联：派车运输 -->
    <section v-if="order.dispatch" class="sheet">
      <h4>运输联（派车）</h4>
      <div class="details">
        <span>承运车辆：<strong>{{ store.vehicleName(order.dispatch.vehicleId) }}</strong></span>
        <span>司机：<strong>{{ store.driverName(order.dispatch.driverId) }}</strong></span>
        <span>原库位：<strong>{{ order.dispatch.slotCode }}</strong></span>
        <span>时段：{{ fmt(order.dispatch.planStart) }} ~ {{ fmt(order.dispatch.planEnd) }}</span>
      </div>
    </section>

    <!-- 第三联：到库接收 -->
    <section v-if="order.receipt" class="sheet">
      <h4>接收联（仓库到库）</h4>
      <div class="details">
        <span>实收包数：<strong>{{ order.receipt.receivedPacks }}</strong></span>
        <span>破损数：<strong :class="{ hot: order.receipt.damagedPacks > 0 }">{{ order.receipt.damagedPacks }}</strong></span>
        <span>入库凭证号：<strong :class="{ hot: !order.receipt.voucherNo }">{{ order.receipt.voucherNo || "缺失" }}</strong></span>
        <span>到库时间：{{ fmt(order.receipt.receivedAt) }}</span>
      </div>
    </section>

    <section v-if="order.holdIssues.length" class="hold-box">
      <p class="hold-title">待复核原因（车辆与原库位 {{ order.dispatch?.slotCode }} 锁定中）</p>
      <ul>
        <li v-for="(issue, i) in order.holdIssues" :key="i">{{ issue.message }}</li>
      </ul>
    </section>

    <section v-if="order.review" class="sheet review-box">
      <h4>复核结论</h4>
      <p>{{ order.review.conclusion }}</p>
      <p class="order-sub">复核人：{{ order.review.reviewer }} · {{ fmt(order.review.reviewedAt) }}</p>
    </section>

    <!-- 改单留痕：冻结后每次修改的旧值、新值与原因 -->
    <details v-if="order.history.length" class="history">
      <summary>流转 / 改单记录（{{ order.history.length }} 条）</summary>
      <ol class="timeline">
        <li v-for="h in [...order.history].reverse()" :key="h.id">
          <p>
            <span class="t-action">{{ h.action }}</span>
            <span class="t-time">{{ fmt(h.at) }}</span>
          </p>
          <ul v-if="h.changes.length" class="t-changes">
            <li v-for="c in h.changes" :key="c.field">
              {{ c.label }}：<del>{{ c.oldValue || "空" }}</del> → <strong>{{ c.newValue }}</strong>
            </li>
          </ul>
          <p v-if="h.reason" class="t-reason">原因：{{ h.reason }}</p>
        </li>
      </ol>
    </details>

    <footer class="actions">
      <button v-if="order.status === '待派车'" type="button" @click="emit('dispatch')">派车核查</button>
      <button v-if="order.status === '已派车'" type="button" @click="emit('receive')">到库录入</button>
      <button v-if="order.status === '已派车'" type="button" class="secondary" @click="emit('reassign')">改派</button>
      <button v-if="order.status === '待复核'" type="button" @click="emit('review')">复核处理</button>
      <button
        v-if="order.status === '待派车' || order.status === '已派车'"
        type="button"
        class="secondary"
        @click="emit('amend')"
      >改单</button>
      <button v-if="order.status === '待派车'" type="button" class="danger" @click="emit('cancel')">取消</button>
      <span v-if="order.status === '已完成'" class="frozen-tag">联单已冻结归档</span>
      <span v-if="order.status === '已取消'" class="frozen-tag">联单已取消</span>
    </footer>
  </article>
</template>
