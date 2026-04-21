"use client";
import { useCallback } from "react";
import {
  createTransaction, updateTransaction, deleteTransaction,
  createCategory, updateCategory, deleteCategory,
  createGoal, updateGoal, deleteGoal,
  createRule, deleteRule,
} from "@/lib/db/client";

/**
 * Thin wrappers so components can import a single object of write actions.
 * Each returns the server/optimistic row so callers can react to success.
 */
export function useTxnWrites() {
  return {
    create: useCallback((p: any) => createTransaction(p), []),
    update: useCallback((id: string, p: any) => updateTransaction(id, p), []),
    remove: useCallback((id: string) => deleteTransaction(id), []),
  };
}
export function useCategoryWrites() {
  return {
    create: useCallback((p: any) => createCategory(p), []),
    update: useCallback((id: string, p: any) => updateCategory(id, p), []),
    remove: useCallback((id: string) => deleteCategory(id), []),
  };
}
export function useGoalWrites() {
  return {
    create: useCallback((p: any) => createGoal(p), []),
    update: useCallback((id: string, p: any) => updateGoal(id, p), []),
    remove: useCallback((id: string) => deleteGoal(id), []),
  };
}
export function useRuleWrites() {
  return {
    create: useCallback((p: any) => createRule(p), []),
    remove: useCallback((id: string) => deleteRule(id), []),
  };
}
