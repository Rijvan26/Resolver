import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

export const TAG_TYPES = [
  "Auth",
  "Organization",
  "Members",
  "Invitations",
  "Incidents",
  "IncidentDetails",
  "IncidentAi",
  "Comments",
  "Timeline",
  "Notifications",
  "UnreadNotificationCount",
  "Dashboard",
] as const;

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: TAG_TYPES,
  endpoints: () => ({}),
});

