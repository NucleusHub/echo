import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'

export default createRouter({
  history: createWebHistory('/echo/'),
  routes: [
    { path: '/', component: ChatView },
    { path: '/c/:chatId', component: ChatView, props: true },
  ],
})
