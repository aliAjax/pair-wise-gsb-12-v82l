<script setup lang="ts">
defineProps<{ title: string; width?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal" :style="width ? { maxWidth: width } : undefined">
      <header class="modal-head">
        <h3>{{ title }}</h3>
        <button type="button" class="icon-btn" @click="emit('close')">×</button>
      </header>
      <div class="modal-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="modal-foot">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
