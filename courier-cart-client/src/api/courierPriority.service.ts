import axiosInstance from './axiosInstance'

const API_BASE = '/courier/courier-priorities'

export type CourierPriorityCondition = {
  type: string
  operator?: string
  value?: string | string[]
  min?: number | string
  max?: number | string
}

export type CourierPriorityRule = {
  id?: string
  name: string
  rule_type?: 'profile' | 'rule'
  conditions?: CourierPriorityCondition[]
  is_active?: boolean
  sort_order?: number
  personalised_order?: {
    courierId: number | string
    priority: number
    name?: string
    integration_type?: string
    serviceProvider?: string
    max_slab_weight?: number | null
  }[]
}

export const courierPriorityService = {
  create: async (data: CourierPriorityRule) => {
    const res = await axiosInstance.post(API_BASE, data)
    return res.data
  },

  getByUser: async () => {
    const res = await axiosInstance.get(`${API_BASE}/user`)
    return res.data
  },

  getOne: async (id: number | string) => {
    const res = await axiosInstance.get(`${API_BASE}/${id}`)
    return res.data
  },

  update: async (
    id: number | string,
    data: Partial<CourierPriorityRule>,
  ) => {
    const res = await axiosInstance.put(`${API_BASE}/${id}`, data)
    return res.data
  },

  delete: async (id: number | string) => {
    const res = await axiosInstance.delete(`${API_BASE}/${id}`)
    return res.data
  },
}
