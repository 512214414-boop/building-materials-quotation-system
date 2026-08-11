// 员工鉴权 store
// 权限以 /auth/me 与登录返回的导航叶子权限图为准

import { create } from 'zustand';
import { staffTokenStorage } from '../services/request.js';
import { staffLogin, getMe } from '../services/api/index.js';
import {
  parseViewPermissions,
  type RoleCode,
  type ViewPermissions,
} from '../types/index.js';

interface StaffUser {
  id: string;
  username: string;
  realName: string;
  roles: RoleCode[];
  viewPermissions: ViewPermissions;
}

interface StaffAuthState {
  token: string | null;
  user: StaffUser | null;
  loading: boolean;
  initialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasView: (view: string, level?: 'ro' | 'rw') => boolean;
}

export const useStaffAuthStore = create<StaffAuthState>((set, get) => ({
  token: staffTokenStorage.get(),
  user: null,
  loading: false,
  initialized: false,

  login: async (username: string, password: string) => {
    set({ loading: true });
    try {
      const result = await staffLogin(username, password);
      staffTokenStorage.set(result.token);
      const user = {
        ...result.user,
        viewPermissions: parseViewPermissions(result.user.viewPermissions),
      };
      set({ token: result.token, user, loading: false, initialized: true });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  fetchMe: async () => {
    const token = staffTokenStorage.get();
    if (!token) {
      set({ initialized: true, user: null, token: null });
      return;
    }
    try {
      set({ loading: true });
      const me = await getMe();
      if (me.type === 'staff') {
        const user = {
          ...me.user,
          viewPermissions: parseViewPermissions(me.user.viewPermissions),
        };
        set({ user, loading: false, initialized: true });
      } else {
        staffTokenStorage.clear();
        set({ user: null, token: null, loading: false, initialized: true });
      }
    } catch {
      staffTokenStorage.clear();
      set({ user: null, token: null, loading: false, initialized: true });
    }
  },

  logout: () => {
    staffTokenStorage.clear();
    set({ token: null, user: null });
  },

  isAuthenticated: () => get().token !== null && get().user !== null,

  hasView: (view: string, level: 'ro' | 'rw' = 'ro') => {
    const user = get().user;
    if (!user) return false;
    const perm = user.viewPermissions[view as keyof ViewPermissions] ?? 'none';
    if (perm === 'none') return false;
    if (level === 'ro') return perm === 'ro' || perm === 'rw';
    return perm === 'rw';
  },
}));
