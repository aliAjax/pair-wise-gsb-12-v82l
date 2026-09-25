<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { useWaybillStore } from "../stores/waybill";
import { needsFirebox, suggestDriverIds, suggestVehicles, TEMP_LIMIT, validateDispatch } from "../rules/engine";
import Issues from "./Issues.vue";

const store = useWaybillStore();
const { db } = storeToRefs(store);

function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocal(d);
}
function toLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const start = defaultStart();
const endDate = new Date(new Date(start).getTime() + 3 * 3600_000);

const form = reactive({
  storeId: "",
  packCount: 8,
  maxTemp: 30,
  bulging: false,
  vehicleId: "",
  driverId: "",
  shiftStart: start,
  shiftEnd: toLocal(endDate),
  slotId: ""
});

const justCreated = ref(false);

const fireboxRequired = computed(() => needsFirebox(form.maxTemp, form.bulging));

const draft = computed(() => ({ ...form }));
const liveIssues = computed(() => validateDispatch(db.value, draft.value));
const suggestedVehicles = computed(() => suggestVehicles(db.value, draft.value));
const availableDriverIds = computed(() => suggestDriverIds(db.value, draft.value));

function useRecommendedVehicle() {
  const first = suggestedVehicles.value[0];
  if (first) form.vehicleId = first.id;
}

function submit() {
  const res = store.createWaybill({ ...form });
  if (!res.ok) return;
  justCreated.value = true;
  setTimeout(() => (justCreated.value = false), 3000);
  form.storeId = "";
  form.vehicleId = "";
  form.driverId = "";
  form.slotId = "";
  form.packCount = 8;
  form.maxTemp = 30;
  form.bulging = false;
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>登记回收联单</h2>
    <p class="panel-hint">退役动力电池门店回库登记，派车前自动核查班次、温度能力与库位。</p>

    <div class="form-grid">
      <label>
        门店
        <select v-model="form.storeId" required>
          <option value="" disabled>请选择门店</option>
          <option v-for="s in db.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>

      <div class="form-row">
        <label>
          电池包数量
          <input v-model.number="form.packCount" type="number" min="1" step="1" required />
        </label>
        <label>
          最高温度（℃）
          <input v-model.number="form.maxTemp" type="number" step="0.1" required
                 :class="{ hot: fireboxRequired }" />
        </label>
      </div>

      <label class="check-label">
        <input v-model="form.bulging" type="checkbox" />
        存在电池鼓包
      </label>

      <div v-if="fireboxRequired" class="alert danger">
        最高温度超过 {{ TEMP_LIMIT }}℃ 或电池鼓包，必须改派<strong>带防火箱的车辆</strong>。
        <button v-if="suggestedVehicles.length" type="button" class="link-btn"
                @click="useRecommendedVehicle">
          一键改派：{{ suggestedVehicles[0].plate }}
        </button>
      </div>

      <label>
        承运车辆
        <select v-model="form.vehicleId" required :class="{ miss: fireboxRequired && form.vehicleId &&
          db.vehicles.find(v => v.id === form.vehicleId)?.capability !== 'firebox' }">
          <option value="" disabled>请选择车辆</option>
          <option v-for="v in db.vehicles" :key="v.id" :value="v.id">
            {{ v.plate }}｜{{ v.capability === "firebox" ? "防火箱" : "普通" }}｜载量{{ v.capacity }}
          </option>
        </select>
      </label>

      <label>
        司机
        <select v-model="form.driverId" required>
          <option value="" disabled>请选择司机</option>
          <option v-for="d in db.drivers" :key="d.id" :value="d.id">
            {{ d.name }}{{ availableDriverIds.has(d.id) ? "" : "（该时段已排班）" }}
          </option>
        </select>
      </label>

      <div class="form-row">
        <label>
          派车时段起
          <input v-model="form.shiftStart" type="datetime-local" required />
        </label>
        <label>
          派车时段止
          <input v-model="form.shiftEnd" type="datetime-local" required />
        </label>
      </div>

      <label>
        原库位（拟入库库位）
        <select v-model="form.slotId" required>
          <option value="" disabled>请选择库位</option>
          <option v-for="s in db.slots" :key="s.id" :value="s.id">
            {{ s.code }}｜{{ s.area }}
          </option>
        </select>
      </label>

      <Issues v-if="liveIssues.length" :issues="liveIssues" />
      <p v-if="liveIssues.length" class="block-hint">
        派车核查预警：仍可登记为待派车，但需在「核查并确认派车」时改派或调整后方可发车。
      </p>
      <p v-if="justCreated" class="review-note">✅ 已登记为待派车，请到右侧联单完成核查并确认派车。</p>

      <button type="submit">登记回收联单（待派车）</button>
    </div>
  </form>
</template>
