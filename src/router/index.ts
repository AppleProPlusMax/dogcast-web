import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import RoomView from '@/views/RoomView.vue'
import SettingsView from '@/views/SettingsView.vue'
import WatchView from '@/views/WatchView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/login', redirect: '/' },
    { path: '/register', redirect: '/' },
    { path: '/room', component: RoomView },
    { path: '/watch/:code', component: WatchView },
    { path: '/settings', component: SettingsView },
  ],
})
