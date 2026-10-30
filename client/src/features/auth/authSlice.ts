import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User, Organization } from "@/types";

export interface AuthState {
  user: User | null;
  organization: Organization | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
}

const initialState: AuthState = {
  user: null,
  organization: null,
  accessToken: null,
  isAuthenticated: false,
  isInitialized: false,
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        accessToken: string;
        user: User;
        organization: Organization;
      }>
    ) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.organization = action.payload.organization;
      state.isAuthenticated = true;
      state.isInitialized = true;
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
      state.isAuthenticated = true;
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
    },
    updateOrganizationState: (
      state,
      action: PayloadAction<Partial<Organization>>
    ) => {
      if (state.organization) {
        state.organization = { ...state.organization, ...action.payload };
      }
    },
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload;
    },
    logoutState: (state) => {
      state.user = null;
      state.organization = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.isInitialized = true;
    },
  },
});

export const {
  setCredentials,
  setAccessToken,
  setUserAndOrganization,
  updateOrganizationState,
  setInitialized,
  logoutState,
} = authSlice.actions;

export default authSlice.reducer;

