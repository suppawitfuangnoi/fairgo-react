/**
 * POST /api/v1/admin/users/:id/unsuspend — reinstate a suspended user
 * Thin wrapper that re-uses the suspend logic with isSuspend=false.
 */
export { POST } from "@/app/api/v1/admin/users/[id]/suspend/route";
