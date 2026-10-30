import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  PaginatedNotifications,
  NotificationItem,
} from "@/types";

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  unread?: boolean;
}

export const notificationsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listNotifications: builder.query<
      ApiSuccessResponse<PaginatedNotifications>,
      ListNotificationsQuery | void
    >({
      query: (params) => ({
        url: "/notifications",
        method: "GET",
        params: params || {},
      }),
      providesTags: (result) =>
        result?.data?.notifications
          ? [
              ...result.data.notifications.map(({ id }) => ({
                type: "Notifications" as const,
                id,
              })),
              { type: "Notifications", id: "LIST" },
            ]
          : [{ type: "Notifications", id: "LIST" }],
    }),

    getUnreadNotificationCount: builder.query<
      ApiSuccessResponse<{ unreadCount: number }>,
      void
    >({
      query: () => ({
        url: "/notifications/unread-count",
        method: "GET",
      }),
      providesTags: ["UnreadNotificationCount"],
    }),

    markNotificationAsRead: builder.mutation<
      ApiSuccessResponse<NotificationItem>,
      string
    >({
      query: (notificationId) => ({
        url: `/notifications/${notificationId}/read`,
        method: "PATCH",
      }),
      invalidatesTags: ["Notifications", "UnreadNotificationCount"],
    }),

    markAllNotificationsAsRead: builder.mutation<
      ApiSuccessResponse<{ message: string; modifiedCount: number }>,
      void
    >({
      query: () => ({
        url: "/notifications/read-all",
        method: "PATCH",
      }),
      invalidatesTags: ["Notifications", "UnreadNotificationCount"],
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useGetUnreadNotificationCountQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
} = notificationsApi;

