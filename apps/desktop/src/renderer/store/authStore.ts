import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const AUTH_STORE_STORAGE_KEY = "yishan-auth-store";

type AuthStoreState = {
  isAuthenticated: boolean;
  authStatusResolved: boolean;
  setAuthState: (isAuthenticated: boolean, authStatusResolved: boolean) => void;
};

/** Stores one persisted signed-in flag used to gate app shell routes. */
export const authStore = create<AuthStoreState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      authStatusResolved: false,
      setAuthState: (isAuthenticated, authStatusResolved) => {
        set({ isAuthenticated, authStatusResolved });
      },
    }),
    {
      name: AUTH_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        authStatusResolved: state.authStatusResolved,
      }),
    },
  ),
);
