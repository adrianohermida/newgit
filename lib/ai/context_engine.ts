// CONTEXT ENGINE - coleta contexto operacional
export type UserContext = {
  route: string;
  entityId?: string;
  entityType?: string;
  recentActivity?: any[];
  userRole?: string;
};

export function getCurrentContext({ route, entityId, entityType, recentActivity, userRole }: Partial<UserContext>): UserContext {
  return {
    route: route || "/",
    entityId: entityId || undefined,
    entityType: entityType || undefined,
    recentActivity: recentActivity || [],
    userRole: userRole || "user",
  };
}
