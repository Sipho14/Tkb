// Plan tiers, priced in ZAR. Determined by how many students the business expects
// to enroll — the owner picks one at signup; support can move them up/down later.
export const PLAN_TIERS = [
  { id: 'starter', name: 'Starter', maxStudents: 20, priceCents: 85000 },
  { id: 'growth', name: 'Growth', maxStudents: 50, priceCents: 159000 },
  { id: 'established', name: 'Established', maxStudents: 100, priceCents: 249000 },
  { id: 'fleet', name: 'Fleet', maxStudents: Infinity, priceCents: 359000 }
];

export function tierForStudentCount(count) {
  const n = Number(count) || 0;
  return PLAN_TIERS.find((t) => n <= t.maxStudents) || PLAN_TIERS[PLAN_TIERS.length - 1];
}

export function tierById(id) {
  return PLAN_TIERS.find((t) => t.id === id) || PLAN_TIERS[0];
}
