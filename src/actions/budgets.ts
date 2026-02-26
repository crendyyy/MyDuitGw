"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getBudgets() {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw new Error("Unauthorized");
    const userId = (session.user as any).id;

    const budgets = await prisma.budget.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
    });

    const budgetsWithUsage = await Promise.all(
        budgets.map(async (budget) => {
            const resetDate = new Date(budget.start_date).getDate();
            const now = new Date();
            const currentStart = new Date(now.getFullYear(), now.getMonth(), resetDate);
            if (now.getDate() < resetDate) {
                currentStart.setMonth(currentStart.getMonth() - 1);
            }
            const currentEnd = new Date(currentStart);
            currentEnd.setMonth(currentEnd.getMonth() + 1);
            currentEnd.setDate(currentEnd.getDate() - 1);

            const usedRaw = await prisma.transaction.aggregate({
                _sum: { amount: true },
                where: {
                    user_id: userId,
                    type: "EXPENSE",
                    category: budget.category,
                    date: {
                        gte: currentStart,
                        lte: currentEnd,
                    },
                },
            });

            return {
                ...budget,
                used: usedRaw._sum.amount || 0,
            };
        })
    );

    return budgetsWithUsage;
}

export async function addBudget(data: {
    category: string;
    amount: number;
    period: string;
    start_date: Date;
    end_date: Date;
}) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return { error: "Sesi tidak valid." };

    try {
        const budget = await prisma.budget.create({
            data: {
                ...data,
                user_id: String(userId),
            },
        });

        revalidatePath("/dashboard");
        return { success: true, data: budget };
    } catch (error: any) {
        console.error("DEBUG_ERROR: Failed to add budget. UserId:", userId, "Data:", data, "Error:", error);
        return { error: "Gagal membuat anggaran." };
    }
}

export async function deleteBudget(id: string) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return { error: "Sesi tidak valid." };

    try {
        await prisma.budget.delete({
            where: { id, user_id: String(userId) },
        });

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        console.error("DEBUG_ERROR: Failed to delete budget:", error);
        return { error: "Gagal menghapus anggaran." };
    }
}

export async function updateBudget(id: string, data: {
    category: string;
    amount: number;
    start_date: Date;
    end_date: Date;
}) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return { error: "Sesi tidak valid." };

    try {
        const budget = await prisma.budget.update({
            where: { id, user_id: String(userId) },
            data: {
                category: data.category,
                amount: data.amount,
                start_date: data.start_date,
                end_date: data.end_date,
            },
        });

        revalidatePath("/dashboard");
        return { success: true, data: budget };
    } catch (error: any) {
        console.error("DEBUG_ERROR: Failed to update budget:", error);
        return { error: "Gagal memperbarui anggaran." };
    }
}
