// The Wikipedia link list is mostly noise (identifiers, lists, bare years, citation sites). These are
// pages that can never carry "one person, one pivotal decision".
const NOT_A_STORY = [
  /\(identifier\)$/i,
  /^(list|lists|index|timeline|outline|glossary) of /i,
  /^(category|template|wikipedia|help|portal|file|draft|talk):/i,
  /^\d{1,4}( (bc|ad|bce|ce))?$/i,
  /^(wayback machine|geographic coordinate system|isbn|doi)$/i,
];

export function isCandidateTopic(title: string): boolean {
  const t = title.trim();
  return t.length > 0 && !NOT_A_STORY.some((re) => re.test(t));
}

// Wikipedia returns an article's links alphabetically, so "the first N" is an accident of spelling. Pages the
// article actually names are the ones it is about; rank those by where they first appear, then keep the rest
// in their original order.
export function rankTopicsByMention(links: string[], articleText: string): string[] {
  const text = articleText.toLowerCase();
  const candidates = links.filter(isCandidateTopic).map((title, order) => ({ title, order, at: text.indexOf(title.toLowerCase()) }));

  const mentioned = candidates.filter((c) => c.at !== -1).sort((a, b) => a.at - b.at || a.order - b.order);
  const unmentioned = candidates.filter((c) => c.at === -1);
  return [...mentioned, ...unmentioned].map((c) => c.title);
}

interface LinkedStory {
  source: { title: string };
  relatedTopics: string[];
}

const norm = (title: string) => title.trim().toLowerCase();

// The next topic is the story-worthy page that existing stories link to most often and that has no story
// yet, so the catalog grows along the paths readers actually follow. Ties go to the first one seen.
export function chooseFrontierTopic(stories: LinkedStory[], rejected: Set<string>): string | null {
  const covered = new Set(stories.map((s) => norm(s.source.title)));
  const counts = new Map<string, { title: string; count: number }>();

  for (const story of stories) {
    const seenInStory = new Set<string>();
    for (const title of story.relatedTopics) {
      const key = norm(title);
      if (seenInStory.has(key) || covered.has(key) || rejected.has(key) || !isCandidateTopic(title)) continue;
      seenInStory.add(key);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { title, count: 1 });
    }
  }

  let best: { title: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? best.title : null;
}
