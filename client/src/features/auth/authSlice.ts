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
  user: {
    id: "6ae9ecbcb126ec0012345678",
    name: "Alex Rivera",
    email: "alex.rivera@resolver.internal",
    role: "SUPER_ADMIN" as any,
    organizationId: "6ae9ecbcb126ec0087654321",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  organization: {
    id: "6ae9ecbcb126ec0087654321",
    name: "Resolver SRE",
    slug: "resolver-sre",
    statusPageEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  accessToken: "dev-initial-token",
  isAuthenticated: true,
  isInitialized: true,
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

