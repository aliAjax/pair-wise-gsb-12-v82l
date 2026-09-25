<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import BaseModal from "./BaseModal.vue";
import IssueList from "./IssueList.vue";
import { TEMP_LIMIT, fireBoxRequired } from "../rules/checks";
import { useRecycleStore } from "../store/recycle";
import type { Issue, RecycleOrder } from "../types";

const props = defineProps<{ order: RecycleOrder }>();
const emit = defineEmits<{ close: []; done: [] }>();

const store = useRecycleStore();

const form = reactive({
  storeId: props.order.storeId,
  packCount: props.order.packCount,
  maxTemp: props.order.maxTemp,
  bulged: props.order.bulged,
  remark: props.order.remark,
  reason: "",
});
const submitError = ref<Issue[] | null>(null);

const frozen = computed(() => props.order.status !== "待派车");
const newNeedsFireBox = computed(() => fireBoxRequired(form.maxTemp, form.bulged));
const currentVehicleFireBox = computed(
  () => (props.order.dispatch ? store.vehicleMap.get(props.order.dispatch.vehicleId)?.hasFireBox : true)
);
const capabilityBlock = computed(
  () => !!props.order.dispatch && newNeedsFireBox.value && !currentVehicleFireBox.value
);

function submit() {
  const res = store.amend(
    props.order.id,
    {
      storeId: form.storeId,
      packCount: Number(form.packCount),
      maxTemp: Number(form.maxTemp),
      bulged: form.bulged,
      remark: form.remark,
    },
    form.reason
  );
  if (!res.ok) {
    submitError.value = res.issues ?? [];
    return;
  }
  emit("done");
}
</script>

<template>
  <template v-if="order">
    <BaseModal :title="`改单 · ${order.orderNo}（旧值与原因保留）`" width="600px" @close="emit('close')">
      <div class="form-grid">
        <label>
          门店
          <select v-model="form.storeId">
            <option v-for="s in store.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label>
          电池包数量
          <input v-model.number="form.packCount" type="number" min="1" step="1" />
        </label>
        <label>
          最高温度（℃，红线 {{ TEMP_LIMIT }}℃）
          <input v-model.number="form.maxTemp" type="number" step="0.1" />
        </label>
        <label class="check-label">
          <input v-model="form.bulged" type="checkbox" />
          存在电池鼓包
        </label>
        <label class="span-2">
          备注
          <textarea v-model="form.remark" />
        </label>
        <label class="span-2">
          改单原因<template v-if="frozen">（必填，旧值自动留痕）</template>
          <textarea
            v-model="form.reason"
            :placeholder="frozen ? '联单已冻结，本次修改需写明原因' : '联单尚未派车，可直接修改（选填）'"
          />
        </label>
      </div>

      <p v-if="capabilityBlock" class="hold-tip">
        ⚠️ 修改后温度超过 {{ TEMP_LIMIT }}℃ 或出现鼓包，当前承运车辆无防火箱，温度能力不符，
        请先在“改派”中换带防火箱的车辆，再保存改单。
      </p>
      <IssueList v-if="submitError" :issues="submitError" tone="danger" />

      <template #footer>
        <button type="button" class="secondary" @click="emit('close')">取消</button>
        <button type="button" :disabled="(frozen && !form.reason.trim()) || capabilityBlock" @click="submit">
          保存改单
        </button>
      </template>
    </BaseModal>
  </template>
</template>
