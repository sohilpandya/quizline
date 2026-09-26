// Safe defaults so the demo never breaks if Grok is down or returns junk.
// Questions are about the fictional artist Nova Rae; the catalog is templated for any artist.

export const FALLBACK_TAGS = ["Afterglow era", "Neon Hearts era", "Early days", "Live shows", "Fan culture", "Collabs"];

type Q = { prompt: string; options: string[]; answer_index: number; difficulty: number; tags: string[] };

export const FALLBACK_QUESTIONS: Q[] = [
  { prompt: "What is the name of Nova Rae's current tour?", options: ["The Afterglow Tour", "Neon Nights Tour", "Starlight Run", "Golden Hour Tour"], answer_index: 0, difficulty: 1, tags: ["Afterglow era", "Live shows"] },
  { prompt: "Which album came first?", options: ["Afterglow", "Neon Hearts", "Paper Planets", "Static Bloom"], answer_index: 2, difficulty: 2, tags: ["Early days"] },
  { prompt: "What colour is the Afterglow album cover?", options: ["Sunset orange", "Electric blue", "Black", "Mint green"], answer_index: 0, difficulty: 1, tags: ["Afterglow era"] },
  { prompt: "Nova Rae's fans call themselves…", options: ["Glowworms", "Novas", "Raelings", "Afterglowers"], answer_index: 2, difficulty: 1, tags: ["Fan culture"] },
  { prompt: "Which single from Neon Hearts went viral on a dance trend?", options: ["Kerosene Kiss", "Pixel Heart", "Midnight Tram", "Satellite"], answer_index: 1, difficulty: 2, tags: ["Neon Hearts era", "Fan culture"] },
  { prompt: "Where did Nova Rae play her first ever gig?", options: ["A Brighton pub", "Glastonbury", "O2 Arena", "A Paris café"], answer_index: 0, difficulty: 3, tags: ["Early days", "Live shows"] },
  { prompt: "Who featured on the duet 'Satellite'?", options: ["DJ Halcyon", "Marlo Vex", "The Tidelines", "Juno Park"], answer_index: 1, difficulty: 2, tags: ["Collabs", "Neon Hearts era"] },
  { prompt: "What instrument does Nova Rae play live on 'Afterglow'?", options: ["Cello", "Keytar", "Ukulele", "Harp"], answer_index: 1, difficulty: 2, tags: ["Afterglow era", "Live shows"] },
  { prompt: "How many tracks are on Afterglow?", options: ["9", "11", "13", "15"], answer_index: 2, difficulty: 3, tags: ["Afterglow era"] },
  { prompt: "What do fans throw on stage during 'Paper Planets'?", options: ["Paper planes", "Glow sticks", "Roses", "Confetti"], answer_index: 0, difficulty: 1, tags: ["Fan culture", "Live shows"] },
  { prompt: "Which city hosted the Neon Hearts tour finale?", options: ["London", "Tokyo", "Berlin", "Toronto"], answer_index: 1, difficulty: 3, tags: ["Neon Hearts era", "Live shows"] },
  { prompt: "Nova Rae's producer collaborator on Static Bloom is…", options: ["Otto Lune", "Marlo Vex", "Kai Ember", "The Tidelines"], answer_index: 2, difficulty: 3, tags: ["Collabs", "Early days"] },
];

const CATALOG_TEMPLATE: { title: string; category: string; price: number; emoji: string; tagIdx: number[] }[] = [
  { title: "{era} Tour Tee", category: "Tee", price: 30, emoji: "👕", tagIdx: [0] },
  { title: "{era} Hoodie", category: "Hoodie", price: 55, emoji: "🧥", tagIdx: [0] },
  { title: "{era} Snapback Cap", category: "Cap", price: 25, emoji: "🧢", tagIdx: [0] },
  { title: "{era} Lithograph Poster", category: "Poster", price: 20, emoji: "🖼️", tagIdx: [0] },
  { title: "{era} Enamel Pin Set", category: "Pin", price: 12, emoji: "📌", tagIdx: [0] },
  { title: "{era} Tote Bag", category: "Tote", price: 18, emoji: "👜", tagIdx: [0] },
  { title: "{era} Coloured Vinyl", category: "Vinyl", price: 32, emoji: "💿", tagIdx: [0] },
];

export function fallbackCatalog(artist: string, tags: string[]) {
  const items = [];
  for (const tag of tags) {
    for (const t of CATALOG_TEMPLATE) {
      items.push({
        title: `${artist} ${t.title.replace("{era}", tag)}`,
        category: t.category,
        description: `Official-style ${t.category.toLowerCase()} celebrating ${tag}.`,
        price_gbp: t.price,
        emoji: t.emoji,
        tags: [tag],
      });
    }
  }
  return items.slice(0, 40);
}
