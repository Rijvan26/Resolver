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

    createComment: builder.mutation<ApiSuccessResponse<Comment>, CreateCommentPayload>({
      query: ({ incidentId, content }) => ({
        url: `/incidents/${incidentId}/comments`,
        method: "POST",
        body: { content },
      }),
      invalidatesTags: (_result, _error, { incidentId }) => [
        { type: "Comments", id: incidentId },
        { type: "Timeline", id: incidentId },
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
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useDeleteCommentMutation,
} = commentsApi;

