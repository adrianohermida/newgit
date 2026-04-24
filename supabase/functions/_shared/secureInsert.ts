import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SecureInsertContext = {
  serviceClient: ReturnType<typeof createClient>;
  userId?: string | null;
  userEmail?: string | null;
  workspaceId?: string | null;
  tenantId?: string | null;
  allowWorkspaceBypass?: boolean;
};

export async function resolveSecureWorkspaceId(
  serviceClient: ReturnType<typeof createClient>,
  {
    userId,
    userEmail,
    workspaceId,
    tenantId,
  }: Omit<SecureInsertContext, "serviceClient">
) {
  const requestedWorkspaceId = workspaceId || tenantId || null;

  let membershipQuery = serviceClient
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("active", true);

  if (requestedWorkspaceId) {
    membershipQuery = membershipQuery.eq("workspace_id", requestedWorkspaceId);
  }

  if (userId) {
    membershipQuery = membershipQuery.eq("user_id", userId);
  } else if (userEmail) {
    membershipQuery = membershipQuery.eq("user_email", userEmail);
  }

  if (userId || userEmail) {
    const { data: membership, error: membershipError } = await membershipQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (membership?.workspace_id) {
      return membership.workspace_id as string;
    }
  }

  let ownerQuery = serviceClient.from("workspaces").select("id, created_at");
  if (requestedWorkspaceId) {
    ownerQuery = ownerQuery.eq("id", requestedWorkspaceId);
  }

  if (userId) {
    ownerQuery = ownerQuery.eq("created_by_user_id", userId);
  } else if (userEmail) {
    ownerQuery = ownerQuery.eq("owner_email", userEmail);
  }

  if (userId || userEmail) {
    const { data: workspace, error: workspaceError } = await ownerQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (workspaceError) throw workspaceError;
    if (workspace?.id) {
      return workspace.id as string;
    }
  }

  throw new Error("Workspace access not found for authenticated user");
}

export async function createSecureInsert(context: SecureInsertContext) {
  const resolvedWorkspaceId = context.allowWorkspaceBypass && (context.workspaceId || context.tenantId)
    ? String(context.workspaceId || context.tenantId)
    : await resolveSecureWorkspaceId(context.serviceClient, context);

  return async function secureInsert(
    table: string,
    data: Record<string, unknown> | Array<Record<string, unknown>> = {}
  ) {
    const toPayload = (entry: Record<string, unknown>) => {
      const payload = Object.fromEntries(
        Object.entries({
          ...entry,
          workspace_id: resolvedWorkspaceId,
        }).filter(([, value]) => value !== undefined)
      );

      delete payload.tenant_id;
      return payload;
    };

    const payload = Array.isArray(data) ? data.map(toPayload) : toPayload(data);

    const query = context.serviceClient
      .from(table)
      .insert(payload)
      .select();

    const { data: inserted, error } = Array.isArray(data)
      ? await query
      : await query.maybeSingle();

    if (error) {
      throw error;
    }

    return inserted;
  };
}