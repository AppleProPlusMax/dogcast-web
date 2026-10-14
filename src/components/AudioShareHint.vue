<script setup lang="ts">
import { ref } from 'vue'
import { detectCapability } from '@/utils/browser-capability'

defineProps<{ open: boolean }>()

const emit = defineEmits<{
  confirm: [dontShowAgain: boolean]
  cancel: []
}>()

const capability = detectCapability()
const skipNext = ref(false)

function confirm() {
  emit('confirm', skipNext.value)
}
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="audio-hint-title">
      <p class="eyebrow">分享前</p>
      <h2 id="audio-hint-title">把声音也带上</h2>
      <ol>
        <li>接下来浏览器会弹出选择窗口，请勾选「分享音频 / Share audio」。</li>
        <li>{{ capability.audioAdvice }}</li>
        <li>如果没勾上，其他人仍然能看到画面，只是没有声音。</li>
      </ol>
      <label class="check">
        <input v-model="skipNext" type="checkbox" />
        <span>下次不再提示</span>
      </label>
      <div class="dialog-actions">
        <button class="btn ghost" type="button" @click="emit('cancel')">取消</button>
        <button class="btn primary" type="button" @click="confirm">继续分享</button>
      </div>
    </div>
  </div>
</template>
