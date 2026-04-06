import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().email().optional().or(z.literal('')),
  role: z.enum(["CUSTOMER", "DRIVER", "ADMIN"]).default("CUSTOMER"),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const role = request.nextUrl.searchParams.get("role");
    const status = request.nextUrl.searchParams.get("status");
    const search = request.nextUrl.searchParams.get("search");

    const where: Record<string, unknown> = { deletedAt: null };
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          email: true,
          name: true,
          role: true,
          status: true,
          avatarUrl: true,
          createdAt: true,
          customerProfile: {
            select: { totalTrips: true, averageRating: true },
          },
          driverProfile: {
            select: {
              totalTrips: true,
              averageRating: true,
              isVerified: true,
              verificationStatus: true,
              isOnline: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return successResponse({
      users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[ADMIN] List users error:", error);
    return errorResponse("Failed to list users", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const body = await request.json();
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || "Invalid data", 400);
    }
    const { name, phone, email, role } = parsed.data;

    // Check phone uniqueness within the same role only
    const existing = await prisma.user.findFirst({ where: { phone, role } });
    if (existing) return errorResponse(`Phone number already registered as ${role}`, 409);

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email: email || null,
        role,
        status: "ACTIVE",
      },
      select: { id: true, name: true, phone: true, email: true, role: true, status: true, createdAt: true },
    });

    // Create profile based on role
    if (role === "CUSTOMER") {
      await prisma.customerProfile.create({ data: { userId: user.id } });
    } else if (role === "DRIVER") {
      await prisma.driverProfile.create({ data: { userId: user.id } });
    } else if (role === "ADMIN") {
      await prisma.adminProfile.create({ data: { userId: user.id } });
    }

    return successResponse(user, "User created successfully");
  } catch (error) {
    console.error("[ADMIN] Create user error:", error);
    return errorResponse("Failed to create user", 500);
  }
}
