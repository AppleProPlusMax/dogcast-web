<script setup lang="ts">
import type { MemberOnline } from '@/types/protocol'

defineProps<{
  members: MemberOnline[]
  selfConnId: string | null
  publisherConnId?: string
  viewerConnIds: string[]
}>()
</script>

<template>
  <ul class="members">
    <li v-if="members.length === 0" class="member empty">还没有人在线</li>
    <li v-for="member in members" :key="member.connId" class="member">
      <span class="avatar">{{ member.displayName.slice(0, 1) }}</span>
      <span class="who">
        <strong>{{ member.displayName }}</strong>
        <small v-if="member.connId === selfConnId">我</small>
      </span>
      <span v-if="member.connId === publisherConnId" class="pill live">分享中</span>
      <span v-else-if="viewerConnIds.includes(member.connId)" class="pill">观看中</span>
    </li>
  </ul>
</template>
