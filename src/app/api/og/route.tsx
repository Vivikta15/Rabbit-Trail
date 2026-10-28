import { ImageResponse } from 'next/og';
import { ARCHETYPES } from '../../../data/archetypes';
import { parseSharedArchetype } from '../../../lib/share/archetype-share';
import { getStoryById } from '../../../lib/stories/catalog';
import { getRepository } from '../../../lib/stories/get-repository';

export const dynamic = 'force-dynamic';

const SIZE = { width: 1200, height: 630 };
const BG = '#020617';
const AMBER = '#fbbf24';
const MUTED = '#94a3b8';

// A small round rabbit, drawn with plain shapes so it works inside the image renderer.
function Rabbit() {
  return (
    <svg width="190" height="212" viewBox="0 0 120 134">
      <ellipse cx="46" cy="30" rx="9.5" ry="25" fill="#FDF6EC" stroke="#E4D3BB" strokeWidth="1.5" />
      <ellipse cx="46" cy="32" rx="4.8" ry="17" fill="#F9A8C0" />
      <ellipse cx="74" cy="30" rx="9.5" ry="25" fill="#FDF6EC" stroke="#E4D3BB" strokeWidth="1.5" />
      <ellipse cx="74" cy="32" rx="4.8" ry="17" fill="#F9A8C0" />
      <ellipse cx="60" cy="113" rx="30" ry="20" fill="#FDF6EC" stroke="#E4D3BB" strokeWidth="1.5" />
      <circle cx="60" cy="70" r="33" fill="#FDF6EC" stroke="#E4D3BB" strokeWidth="1.5" />
      <ellipse cx="38" cy="77" rx="6" ry="3.8" fill="#F9A8C0" opacity="0.65" />
      <ellipse cx="82" cy="77" rx="6" ry="3.8" fill="#F9A8C0" opacity="0.65" />
      <circle cx="46" cy="66" r="5.6" fill="#1E293B" />
      <circle cx="74" cy="66" r="5.6" fill="#1E293B" />
      <circle cx="44.2" cy="64.1" r="1.9" fill="#fff" />
      <circle cx="72.2" cy="64.1" r="1.9" fill="#fff" />
      <ellipse cx="60" cy="74" rx="3.2" ry="2.3" fill="#F48FB1" />
      <path d="M52 80 Q60 88 68 80" stroke="#1E293B" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Card({ eyebrow, title, line, accent }: { eyebrow: string; title: string; line: string; accent: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: BG, color: '#f1f5f9', padding: 64, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, paddingRight: 32 }}>
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 8, color: AMBER, fontWeight: 700 }}>RABBIT TRAIL</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 28, color: accent, fontWeight: 700, marginBottom: 16 }}>{eyebrow}</div>
          <div style={{ display: 'flex', fontSize: title.length > 60 ? 54 : 70, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 30, color: MUTED, marginTop: 24, lineHeight: 1.3 }}>{line}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: MUTED }}>One sourced story a day · every claim checked against its source</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Rabbit />
      </div>
    </div>
  );
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const archetypeId = parseSharedArchetype(params.get('archetype'));
  const storyId = (params.get('story') ?? '').slice(0, 120);
  const headers = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' };

  let card = <Card eyebrow="A daily story for curious minds" title="Follow the rabbit hole, with sources" line="Written the way your curiosity works." accent={AMBER} />;

  if (archetypeId) {
    const a = ARCHETYPES[archetypeId];
    card = <Card eyebrow="MY CURIOSITY ARCHETYPE" title={a.name} line={a.tagline} accent={a.accentColor} />;
  } else if (storyId) {
    try {
      const story = await getStoryById(getRepository(), storyId);
      if (story) {
        card = <Card eyebrow={`${story.topic} · ${story.era}`.toUpperCase()} title={clip(story.title, 100)} line={clip(story.facts[0]?.claim ?? story.decisionContext, 140)} accent={AMBER} />;
      }
    } catch (err) {
      // The default card is better than no card; the reason goes to the log.
      console.error('Share card fell back to the default:', (err as Error).message);
    }
  }

  return new ImageResponse(card, { ...SIZE, headers });
}
