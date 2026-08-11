// v2.0 客户鉴权 store
// 客户 token 存 sessionStorage（会话级）

import { create } from 'zustand';
import { customerTokenStorage } from '../services/request.js';
import { customerAccess, requestCustomerAccess } from '../services/api/index.js';

interface CustomerUser {
  id: string;
  phone: string;
  name: string | null;
}

interface CustomerAuthState {
  token: string | null;
  customer: CustomerUser | null;
  loading: boolean;
  verify: (authCode: string, phone: string, customerName?: string) => Promise<string | null>;
  requestAccess: (phone: string, customerName?: string, note?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useCustomerAuthStore = create<CustomerAuthState>((set, get) => ({
  token: customerTokenStorage.get(),
  customer: null,
  loading: false,

  verify: async (authCode: string, phone: string, _customerName?: string) => {
    set({ loading: true });
    try {
      const result = await customerAccess(phone, authCode);
      customerTokenStorage.set(result.token);
      set({
        token: result.token,
        customer: result.customer,
        loading: false,
      });
      return null;
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  requestAccess: async (phone: string, _customerName?: string, _note?: string) => {
    await requestCustomerAccess(phone);
  },

  logout: () => {
    customerTokenStorage.clear();
    set({ token: null, customer: null });
  },

  isAuthenticated: () => get().token !== null,
}));
