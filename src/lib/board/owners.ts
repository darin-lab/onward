export const owners = [
  { name: "Darin Dinis", email: "darin@drivenautocare.com" },
  { name: "Arun", email: "arun@drivenautocare.com" },
] as const;

export function isOwnerEmail(email: string | null | undefined) {
  if (!email) return false;
  const normal = email.trim().toLowerCase();
  return owners.some((owner) => owner.email === normal);
}
