import { freshsalesRequest, viewFreshsalesSalesAccount } from "./freshsales-crm.js";

function normalizeTag(value) {
  return String(value || "").trim();
}

function buildUniqueTags(tags = []) {
  const seen = new Set();
  return tags
    .map(normalizeTag)
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function hasTag(tags = [], expected = "") {
  const normalizedExpected = normalizeTag(expected).toLowerCase();
  return buildUniqueTags(tags).some((tag) => tag.toLowerCase() === normalizedExpected);
}

export async function syncFreshsalesAccountTag(env, {
  accountId,
  tag,
  active = true,
} = {}) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedTag = normalizeTag(tag);
  if (!normalizedAccountId || !normalizedTag) {
    return { skipped: true, reason: "missing_account_or_tag" };
  }

  const account = await viewFreshsalesSalesAccount(env, normalizedAccountId);
  const currentTags = buildUniqueTags(account?.tags || []);
  const alreadyTagged = hasTag(currentTags, normalizedTag);
  if (active && alreadyTagged) {
    return { ok: true, changed: false, tags: currentTags, action: "already_present" };
  }
  if (!active && !alreadyTagged) {
    return { ok: true, changed: false, tags: currentTags, action: "already_removed" };
  }

  const nextTags = active
    ? buildUniqueTags([...currentTags, normalizedTag])
    : buildUniqueTags(currentTags.filter((item) => item.toLowerCase() !== normalizedTag.toLowerCase()));

  const { payload } = await freshsalesRequest(
    env,
    `/sales_accounts/${encodeURIComponent(normalizedAccountId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        sales_account: {
          tags: nextTags,
        },
      }),
    }
  );

  const updatedAccount = payload?.sales_account || payload || {};
  return {
    ok: true,
    changed: true,
    action: active ? "tag_added" : "tag_removed",
    tags: buildUniqueTags(updatedAccount?.tags || nextTags),
  };
}
