<script setup lang="ts">
import type { Issue, IssueCode } from "../types";

defineProps<{ issues: Issue[] }>();

const tone: Record<IssueCode, string> = {
  DRIVER_SHIFT_OVERLAP: "warn",
  VEHICLE_SHIFT_OVERLAP: "warn",
  VEHICLE_TEMP_MISMATCH: "danger",
  VEHICLE_CAPACITY: "warn",
  VOUCHER_MISSING: "danger",
  QUANTITY_MISMATCH: "warn",
  SLOT_TAKEN: "warn"
};

const tag: Record<IssueCode, string> = {
  DRIVER_SHIFT_OVERLAP: "班次重叠",
  VEHICLE_SHIFT_OVERLAP: "班次重叠",
  VEHICLE_TEMP_MISMATCH: "温度能力不符",
  VEHICLE_CAPACITY: "容量不足",
  VOUCHER_MISSING: "凭证缺失",
  QUANTITY_MISMATCH: "数量不符",
  SLOT_TAKEN: "库位占用"
};
</script>

<template>
  <ul v-if="issues.length" class="issues">
    <li v-for="(issue, i) in issues" :key="i" :class="['issue', tone[issue.code]]">
      <span class="issue-tag">{{ tag[issue.code] }}</span>
      <span>{{ issue.message }}</span>
    </li>
  </ul>
</template>
