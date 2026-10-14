<script setup lang="ts">
defineProps<{
  sharing: boolean
  busy: boolean
  canStart: boolean
  canKick: boolean
}>()

defineEmits<{
  start: []
  stop: []
  kick: []
  switchSource: []
}>()
</script>

<template>
  <div class="share-actions">
    <button v-if="!sharing" class="btn primary" type="button" :disabled="!canStart || busy" @click="$emit('start')">
      {{ busy ? '正在连接屏幕…' : '开始分享' }}
    </button>
    <template v-else>
      <button class="btn danger" type="button" :disabled="busy" @click="$emit('stop')">停止分享</button>
      <button class="btn" type="button" :disabled="busy" @click="$emit('switchSource')">更换来源</button>
    </template>
    <button v-if="canKick" class="btn ghost" type="button" @click="$emit('kick')">结束当前分享</button>
  </div>
</template>
