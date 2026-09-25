<script setup lang="ts">
import { reactive, ref } from "vue";
import BaseModal from "./BaseModal.vue";
import IssueList from "./IssueList.vue";
import { useRecycleStore } from "../store/recycle";
import type { Issue, RecycleOrder } from "../types";

const props = defineProps<{ order: RecycleOrder }>();
const emit = defineEmits<{ close: []; done: [] }>();

const store = useRecycleStore();
const form = reactive({ reviewer: "", conclusion: "" });
const submitError = ref<Issue[] | null>(null);

function submit() {
  const res = store.resolveReview(props.order.id, form.reviewer, form.conclusion);
  if (!res.ok) {
    submitError.value = res.issues ?? [];
    return;
  }
  emit("done");
}
</script>

<template>
  <BaseModal :title="`待复核处理 · ${order.orderNo}`" width="600px" @close="emit('close')">
    <div class="hold-box">
      <p class="hold-title">停进待复核原因（车辆与原库位锁定中）：</p>
      <IssueList :issues="order.holdIssues" tone="warn" />
    </div>

    <div class="form-grid">
      <label>
        复核人
        <input v-model="form.reviewer" placeholder="仓库主管姓名" />
      </label>
      <label class="span-2">
        复核结论
        <textarea
          v-model="form.conclusion"
          placeholder="说明差异去向/破损凭证补录情况；确认后释放车辆与原库位"
        />
      </label>
    </div>

    <IssueList v-if="submitError" :issues="submitError" tone="danger" />

    <template #footer>
      <button type="button" class="secondary" @click="emit('close')">取消</button>
      <button type="button" @click="submit">复核完成，释放车辆与库位</button>
    </template>
  </BaseModal>
</template>
