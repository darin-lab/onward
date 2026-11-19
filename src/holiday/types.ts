// Holiday Party RSVP. Temporary feature: see ./README.md for removal.

/** The button and pop-ups appear at 6:00 AM Pacific on Nov 18, 2026. */
export const HOLIDAY_START = "2026-11-18T06:00:00-08:00";
/** Everything hides itself after the party day (Dec 6) ends. */
export const HOLIDAY_END = "2026-12-07T00:00:00-08:00";

export const PARTY = {
  day: "Sunday, December 6",
  time: "5:00 – 8:00 PM",
  place: "Driven Auto Care · Fremont Shop",
  address: "40931 Albrae Street, Fremont, CA 94538",
};

export type RsvpAnswer = "yes" | "maybe" | "no";

export type HolidayPerson = {
  id: string;
  name: string;
  role: "owner" | "manager" | "technician";
  title: string;
  shopId: string;
  shopName: string;
  answer: RsvpAnswer | null;
  attending: number;
};

export type HolidayState =
  | { active: false }
  | {
      active: true;
      today: string;
      me: HolidayPerson;
      /** The invite pops up: not answered Yes or No, and not shown yet today. */
      showInvite: boolean;
      /** Managers: themselves first, then their shop's technicians. */
      team: HolidayPerson[];
      /** Managers at End of Day: someone on the team is undecided, not shown yet today. */
      showTeam: boolean;
      /** Darin and Arun: everyone. */
      everyone: HolidayPerson[];
    };
