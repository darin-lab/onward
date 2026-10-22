export const MANAGER_LEVELS = [
  { score: 1, word: "Needs Improvement" },
  { score: 2, word: "Developing" },
  { score: 3, word: "Meeting Standards" },
  { score: 4, word: "Exceeding Standards" },
  { score: 5, word: "Exceptional" },
] as const;

type TierCopy = { description: string; behaviors: string[] };

export const MANAGER_RUBRIC: Record<string, TierCopy[]> = {
  "m-talk": [
    {
      description:
        "The shop loses time under their watch. Cars sit without updates, customers wait without communication, and workflow decisions are slow or absent.",
      behaviors: [
        "Vehicles queue up without status updates or a clear next step",
        "Customers are left waiting or uninformed",
        "Slow to make decisions that keep work moving",
        "Wastes tech time by failing to queue jobs or communicate clearly",
      ],
    },
    {
      description:
        "Manages time adequately when it is slow, but loses control when the shop gets busy. Some delays are avoidable.",
      behaviors: [
        "Handles routine flow but slows under pressure",
        "Customer communication is reactive rather than proactive",
        "Occasionally leaves techs without clear direction",
        "Misses chances to shorten wait times",
      ],
    },
    {
      description:
        "Consistently keeps the shop moving. Floor priorities and customer updates happen together. Customers are updated before they ask, and techs know what is next.",
      behaviors: [
        "Updates customers on status and ETAs without being asked",
        "Keeps the job board current and priorities clear",
        "Makes timely decisions on approvals, parts, and scheduling",
        "Moves between the customer and the floor without dropping either",
      ],
    },
    {
      description:
        "Speeds the shop up without sacrificing quality or the customer. Spots bottlenecks and adjusts before they become a problem.",
      behaviors: [
        "Corrects workflow problems in real time",
        "Keeps customers informed so there are no gaps",
        "Keeps techs busy by managing the job queue",
        "Shortens turnaround through scheduling and priority",
      ],
    },
    {
      description:
        "Sets the pace for the whole shop. Techs move faster, customers feel taken care of, and the day runs like a coordinated system.",
      behaviors: [
        "Throughput improves under their management",
        "Finds and removes wasted time across the shop",
        "Teaches urgency without hovering",
        "Still delivers when the work is complicated",
      ],
    },
  ],
  "m-moving": [
    {
      description:
        "Allows weak work or unclear communication to leave the shop. Does not hold themselves or the team to the standard.",
      behaviors: [
        "Lets unsupported recommendations go out",
        "Customer communication is incomplete or only aimed at the sale",
        "Does not address low-quality work",
        "No visible effort to raise the standard",
      ],
    },
    {
      description:
        "Acceptable most of the time, then inconsistent under pressure. Responds to problems after they are pointed out.",
      behaviors: [
        "Quality checks happen after the fact",
        "Recommendations sometimes serve the sale more than the customer",
        "Addresses concerns when flagged, not before",
        "Honest communication gets harder when it costs money",
      ],
    },
    {
      description:
        "Holds a consistent standard of quality and honesty. Tells customers what they need to hear, including when a repair is not urgent.",
      behaviors: [
        "Reviews estimates and pulls back work that does not belong",
        "Gives an honest recommendation even when the ticket is smaller",
        "Sets a clear quality expectation with the techs",
        "Builds trust by not steering the customer wrong",
      ],
    },
    {
      description:
        "Raises the floor for the team. Catches technical and honesty problems before they reach the customer.",
      behaviors: [
        "Checks recommendations for accuracy, not just completeness",
        "Coaches the line between thorough and oversold",
        "Customer communication is clear even when it is inconvenient",
        "Repeat business comes from being trusted",
      ],
    },
    {
      description:
        "The shop is the quality and honesty benchmark. The standard they set is one other shops can be trained on.",
      behaviors: [
        "Honesty is a reason customers come back and refer",
        "Builds a process that prevents shortcuts",
        "Coaches hard conversations that still keep the customer's trust",
        "Their standard is what Driven means in practice",
      ],
    },
  ],
  "m-team": [
    {
      description:
        "Their behavior undercuts trust. Avoids accountability and blames other people for the outcome.",
      behaviors: [
        "Deflects blame and does not own mistakes",
        "Tolerates shortcuts to hit a number",
        "Acts differently when ownership is watching",
        "The shop drifts toward the behavior Driven is here to replace",
      ],
    },
    {
      description:
        "Professional, but passive. Follows the rules without setting the tone. Avoids the hard conversation.",
      behaviors: [
        "Manages without leading",
        "Sees a problem and is slow to address it",
        "Does not reinforce accountability with the team",
        "Personal behavior is acceptable, not a standard others follow",
      ],
    },
    {
      description:
        "Models what Driven expects. Owns mistakes, addresses problems directly, and handles a hard customer conversation with honesty.",
      behaviors: [
        "Owns the shop's outcomes without deflecting",
        "Addresses a lapse directly and promptly",
        "Tells the customer the truth, including bad news",
        "The same person whether or not ownership is there",
      ],
    },
    {
      description:
        "Their example raises trust with techs, customers, and the company. Doing the right thing is expected, not exceptional.",
      behaviors: [
        "Techs can raise a mistake because of how this person responds",
        "Stays honest with customers when the pressure is high",
        "Takes the uncomfortable decision instead of passing it up",
        "Holds the team to the values, not only the numbers",
      ],
    },
    {
      description:
        "Defines the culture of the shop. People do not cut corners because the standard is already theirs, not because someone is watching.",
      behaviors: [
        "Techs, customers, and ownership point to this person as the reason",
        "Develops judgment through coaching, not only enforcement",
        "Handles the hardest situations with consistency",
        "The way they lead is what Driven is trying to build",
      ],
    },
  ],
  "m-safe": [
    {
      description:
        "Treats the role as a transaction. Low energy starts to drag the team and the customer experience.",
      behaviors: [
        "Customer conversations feel obligatory",
        "No visible interest in the shop's growth",
        "Disengaged energy affects the team",
        "No interest in growing in the role",
      ],
    },
    {
      description:
        "Engaged on easy days and flat on hard ones. Customer conversations are fine and forgettable.",
      behaviors: [
        "Engages when it is easy and checks out when it is hard",
        "Professional, without much warmth",
        "Present in the shop without adding to it",
        "Some interest in growth, not followed through",
      ],
    },
    {
      description:
        "Invested in the shop, the team, and the customer. Pride shows up in how they communicate and how they treat people.",
      behaviors: [
        "Customer conversations are warm and confidence-building",
        "Proud of the work and motivated to protect it",
        "Brings steady energy to a demanding day",
        "Keeps growing in both managing and advising",
      ],
    },
    {
      description:
        "Cares about both advising and running the shop. That shows up as a better customer experience and a more motivated team.",
      behaviors: [
        "Customers come back partly because of the relationship",
        "Keeps learning the work, the customer, and the operation",
        "The energy raises the team",
        "Pushes the shop and the customer experience forward",
      ],
    },
    {
      description:
        "Their care for the customer, the team, and the work is why people want to be in that shop.",
      behaviors: [
        "Customers ask for them and send friends",
        "Techs are proud to work in the shop they run",
        "The investment goes beyond their own location",
        "They are an example of what this company can be",
      ],
    },
  ],
};

export function managerTier(categoryId: string, score: number | undefined) {
  if (score == null) return null;
  const tiers = MANAGER_RUBRIC[categoryId];
  if (!tiers) return null;
  return tiers[Math.round(score) - 1] ?? null;
}
