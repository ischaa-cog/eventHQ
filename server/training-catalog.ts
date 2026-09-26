import { db } from "./storage";
import { trainingResources } from "@shared/schema";

// Only actual iframe video IDs supplied in the Client Trainings document.
// Never store or render the document's HTML/script snippets.
export const starterTrainings = [
  { category: "challenge", title: "Introduction To Challenges", id: "855573003" },
  { category: "challenge", title: "Challenge Week At A Glance", id: "855573042" },
  { category: "challenge", title: "The Challenge Kick Off Call", id: "855573062" },
  { category: "challenge", title: "Day 1 Overview", id: "855573076" },
  { category: "challenge", title: "Day 2 Overview", id: "855573097" },
  { category: "challenge", title: "Day 3 Overview", id: "855577007" },
  { category: "challenge", title: "Day 4 Overview", id: "855573112" },
  { category: "challenge", title: "Day 5 Overview", id: "855573145" },
  { category: "challenge", title: "Bonus Day Overview", id: "855573154" },
  { category: "challenge", title: "Creating A Successful Challenge", id: "855573172" },
  { category: "challenge", title: "You Completed The Training", id: "855573201" },
  { category: "marketing", title: "Podcast Mastery", id: "990690716" },
  { category: "marketing", title: "Social Media Marketing Mastery — Part 1", id: "855573250" },
  { category: "marketing", title: "Social Media Marketing Mastery — Part 2", id: "855573207" },
  { category: "masterclass", title: "Overview Of Masterclasses", id: "923148024" },
  { category: "bonus_training", title: "Speaker Training", id: "1067920493" },
] as const;

export async function seedTrainingCatalog() {
  const categoryPositions = new Map<string, number>();
  const rows = starterTrainings.map(item => {
    const position = categoryPositions.get(item.category) ?? 0;
    categoryPositions.set(item.category, position + 1);
    return {
      title: item.title,
      category: item.category,
      resourceType: "video",
      url: `https://player.vimeo.com/video/${item.id}`,
      orderIndex: position,
      isGlobal: true,
      seedKey: `client-trainings-vimeo-${item.id}`,
    };
  });
  await db.insert(trainingResources).values(rows).onConflictDoNothing({ target: trainingResources.seedKey });
}