import { NextRequest } from "next/server";
import { ZodSchema, ZodError } from "zod";
import { errorResponse } from "@/lib/api-response";

export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: ReturnType<typeof errorResponse> }> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { data };
  } catch (err) {
    if (err instanceof ZodError) {
      const messages = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
      return { error: errorResponse(`Validation error: ${messages.join(", ")}`, 422) };
    }
    return { error: errorResponse("Invalid request body", 400) };
  }
}

export function validateQuery<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): { data: T } | { error: ReturnType<typeof errorResponse> } {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const data = schema.parse(params);
    return { data };
  } catch (err) {
    if (err instanceof ZodError) {
      const messages = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
      return { error: errorResponse(`Validation error: ${messages.join(", ")}`, 422) };
    }
    return { error: errorResponse("Invalid query parameters", 400) };
  }
}
