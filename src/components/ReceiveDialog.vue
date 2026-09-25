<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import BaseModal from "./BaseModal.vue";
import IssueList from "./IssueList.vue";
import { checkReceipt } from "../rules/checks";
import { useRecycleStore } from "../store/recycle";
import type { Issue, RecycleOrder } from "../types";

const props = defineProps<{ order: RecycleOrder }>();
const emit = defineEmits<{ close: []; done: [] }>();

const store = useRecycleStore();

const form = reactive({
  receivedPacks: null as number | null,
  damagedPacks: 0,
  voucherNo: "",
});

const preview = computed(() => checkReceipt(props.order, form));
const submitError = ref<Issue[] | null>(null);

function submit() {
  const res = store.receive(props.order.id, form);
  if (!res.ok) {
    submitError.value = res.issues ?? [];
    return;
  }
  emit("done");
}
</script>

<template>
  <BaseModal :title="`司机到库录入 · ${order.orderNo}`" width="560px" @close="emit('close')">
    <p class="modal-tip">
      出车包数 <strong>{{ order.packCount }}</strong> 包 · 承运车辆
      {{ store.vehicleName(order.dispatch!.vehicleId) }} ·
      原库位 {{ order.dispatch!.slotCode }}
    </p>

    <div class="form-grid">
      <label>
        实收包数
        <input v-model.number="form.receivedPacks" type="number" min="0" step="1" placeholder="仓库实收件数" />
      </label>
      <label>
        破损数
        <input v-model.number="form.damagedPacks" type="number" min="0" step="1" />
      </label>
      <label class="span-2">
        入库凭证号
        <input v-model="form.voucherNo" placeholder="有破损时必填，如 RK-20260925-018" />
      </label>
    </div>

    <IssueList v-if="preview.errors.length" :issues="preview.errors" tone="danger" />
    <IssueList v-if="preview.holds.length" :issues="preview.holds" tone="warn" />
    <p v-if="preview.holds.length" class="hold-tip">
      提交后联单将停进“待复核”，复核完成前车辆与原库位不释放。
    </p>
    <IssueList v-if="submitError" :issues="submitError" tone="danger" />

    <template #footer>
      <button type="button" class="secondary" @click="emit('close')">取消</button>
      <button type="button" :disabled="preview.errors.length > 0" @click="submit">提交到库录入</button>
    </template>
  </BaseModal>
</template>
