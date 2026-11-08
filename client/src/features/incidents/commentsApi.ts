import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  Comment,
  PaginatedComments,
} from "@/types";

export interface ListCommentsParams {
  incidentId: string;
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

export interface CreateCommentPayload {
  incidentId: string;
  content: string;
  parentId?: string | null;
}

export interface UpdateCommentPayload {
  incidentId: string;
  commentId: string;
  content: string;
}

export interface DeleteCommentPayload {
  incidentId: string;
  commentId: string;
}

export const commentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listComments: builder.query<ApiSuccessResponse<PaginatedComments>, ListCommentsParams>({
      query: ({ incidentId, page = 1, limit = 20, sortOrder = "asc" }) => ({
        url: `/incidents/${incidentId}/comments`,
        method: "GET",
        params: { page, limit, sortOrder },
      }),
      providesTags: (result, _error, { incidentId }) =>
        result?.data?.comments
          ? [
              ...result.data.comments.map(({ id }) => ({ type: "Comments" as const, id })),
              { type: "Comments", id: incidentId },
            ]
          : [{ type: "Comments", id: incidentId }],
    }),

    listReplies: builder.query<ApiSuccessResponse<Comment[]>, { incidentId: string; commentId: string }>({
      query: ({ incidentId, commentId }) => ({
        url: `/incidents/${incidentId}/comments/${commentId}/replies`,
        method: "GET",
      }),
      providesTags: (_result, _error, { commentId }) => [
        { type: "Comments", id: `replies-${commentId}` },
      ],
    }),

    createComment: builder.mutation<ApiSuccessResponse<Comment>, CreateCommentPayload>({
      query: ({ incidentId, content, parentId }) => ({
        url: `/incidents/${incidentId}/comments`,
        method: "POST",
        body: { content, ...(parentId ? { parentId } : {}) },
      }),
      invalidatesTags: (_result, _error, { incidentId, parentId }) => [
        { type: "Comments", id: incidentId },
        { type: "Timeline", id: incidentId },
        ...(parentId ? [{ type: "Comments" as const, id: `replies-${parentId}` }] : []),
      ],
    }),

    updateComment: builder.mutation<ApiSuccessResponse<Comment>, UpdateCommentPayload>({
      query: ({ incidentId, commentId, content }) => ({
        url: `/incidents/${incidentId}/comments/${commentId}`,
        method: "PATCH",
        body: { content },
      }),
      invalidatesTags: (_result, _error, { incidentId, commentId }) => [
        { type: "Comments", id: commentId },
        { type: "Comments", id: incidentId },
        { type: "Timeline", id: incidentId },
      ],
    }),

    deleteComment: builder.mutation<ApiSuccessResponse<null>, DeleteCommentPayload>({
      query: ({ incidentId, commentId }) => ({
        url: `/incidents/${incidentId}/comments/${commentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { incidentId }) => [
        { type: "Comments", id: incidentId },
        { type: "Timeline", id: incidentId },
      ],
    }),
  }),
});

export const {
  useListCommentsQuery,
  useListRepliesQuery,
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useDeleteCommentMutation,
} = commentsApi;

