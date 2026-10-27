import type { Category, PersonKind, Shop, Tech, WeekLog } from "@/lib/board/model";

export const seedShops: Shop[] = [
  {
    id: "fremont",
    name: "Fremont",
    address: "40931 Albrae St",
  },
  {
    id: "campbell",
    name: "Campbell",
    address: "335 E McGlincy Ln #3",
  },
  {
    id: "san-ramon",
    name: "San Ramon",
    address: "12831 Alcosta Blvd B",
  },
  {
    id: "san-jose",
    name: "San Jose",
    address: "297 E Taylor St",
  },
  {
    id: "castro-valley",
    name: "Castro Valley",
    address: "2769 Castro Valley Blvd",
  },
];

export const seedCategories: Category[] = [
  {
    id: "t-talk",
    name: "Clear Communication",
    hint: "People knew what you meant",
    kind: "technician",
  },
  {
    id: "t-moving",
    name: "Kept the shop moving",
    hint: "The week's work had a steady pace",
    kind: "technician",
  },
  {
    id: "t-team",
    name: "Being a Team Player",
    hint: "You helped the people around you",
    kind: "technician",
  },
  {
    id: "t-safe",
    name: "Kept the shop safe",
    hint: "The week stayed safe for everyone",
    kind: "technician",
  },
  {
    id: "m-talk",
    name: "Every Second Counts",
    hint: "We move with urgency. Time is valuable for the customer, the team, and the shop.",
    kind: "manager",
  },
  {
    id: "m-moving",
    name: "Always Raising Standards",
    hint: "We do not settle for good enough. Quality, honest communication, and a better way.",
    kind: "manager",
  },
  {
    id: "m-team",
    name: "Lead by Example",
    hint: "Leadership is action. The standard is how they show up, not the title.",
    kind: "manager",
  },
  {
    id: "m-safe",
    name: "Love What You Do",
    hint: "Pride in the work. Customers feel it, and the team respects it.",
    kind: "manager",
  },
];

type SeedPerson = {
  id: string;
  name: string;
  role: string;
  kind: PersonKind;
  shopId: string;
  serviceHours?: number;
  billedHours?: number;
};

const seedPeople: SeedPerson[] = [
  { id: "jon", name: "Jon Kearns", role: "General Manager", kind: "manager", shopId: "san-ramon" },
  { id: "david", name: "David Turner", role: "General Manager", kind: "manager", shopId: "castro-valley" },
  { id: "israel", name: "Israel Quiroz", role: "General Manager", kind: "manager", shopId: "fremont" },
  { id: "dillon", name: "Dillon Horst", role: "General Manager", kind: "manager", shopId: "campbell" },
  { id: "kevin", name: "Kevin Nguyen", role: "General Manager", kind: "manager", shopId: "san-jose" },
  { id: "antonio", name: "Antonio Ron", role: "Technician", kind: "technician", shopId: "san-ramon", serviceHours: 16.82, billedHours: 17.85 },
  { id: "tim", name: "Tim Stone", role: "Technician", kind: "technician", shopId: "san-ramon", serviceHours: 12.25, billedHours: 8.75 },
  { id: "jim", name: "Jim Tang", role: "Technician", kind: "technician", shopId: "castro-valley", serviceHours: 20.58, billedHours: 12.1 },
  { id: "francisco", name: "Francisco Gutierrez", role: "Technician", kind: "technician", shopId: "castro-valley", serviceHours: 16.17, billedHours: 12.05 },
  { id: "nathan", name: "Nathan Licayan", role: "Technician", kind: "technician", shopId: "fremont", serviceHours: 14.71, billedHours: 10.3 },
  { id: "jeremiah", name: "Jeremiah Cronk", role: "Technician", kind: "technician", shopId: "fremont", serviceHours: 9.06, billedHours: 11.25 },
  { id: "edgar", name: "Edgar Carmona", role: "Technician", kind: "technician", shopId: "campbell", serviceHours: 9.73, billedHours: 7.65 },
  { id: "duy", name: "Duy Nguyen", role: "Technician", kind: "technician", shopId: "campbell", serviceHours: 0, billedHours: 0 },
  { id: "duc", name: "Duc Nguyen", role: "Technician", kind: "technician", shopId: "san-jose", serviceHours: 17.49, billedHours: 16.55 },
];

const managerEmails: Record<string, string> = {
  "san-ramon": "sanramon@drivenautocare.com",
  "castro-valley": "castrovalley@drivenautocare.com",
  fremont: "fremont@drivenautocare.com",
  campbell: "campbell@drivenautocare.com",
  "san-jose": "sanjose@drivenautocare.com",
};

export const seedTechs: Tech[] = seedPeople.map(({ id, name, role, kind, shopId }) => ({
  id,
  name,
  role,
  email: kind === "manager" ? (managerEmails[shopId] ?? "") : "",
  kind,
  shopId,
}));

export const seedWeeks: WeekLog[] = [];
