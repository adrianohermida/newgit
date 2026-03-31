export const FALLBACK_SUPERADMIN = {
  id: "6acf3ef5-34e3-4606-9f5b-4cf714ee8841",
  email: "adrianohermida@gmail.com",
  full_name: "Adriano Hermida Maia",
  role: "superadmin",
  is_active: true,
};

export function isFallbackSuperadminIdentity(user) {
  if (!user) return false;

  const userId = String(user.id || "").trim().toLowerCase();
  const email = String(user.email || "").trim().toLowerCase();

  return (
    userId === FALLBACK_SUPERADMIN.id.toLowerCase() &&
    email === FALLBACK_SUPERADMIN.email.toLowerCase()
  );
}

export function getFallbackSuperadminProfile() {
  return { ...FALLBACK_SUPERADMIN };
}
