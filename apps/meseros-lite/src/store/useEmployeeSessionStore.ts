"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import api from "@/lib/api";

export interface LiteEmployee {
  id: string;
  name: string;
  role: string;
  locationId?: string | null;
}

interface EmployeeSessionState {
  employee: LiteEmployee | null;
  token: string | null;
  isAuthenticated: boolean;
  loginWithPin: (pin: string) => Promise<void>;
  logout: () => void;
}

const clearEmployeeSession = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("tpv-access-token");
  localStorage.removeItem("tpv-employee-token");
  localStorage.removeItem("currentEmployeeId");
  localStorage.removeItem("currentEmployeeName");
  localStorage.removeItem("currentEmployeeRole");
};

const saveEmployeeSession = (employee: LiteEmployee, token: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("tpv-employee-token", token);
  sessionStorage.setItem("tpv-access-token", token);
  localStorage.setItem("currentEmployeeId", employee.id);
  localStorage.setItem("currentEmployeeName", employee.name);
  localStorage.setItem("currentEmployeeRole", employee.role);
};

export const useEmployeeSessionStore = create<EmployeeSessionState>()(
  persist(
    (set) => ({
      employee: null,
      token: null,
      isAuthenticated: false,
      loginWithPin: async (pin: string) => {
        const response = await api.post<{ employee: LiteEmployee; token: string }>(
          "/api/employees/login",
          { pin },
        );
        const employee = response.data.employee;
        const token = response.data.token;
        saveEmployeeSession(employee, token);
        set({ employee, token, isAuthenticated: true });
      },
      logout: () => {
        clearEmployeeSession();
        set({ employee: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: "meseros-lite-employee-session",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        employee: state.employee,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state || typeof window === "undefined") return;
        const token = localStorage.getItem("tpv-employee-token");
        const employeeId = localStorage.getItem("currentEmployeeId");
        if (!token || !employeeId) {
          state.logout();
        }
      },
    },
  ),
);
