import { NextResponse } from "next/server";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export function successResponse<T>(data: T, message?: string, status = 200) {
  return NextResponse.json(
    { success: true, data, message } satisfies ApiResponse<T>,
    { status }
  );
}

export function errorResponse(error: string, status = 400, meta?: Record<string, unknown>) {
  return NextResponse.json(
    { success: false, error, ...(meta ? { meta } : {}) } satisfies ApiResponse,
    { status }
  );
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    } satisfies ApiResponse<T[]>,
    { status: 200 }
  );
}
