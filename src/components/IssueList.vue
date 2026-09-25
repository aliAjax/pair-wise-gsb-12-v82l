<script setup lang="ts">
import type { Issue, IssueCode } from "../types";

const CODE_LABEL: Record<IssueCode, string> = {
  WINDOW_INVALID: "运输时段不合法",
  SHIFT_OVERLAP: "班次重叠",
  RESOURCE_LOCKED: "资源待复核未释放",
  SLOT_OCCUPIED: "原库位被占用",
  TEMP_CAPABILITY: "车辆温度能力不符",
  RECV_INCOMPLETE: "录入不完整",
  DAMAGED_EXCEED: "破损数异常",
  RECV_MISMATCH: "数量不符",
  VOUCHER_MISSING: "凭证缺失",
  AMEND_CAPABILITY: "改单后能力不符",
  STATUS_CONFLICT: "状态冲突",
};

defineProps<{ issues: Issue[]; tone?: "danger" | "warn" }>();
</script>

<template>
  <ul class="issue-list" :class="tone ?? 'danger'">
    <li v-for="(issue, i) in issues" :key="i">
      <span class="issue-code">{{ CODE_LABEL[issue.code] }}</span>
      <span class="issue-msg">{{ issue.message }}</span>
    </li>
  </ul>
</template>
