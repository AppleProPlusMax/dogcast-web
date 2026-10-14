<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <div class="toasts" aria-live="polite">
    <button
      v-for="item in ui.toasts"
      :key="item.id"
      class="toast"
      :data-tone="item.tone"
      type="button"
      @click="ui.dismiss(item.id)"
    >
      {{ item.text }}
    </button>
  </div>
</template>
