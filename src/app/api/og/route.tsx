import { ImageResponse } from 'next/og';
import { ARCHETYPES } from '../../../data/archetypes';
import { parseSharedArchetype } from '../../../lib/share/archetype-share';
import { getStoryById } from '../../../lib/stories/catalog';
import { getRepository } from '../../../lib/stories/get-repository';
import { makeRabbit } from '../../../lib/pixel/sprites';
import { AMBER, SLATE } from '../../../lib/theme/palette';
import PixelImage from '../../../components/pixel/PixelArt';

export const dynamic = 'force-dynamic';

const SIZE = { width: 1200, height: 630 };
const BG = SLATE[950];
const INK = SLATE[100];
const ACCENT = AMBER[700];
const MUTED = SLATE[400];

// The pixel rabbit from the site, in its happy mood, drawn as plain rectangles the image renderer understands.
const rabbit = makeRabbit('happy');
function Rabbit() {
  return <PixelImage sprite={rabbit} px={8} />;
}

function Card({ eyebrow, title, line, accent }: { eyebrow: string; title: string; line: string; accent: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: BG, color: INK, padding: 64, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, paddingRight: 32 }}>
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 8, color: ACCENT, fontWeight: 700 }}>RABBIT TRAIL</div>
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

  let card = <Card eyebrow="A daily story for curious minds" title="Follow the rabbit hole, with sources" line="Written the way your curiosity works." accent={ACCENT} />;

  if (archetypeId) {
    const a = ARCHETYPES[archetypeId];
    card = <Card eyebrow="MY CURIOSITY ARCHETYPE" title={a.name} line={a.tagline} accent={ACCENT} />;
  } else if (storyId) {
    try {
      const story = await getStoryById(getRepository(), storyId);
      if (story) {
        card = <Card eyebrow={`${story.topic} · ${story.era}`.toUpperCase()} title={clip(story.title, 100)} line={clip(story.facts[0]?.claim ?? story.decisionContext, 140)} accent={ACCENT} />;
      }
    } catch (err) {
      // The default card is better than no card; the reason goes to the log.
      console.error('Share card fell back to the default:', (err as Error).message);
    }
  }

  return new ImageResponse(card, { ...SIZE, headers });
}
