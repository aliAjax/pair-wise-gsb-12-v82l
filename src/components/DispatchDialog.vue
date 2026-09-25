<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import IssueList from "./IssueList.vue";
import { checkDispatch } from "../rules/checks";
import { toLocalInput } from "../utils/time";
import { useRecycleStore } from "../store/recycle";
import type { DispatchInput, Issue, RecycleOrder } from "../types";

const props = defineProps<{ order: RecycleOrder; mode: "dispatch" | "reassign" }>();
const emit = defineEmits<{ close: []; done: [issues?: Issue[]] }>();

const store = useRecycleStore();

const defaultStart = () => {
  const d = new Date(Date.now() + 30 * 60000);
  return toLocalInput(d.toISOString());
};
const defaultEnd = () => {
  const d = new Date(Date.now() + 150 * 60000);
  return toLocalInput(d.toISOString());
};

const form = reactive<DispatchInput>({
  vehicleId: props.order.dispatch?.vehicleId ?? "",
  driverId: props.order.dispatch?.driverId ?? "",
  slotCode: props.order.dispatch?.slotCode ?? "",
  planStart: props.order.dispatch ? toLocalInput(props.order.dispatch.planStart) : defaultStart(),
  planEnd: props.order.dispatch ? toLocalInput(props.order.dispatch.planEnd) : defaultEnd(),
});

watch(
  () => [props.order.id, props.mode],
  () => {
    form.vehicleId = props.order.dispatch?.vehicleId ?? "";
    form.driverId = props.order.dispatch?.driverId ?? "";
    form.slotCode = props.order.dispatch?.slotCode ?? "";
    form.planStart = props.order.dispatch ? toLocalInput(props.order.dispatch.planStart) : defaultStart();
    form.planEnd = props.order.dispatch ? toLocalInput(props.order.dispatch.planEnd) : defaultEnd();
  }
);

const needsFireBox = computed(() => store.needsFireBox(props.order));
const selectedVehicle = computed(() => store.vehicleMap.get(form.vehicleId));
const fireBoxVehicles = computed(() => store.vehicles.filter((v) => v.hasFireBox));

// 派车前实时核查：班次重叠、资源锁定、温度能力、库位占用
const issues = computed<Issue[]>(() =>
  checkDispatch({
    order: props.order,
    input: { ...form },
    vehicleHasFireBox: !!selectedVehicle.value?.hasFireBox,
    others: store.orders.filter((o) => o.id !== props.order.id),
    driverName: (id) => store.driverName(id),
  })
);

const reason = reactive({ value: "" });
const submitError = ref<Issue[] | null>(null);

function submit() {
  if (props.mode === "dispatch") {
    const res = store.dispatch(props.order.id, { ...form });
    if (!res.ok) {
      submitError.value = res.issues ?? [];
      return;
    }
  } else {
    if (!reason.value.trim()) {
      submitError.value = [{ code: "RECV_INCOMPLETE", message: "改派必须填写原因" }];
      return;
    }
    const res = store.reassign(props.order.id, { ...form }, reason.value);
    if (!res.ok) {
      submitError.value = res.issues ?? [];
      return;
    }
  }
  emit("done");
}

function chooseFireBox(id: string) {
  form.vehicleId = id;
}
</script>

<template>
  <BaseModal
    :title="mode === 'dispatch' ? `派车核查 · ${order.orderNo}` : `改派车辆/司机 · ${order.orderNo}`"
    width="620px"
    @close="emit('close')"
  >
    <div class="cargo-note" :class="{ alert: needsFireBox }">
      <template v-if="needsFireBox">
        ⚠️ 最高温度 {{ order.maxTemp }}℃<template v-if="order.bulged">、存在鼓包</template>
        ，超过 45℃ 红线或鼓包，<strong>必须改派带防火箱的车辆</strong>。
      </template>
      <template v-else>
        最高温度 {{ order.maxTemp }}℃，无鼓包，普通车辆可承运。
      </template>
    </div>

    <div class="form-grid">
      <label>
        承运车辆
        <select v-model="form.vehicleId">
          <option value="" disabled>请选择车辆</option>
          <option v-for="v in store.vehicles" :key="v.id" :value="v.id">
            {{ v.plate }}{{ v.hasFireBox ? "（带防火箱）" : "" }}
          </option>
        </select>
      </label>
      <div v-if="needsFireBox" class="firebox-hint">
        <span>带防火箱车辆：</span>
        <button
          v-for="v in fireBoxVehicles"
          :key="v.id"
          type="button"
          class="chip"
          :class="{ active: form.vehicleId === v.id }"
          @click="chooseFireBox(v.id)"
        >
          {{ v.plate }}
        </button>
      </div>

      <label>
        司机
        <select v-model="form.driverId">
          <option value="" disabled>请选择司机</option>
          <option v-for="d in store.drivers" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>

      <label>
        原库位（预占）
        <select v-model="form.slotCode">
          <option value="" disabled>请选择库位</option>
          <option v-for="s in store.slots" :key="s.id" :value="s.code">{{ s.code }}</option>
        </select>
      </label>

      <label>
        运输时段开始
        <input v-model="form.planStart" type="datetime-local" />
      </label>
      <label>
        运输时段结束
        <input v-model="form.planEnd" type="datetime-local" />
      </label>

      <label v-if="mode === 'reassign'" class="span-2">
        改派原因（联单已冻结，旧值保留在改单记录中）
        <textarea v-model="reason.value" placeholder="如：车辆临时故障 / 温度核查不达标改派防火箱车辆" />
      </label>
    </div>

    <IssueList v-if="issues.length" :issues="issues" tone="danger" />
    <IssueList v-if="submitError" :issues="submitError" tone="danger" />

    <template #footer>
      <button type="button" class="secondary" @click="emit('close')">取消</button>
      <button type="button" :disabled="issues.length > 0" @click="submit">
        {{ mode === "dispatch" ? "确认派车并冻结联单" : "确认改派" }}
      </button>
    </template>
  </BaseModal>
</template>
