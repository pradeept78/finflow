// Separate module to avoid circular dep: Layout → adminApi → authStore → api → Layout
import api from './axios'

export const checkIsAdmin = () => api.get<{ data: boolean }>('/admin/me/is-admin').then(r => r.data.data)
