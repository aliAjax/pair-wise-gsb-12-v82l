<script setup lang="ts">
import { reactive, ref } from "vue";
import { TEMP_LIMIT, fireBoxRequired } from "../rules/checks";
import { useRecycleStore } from "../store/recycle";
import type { RecycleOrder } from "../types";

const emit = defineEmits<{ created: [order: RecycleOrder] }>();

const store = useRecycleStore();

const blank = () => ({
  storeId: store.stores[0]?.id ?? "",
  packCount: 10,
  maxTemp: 25,
  bulged: false,
  remark: "",
});

const form = reactive(blank());
const error = ref("");

const needsFireBox = () => fireBoxRequired(Number(form.maxTemp), form.bulged);

function submit() {
  error.value = "";
  if (!form.storeId) {
    error.value = "请选择门店";
    return;
  }
  if (!Number.isInteger(form.packCount) || form.packCount <= 0) {
    error.value = "电池包数量需为正整数";
    return;
  }
  if (form.maxTemp < -20 || form.maxTemp > 200) {
    error.value = "请输入合理的最高温度";
    return;
  }
  const order = store.register({
    storeId: form.storeId,
    packCount: form.packCount,
    maxTemp: Number(form.maxTemp),
    bulged: form.bulged,
    remark: form.remark,
  });
  Object.assign(form, blank());
  emit("created", order);
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>登记回收联单</h2>
    <p class="panel-hint">退役动力电池由门店回库：先登记，派车前核查车辆与司机时段，到库后录入实收。</p>
    <div class="form-grid">
      <label class="span-2">
        门店
        <select v-model="form.storeId">
          <option v-for="s in store.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <label>
        电池包数量
        <input v-model.number="form.packCount" type="number" min="1" step="1" required />
      </label>
      <label>
        最高温度（℃）
        <input v-model.number="form.maxTemp" type="number" step="0.1" required />
      </label>
      <label class="check-label span-2">
        <input v-model="form.bulged" type="checkbox" />
        存在电池鼓包
      </label>
      <p v-if="needsFireBox()" class="hold-tip span-2">
        ⚠️ 温度超过 {{ TEMP_LIMIT }}℃ 或电池鼓包：派车时将强制要求带防火箱的车辆。
      </p>
      <label class="span-2">
        备注
        <textarea v-model="form.remark" placeholder="门店现场情况、托盘状态等" />
      </label>
      <p v-if="error" class="form-error span-2">{{ error }}</p>
      <button class="span-2" type="submit">登记联单</button>
    </div>
  </form>
</template>
