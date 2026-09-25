<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { Issue, Waybill } from "../types";
import { useWaybillStore } from "../stores/waybill";
import { STATUS_TEXT, validateDispatch } from "../rules/engine";
import Issues from "./Issues.vue";

const props = defineProps<{ waybill: Waybill | null }>();
const emit = defineEmits<{ close: [] }>();

const store = useWaybillStore();

const storeName = (id: string) => store.db.stores.find((s) => s.id === id)?.name ?? id;
const vehicle = (id: string) => store.db.vehicles.find((v) => v.id === id);
const driverName = (id: string) => store.db.drivers.find((d) => d.id === id)?.name ?? id;
const slot = (id: string) => store.db.slots.find((s) => s.id === id);

/* ---------- 待派车核查 ---------- */
const dispatchIssues = ref<Issue[]>([]);
const dispatchChecked = ref(false);

const pendingCheck = computed<Issue[]>(() => {
  const wb = props.waybill;
  if (!wb || wb.status !== "pending") return [];
  return validateDispatch(store.db, {
    storeId: wb.storeId,
    packCount: wb.packCount,
    maxTemp: wb.maxTemp,
    bulging: wb.bulging,
    vehicleId: wb.vehicleId,
    driverId: wb.driverId,
    shiftStart: wb.shiftStart,
    shiftEnd: wb.shiftEnd,
    slotId: wb.slotId
  }, wb.id);
});

function runDispatchCheck() {
  dispatchChecked.value = true;
  dispatchIssues.value = pendingCheck.value;
}

function submitDispatch() {
  if (!props.waybill) return;
  const res = store.confirmDispatch(props.waybill.id);
  dispatchIssues.value = res.issues;
  if (res.ok) {
    dispatchChecked.value = false;
    tab.value = "arrival";
  }
}

/* ---------- 到库录入 ---------- */
const arrivalForm = reactive({
  receivedPacks: 0,
  damagedPacks: 0,
  voucherNo: "",
  operator: ""
});
const arrivalIssues = ref<Issue[]>([]);

/* ---------- 复核 ---------- */
const reviewForm = reactive({
  receivedPacks: 0,
  damagedPacks: 0,
  voucherNo: "",
  reviewNote: ""
});
const reviewIssues = ref<Issue[]>([]);

/* ---------- 改单 ---------- */
const tab = ref<"dispatch" | "arrival" | "amend" | "review">("dispatch");

const amendForm = reactive({
  field: "vehicleId",
  reason: "",
  operator: ""
});
const amendIssues = ref<Issue[]>([]);

watch(
  () => props.waybill?.id,
  () => {
    const wb = props.waybill;
    arrivalIssues.value = [];
    amendIssues.value = [];
    reviewIssues.value = [];
    dispatchIssues.value = [];
    dispatchChecked.value = false;
    tab.value = wb?.status === "pending"
      ? "dispatch"
      : wb?.status === "review"
        ? "review"
        : "arrival";
    if (wb?.arrival) {
      arrivalForm.receivedPacks = wb.arrival.receivedPacks;
      arrivalForm.damagedPacks = wb.arrival.damagedPacks;
      arrivalForm.voucherNo = wb.arrival.voucherNo;
      arrivalForm.operator = wb.arrival.operator;
      Object.assign(reviewForm, {
        receivedPacks: wb.arrival.receivedPacks,
        damagedPacks: wb.arrival.damagedPacks,
        voucherNo: wb.arrival.voucherNo,
        reviewNote: wb.reviewNote ?? ""
      });
    } else if (wb) {
      arrivalForm.receivedPacks = wb.packCount;
      arrivalForm.damagedPacks = 0;
      arrivalForm.voucherNo = "";
      arrivalForm.operator = "";
    }
  },
  { immediate: true }
);

function submitArrival() {
  if (!props.waybill) return;
  const res = store.registerArrival(props.waybill.id, {
    receivedPacks: arrivalForm.receivedPacks,
    damagedPacks: arrivalForm.damagedPacks,
    voucherNo: arrivalForm.voucherNo.trim(),
    arrivedAt: new Date().toISOString(),
    operator: arrivalForm.operator.trim() || "仓管"
  });
  arrivalIssues.value = res.issues;
}

function submitReview() {
  if (!props.waybill) return;
  const res = store.resolveReview(props.waybill.id, { ...reviewForm });
  reviewIssues.value = res.issues;
}

const amendableFields = [
  { key: "packCount", label: "电池包数量", type: "number" },
  { key: "maxTemp", label: "最高温度", type: "number" },
  { key: "bulging", label: "是否鼓包", type: "bool" },
  { key: "vehicleId", label: "承运车辆", type: "vehicle" },
  { key: "driverId", label: "司机", type: "driver" },
  { key: "shiftStart", label: "时段开始", type: "datetime" },
  { key: "shiftEnd", label: "时段结束", type: "datetime" },
  { key: "slotId", label: "原库位", type: "slot" }
] as const;

/** 当前所选字段的新值（改单时逐字段修改） */
const newValueMap = reactive<Record<string, string>>({});
watch(
  () => [props.waybill?.id, amendForm.field],
  () => {
    if (!props.waybill) return;
    const w = props.waybill as unknown as Record<string, unknown>;
    newValueMap[amendForm.field] = String(w[amendForm.field] ?? "");
  },
  { immediate: true }
);

function submitAmend() {
  if (!props.waybill) return;
  const field = amendForm.field;
  let value: string | number | boolean = newValueMap[field] ?? "";
  if (field === "packCount" || field === "maxTemp") value = Number(value);
  if (field === "bulging") value = newValueMap[field] === "true";

  const res = store.amend(props.waybill.id, {
    [field]: value,
    reason: amendForm.reason,
    operator: amendForm.operator
  } as never);
  amendIssues.value = res.issues;
  if (res.ok) {
    amendForm.reason = "";
    amendForm.operator = "";
  }
}

const currentField = computed(() => amendableFields.find((f) => f.key === amendForm.field));
const frozen = computed(() => (props.waybill ? store.isFrozen(props.waybill) : false));
</script>

<template>
  <div v-if="waybill" class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-head">
        <div>
          <p class="modal-code">{{ waybill.code }}</p>
          <span :class="['status-badge', waybill.status]">{{ STATUS_TEXT[waybill.status] }}</span>
        </div>
        <button class="icon-btn" type="button" @click="emit('close')">✕</button>
      </header>

      <div class="modal-body">
        <section class="detail-block">
          <h3>联单信息（确认派车后冻结）</h3>
          <dl class="kv">
            <div><dt>门店</dt><dd>{{ storeName(waybill.storeId) }}</dd></div>
            <div><dt>电池包数量</dt><dd>{{ waybill.packCount }} 包</dd></div>
            <div>
              <dt>最高温度</dt>
              <dd :class="{ hot: waybill.maxTemp > 45 }">{{ waybill.maxTemp }} ℃</dd>
            </div>
            <div><dt>鼓包</dt><dd>{{ waybill.bulging ? "是" : "否" }}</dd></div>
            <div>
              <dt>承运车辆</dt>
              <dd>
                {{ vehicle(waybill.vehicleId)?.plate }}
                <em v-if="vehicle(waybill.vehicleId)?.capability === 'firebox'" class="fire">防火箱</em>
              </dd>
            </div>
            <div><dt>司机</dt><dd>{{ driverName(waybill.driverId) }}</dd></div>
            <div><dt>运输时段</dt><dd>{{ waybill.shiftStart.replace("T", " ") }} ~ {{ waybill.shiftEnd.replace("T", " ") }}</dd></div>
            <div><dt>原库位</dt><dd>{{ slot(waybill.slotId)?.code }}（{{ slot(waybill.slotId)?.area }}）</dd></div>
          </dl>
          <p v-if="waybill.status === 'pending'" class="lock-hint idle-hint">
            📝 待派车：尚未占用车辆与库位；确认派车后联单冻结、资源正式占用。
          </p>
          <p v-else-if="waybill.status === 'review'" class="lock-hint">
            🔒 待复核：车辆与原库位继续锁定，复核完成前不释放。
          </p>
          <p v-else-if="waybill.status === 'transporting'" class="lock-hint">
            🚚 运输中：车辆与原库位已占用。
          </p>
          <p v-else class="review-note">✅ 已入库：车辆与原库位已释放。</p>
        </section>

        <section v-if="waybill.arrival" class="detail-block">
          <h3>到库接收</h3>
          <dl class="kv">
            <div><dt>实收包数</dt>
              <dd :class="{ mismatch: waybill.arrival.receivedPacks !== waybill.packCount }">
                {{ waybill.arrival.receivedPacks }} 包
              </dd>
            </div>
            <div><dt>破损数</dt><dd>{{ waybill.arrival.damagedPacks }} 包</dd></div>
            <div>
              <dt>入库凭证号</dt>
              <dd :class="{ mismatch: waybill.arrival.damagedPacks > 0 && !waybill.arrival.voucherNo }">
                {{ waybill.arrival.voucherNo || "缺失" }}
              </dd>
            </div>
            <div><dt>接收人</dt><dd>{{ waybill.arrival.operator }}</dd></div>
          </dl>
          <p v-if="waybill.reviewNote" class="review-note">复核结论：{{ waybill.reviewNote }}</p>
        </section>

        <nav class="tabs">
          <button v-if="waybill.status === 'pending'" type="button"
                  :class="{ active: tab === 'dispatch' }" @click="tab = 'dispatch'">派车核查</button>
          <button v-if="waybill.status === 'transporting'" type="button"
                  :class="{ active: tab === 'arrival' }" @click="tab = 'arrival'">到库录入</button>
          <button v-if="waybill.status === 'review'" type="button"
                  :class="{ active: tab === 'review' }" @click="tab = 'review'">复核处理</button>
          <button v-if="waybill.status !== 'completed'" type="button"
                  :class="{ active: tab === 'amend' }" @click="tab = 'amend'">
            改单<em v-if="frozen">（冻结，留痕）</em>
          </button>
        </nav>

        <!-- 待派车核查 -->
        <section v-if="tab === 'dispatch' && waybill.status === 'pending'" class="action-form">
          <p class="form-hint">
            确认派车前自动核查：司机/车辆班次是否重叠、温度是否需要防火箱车辆、库位是否被占用。
          </p>
          <Issues :issues="dispatchChecked ? dispatchIssues : pendingCheck" />
          <p v-if="pendingCheck.length === 0" class="review-note">
            ✅ 核查通过，可确认派车。联单确认后冻结，修改须走改单并填写原因。
          </p>
          <div class="actions">
            <button type="button" class="secondary" @click="runDispatchCheck">重新核查</button>
            <button type="button" :disabled="pendingCheck.length > 0" @click="submitDispatch">
              确认派车（冻结联单）
            </button>
          </div>
        </section>

        <!-- 到库录入 -->
        <form v-if="tab === 'arrival' && waybill.status === 'transporting'" class="action-form"
              @submit.prevent="submitArrival">
          <div class="form-row">
            <label>实收包数
              <input v-model.number="arrivalForm.receivedPacks" type="number" min="0" required />
            </label>
            <label>破损数
              <input v-model.number="arrivalForm.damagedPacks" type="number" min="0" required />
            </label>
          </div>
          <label>入库凭证号
            <input v-model="arrivalForm.voucherNo" placeholder="有破损时必填，如 RK2026092501" />
          </label>
          <label>仓库接收人
            <input v-model="arrivalForm.operator" placeholder="姓名" />
          </label>
          <Issues :issues="arrivalIssues" />
          <button type="submit">提交到库接收</button>
          <p class="form-hint">数量不符或破损缺少凭证时，联单进入待复核，车辆与原库位不释放。</p>
        </form>

        <!-- 复核处理 -->
        <form v-else-if="tab === 'review' && waybill.status === 'review'" class="action-form"
              @submit.prevent="submitReview">
          <div class="form-row">
            <label>核实实收包数
              <input v-model.number="reviewForm.receivedPacks" type="number" min="0" required />
            </label>
            <label>核实破损数
              <input v-model.number="reviewForm.damagedPacks" type="number" min="0" required />
            </label>
          </div>
          <label>入库凭证号（破损必须补齐）
            <input v-model="reviewForm.voucherNo" />
          </label>
          <label>复核结论
            <textarea v-model="reviewForm.reviewNote" placeholder="说明数量差异去向、破损处置方式等" />
          </label>
          <Issues :issues="reviewIssues" />
          <button type="submit">复核完成，释放车辆与原库位</button>
        </form>

        <!-- 改单 -->
        <form v-else-if="tab === 'amend'" class="action-form" @submit.prevent="submitAmend">
          <label>修改字段
            <select v-model="amendForm.field">
              <option v-for="f in amendableFields" :key="f.key" :value="f.key">{{ f.label }}</option>
            </select>
          </label>

          <label v-if="currentField?.type === 'number'">新值
            <input v-model="newValueMap[amendForm.field]" type="number" required />
          </label>
          <label v-else-if="currentField?.type === 'bool'">新值
            <select v-model="newValueMap[amendForm.field]">
              <option value="false">否</option>
              <option value="true">是</option>
            </select>
          </label>
          <label v-else-if="currentField?.type === 'vehicle'">新值
            <select v-model="newValueMap[amendForm.field]">
              <option v-for="v in store.db.vehicles" :key="v.id" :value="v.id">
                {{ v.plate }}｜{{ v.capability === "firebox" ? "防火箱" : "普通" }}
              </option>
            </select>
          </label>
          <label v-else-if="currentField?.type === 'driver'">新值
            <select v-model="newValueMap[amendForm.field]">
              <option v-for="d in store.db.drivers" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </label>
          <label v-else-if="currentField?.type === 'slot'">新值
            <select v-model="newValueMap[amendForm.field]">
              <option v-for="s in store.db.slots" :key="s.id" :value="s.id">
                {{ s.code }}｜{{ s.area }}
              </option>
            </select>
          </label>
          <label v-else>新值
            <input v-model="newValueMap[amendForm.field]" type="datetime-local" required />
          </label>

          <p v-if="!frozen" class="form-hint">联单尚未冻结，可直接修改，不产生改单留痕；确认派车后再改将保留旧值与原因。</p>
          <template v-if="frozen">
            <label>改单原因（必填，旧值与原因将永久保留）
              <textarea v-model="amendForm.reason" required />
            </label>
            <label>操作人
              <input v-model="amendForm.operator" placeholder="姓名" />
            </label>
          </template>
          <Issues :issues="amendIssues" />
          <button type="submit">确认改单</button>
        </form>

        <!-- 改单留痕 -->
        <section v-if="waybill.amendments.length" class="detail-block">
          <h3>改单记录</h3>
          <ul class="amend-list">
            <li v-for="a in waybill.amendments" :key="a.id">
              <p class="amend-head">{{ new Date(a.at).toLocaleString("zh-CN") }} · {{ a.operator }} · 原因：{{ a.reason }}</p>
              <p v-for="c in a.changes" :key="c.field" class="amend-change">
                {{ c.field }}：<del>{{ c.oldValue || "空" }}</del> → <strong>{{ c.newValue }}</strong>
              </p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
