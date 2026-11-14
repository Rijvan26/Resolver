import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User, Organization } from "@/types";

export interface AuthState {
  user: User | null;
  organization: Organization | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
}

const getInitialState = (): AuthState => {
  if (typeof window === "undefined") {
    return {
      user: null,
      organization: null,
      accessToken: null,
      isAuthenticated: false,
      isInitialized: false,
    };
  }

  try {
    const token = localStorage.getItem("resolver_access_token");
    const userStr = localStorage.getItem("resolver_user");
    const orgStr = localStorage.getItem("resolver_org");

    if (token && userStr) {
      const user = JSON.parse(userStr);
      const organization = orgStr ? JSON.parse(orgStr) : null;
      return {
        user,
        organization,
        accessToken: token,
        isAuthenticated: true,
        isInitialized: true,
      };
    }
  } catch {
    // fallback
  }

  return {
    user: null,
    organization: null,
    accessToken: null,
    isAuthenticated: false,
    isInitialized: false,
  };
};

const initialState: AuthState = getInitialState();

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken?: string;
        user: User;
        organization: Organization;
      }>
    ) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.organization = action.payload.organization;
      state.isAuthenticated = true;
      state.isInitialized = true;
      try {
        localStorage.setItem("resolver_access_token", action.payload.accessToken);
        if (action.payload.refreshToken) {
          localStorage.setItem("resolver_refresh_token", action.payload.refreshToken);
        }
        localStorage.setItem("resolver_user", JSON.stringify(action.payload.user));
        localStorage.setItem("resolver_org", JSON.stringify(action.payload.organization));
      } catch {
        // ignore storage errors
      }
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
      state.isAuthenticated = true;
      try {
        localStorage.setItem("resolver_access_token", action.payload);
      } catch {
        // ignore
      }
    },
    setUserAndOrganization: (
      state,
      action: PayloadAction<{
        user: User;
        organization: Organization;
      }>
    ) => {
      state.user = action.payload.user;
      state.organization = action.payload.organization;
      state.isAuthenticated = true;
      state.isInitialized = true;
      try {
        localStorage.setItem("resolver_user", JSON.stringify(action.payload.user));
        localStorage.setItem("resolver_org", JSON.stringify(action.payload.organization));
      } catch {
        // ignore
      }
    },
    updateOrganizationState: (
      state,
      action: PayloadAction<Partial<Organization>>
    ) => {
      if (state.organization) {
        state.organization = { ...state.organization, ...action.payload };
        try {
          localStorage.setItem("resolver_org", JSON.stringify(state.organization));
        } catch {
          // ignore
        }
      }
    },
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload;
    },
    setUserHasPassword: (state, action: PayloadAction<boolean>) => {
      if (state.user) {
        state.user.hasPassword = action.payload;
        try {
          localStorage.setItem("resolver_user", JSON.stringify(state.user));
        } catch {
          // ignore
        }
      }
    },
    logoutState: (state) => {
      state.user = null;
      state.organization = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.isInitialized = true;
      try {
        localStorage.removeItem("resolver_access_token");
        localStorage.removeItem("resolver_refresh_token");
        localStorage.removeItem("resolver_user");
        localStorage.removeItem("resolver_org");
      } catch {
        // ignore
      }
    },
  },
});

export const {
  setCredentials,
  setAccessToken,
  setUserAndOrganization,
  updateOrganizationState,
  setInitialized,
  setUserHasPassword,
  logoutState,
} = authSlice.actions;

export default authSlice.reducer;
