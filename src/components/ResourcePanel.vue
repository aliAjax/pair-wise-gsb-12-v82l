<script setup lang="ts">
import { computed } from "vue";
import { OCCUPYING_STATUSES } from "../rules/checks";
import { useRecycleStore } from "../store/recycle";

const store = useRecycleStore();

interface Occupancy {
  orderNo: string;
  locked: boolean; // 待复核 → 锁定未释放
}

const vehicleUsage = computed(() => {
  const map = new Map<string, Occupancy>();
  for (const o of store.orders) {
    if (o.dispatch && OCCUPYING_STATUSES.includes(o.status)) {
      map.set(o.dispatch.vehicleId, { orderNo: o.orderNo, locked: o.status === "待复核" });
    }
  }
  return map;
});

const driverUsage = computed(() => {
  const map = new Map<string, Occupancy>();
  for (const o of store.orders) {
    if (o.dispatch && OCCUPYING_STATUSES.includes(o.status)) {
      map.set(o.dispatch.driverId, { orderNo: o.orderNo, locked: o.status === "待复核" });
    }
  }
  return map;
});

const slotUsage = computed(() => {
  const map = new Map<string, Occupancy>();
  for (const o of store.orders) {
    if (o.dispatch && OCCUPYING_STATUSES.includes(o.status)) {
      map.set(o.dispatch.slotCode, { orderNo: o.orderNo, locked: o.status === "待复核" });
    }
  }
  return map;
});
</script>

<template>
  <section class="panel resource-panel">
    <h2>资源占用</h2>
    <p class="panel-hint">在途或待复核联单占用车辆、司机与库位；待复核未释放会直接拦截派车。</p>

    <div class="res-group">
      <h4>车辆</h4>
      <ul>
        <li v-for="v in store.vehicles" :key="v.id">
          <span>{{ v.plate }}</span>
          <em v-if="v.hasFireBox" class="cap">防火箱</em>
          <em v-if="vehicleUsage.get(v.id)" :class="vehicleUsage.get(v.id)!.locked ? 'lock' : 'busy'">
            {{ vehicleUsage.get(v.id)!.locked ? "锁定 " : "在途 " }}{{ vehicleUsage.get(v.id)!.orderNo }}
          </em>
          <em v-else-if="!vehicleUsage.get(v.id)" class="free">空闲</em>
        </li>
      </ul>
    </div>

    <div class="res-group">
      <h4>司机</h4>
      <ul>
        <li v-for="d in store.drivers" :key="d.id">
          <span>{{ d.name }}</span>
          <em v-if="driverUsage.get(d.id)" :class="driverUsage.get(d.id)!.locked ? 'lock' : 'busy'">
            {{ driverUsage.get(d.id)!.locked ? "锁定 " : "在途 " }}{{ driverUsage.get(d.id)!.orderNo }}
          </em>
          <em v-else class="free">空闲</em>
        </li>
      </ul>
    </div>

    <div class="res-group">
      <h4>仓库库位</h4>
      <ul>
        <li v-for="s in store.slots" :key="s.id">
          <span>{{ s.code }}</span>
          <em v-if="slotUsage.get(s.code)" :class="slotUsage.get(s.code)!.locked ? 'lock' : 'busy'">
            {{ slotUsage.get(s.code)!.locked ? "锁定 " : "预占 " }}{{ slotUsage.get(s.code)!.orderNo }}
          </em>
          <em v-else class="free">可用</em>
        </li>
      </ul>
    </div>
  </section>
</template>
