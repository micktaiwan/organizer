/**
 * One-shot deduplication script for Qdrant collections.
 * Fetches all points with vectors, computes pairwise cosine similarity,
 * groups duplicates, keeps the most recent, deletes the rest.
 *
 * Usage:
 *   npx tsx src/scripts/dedup-qdrant.ts [--apply]
 *
 * Without --apply, runs in dry-run mode (no deletions).
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:16333';

const COLLECTIONS = [
  { name: 'organizer_goals', threshold: 0.75 },
  { name: 'organizer_self', threshold: 0.85 },
  { name: 'organizer_memory', threshold: 0.83 },
];

const DRY_RUN = !process.argv.includes('--apply');

interface Point {
  id: string;
  vector: number[];
  payload: {
    content: string;
    timestamp?: string;
    goalCategory?: string;
    selfCategory?: string;
    [key: string]: unknown;
  };
}

async function scrollAll(collection: string): Promise<Point[]> {
  const all: Point[] = [];
  let offset: string | null = null;

  do {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 500,
        offset,
        with_payload: true,
        with_vector: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Scroll failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    all.push(...data.result.points);
    offset = data.result.next_page_offset;
  } while (offset !== null);

  return all;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getTimestamp(p: Point): number {
  const ts = p.payload.timestamp;
  if (!ts) return 0;
  const t = new Date(ts as string).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Union-Find for grouping duplicates
 */
class UnionFind {
  parent: Map<string, string> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  groups(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!result.has(root)) result.set(root, []);
      result.get(root)!.push(id);
    }
    return result;
  }
}

async function deletePoints(collection: string, ids: string[]): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: batch }),
    });
    if (!res.ok) {
      throw new Error(`Delete failed: ${res.status} ${await res.text()}`);
    }
  }
}

async function dedupCollection(collection: string, threshold: number): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Collection: ${collection} (threshold: ${threshold})`);
  console.log('='.repeat(60));

  const points = await scrollAll(collection);
  console.log(`Total points: ${points.length}`);

  if (points.length < 2) {
    console.log('Nothing to deduplicate.');
    return;
  }

  // Build a map for quick lookup
  const pointMap = new Map<string, Point>();
  for (const p of points) {
    pointMap.set(p.id, p);
  }

  // Find duplicate pairs
  const uf = new UnionFind();
  let pairCount = 0;

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const sim = cosineSimilarity(points[i].vector, points[j].vector);
      if (sim >= threshold) {
        uf.union(points[i].id, points[j].id);
        pairCount++;
      }
    }
  }

  console.log(`Duplicate pairs found: ${pairCount}`);

  // Process groups
  const groups = uf.groups();
  const dupGroups = [...groups.entries()].filter(([, members]) => members.length > 1);

  console.log(`Duplicate groups: ${dupGroups.length}`);

  const toDelete: string[] = [];

  for (const [, members] of dupGroups) {
    // Sort by timestamp descending (keep most recent)
    const sorted = members
      .map((id) => pointMap.get(id)!)
      .sort((a, b) => getTimestamp(b) - getTimestamp(a));

    const keep = sorted[0];
    const remove = sorted.slice(1);

    console.log(`\n  KEEP: "${keep.payload.content?.slice(0, 70)}..."`);
    for (const r of remove) {
      const sim = cosineSimilarity(keep.vector, r.vector);
      console.log(`  DEL:  "${r.payload.content?.slice(0, 70)}..." (sim: ${sim.toFixed(3)})`);
      toDelete.push(r.id);
    }
  }

  console.log(`\nTotal to delete: ${toDelete.length} / ${points.length} points`);

  if (toDelete.length > 0 && !DRY_RUN) {
    console.log('Deleting...');
    await deletePoints(collection, toDelete);
    console.log('Done!');
  } else if (toDelete.length > 0) {
    console.log('[DRY-RUN] No deletions performed. Use --apply to delete.');
  }
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY (deletions will happen!)'}`);
  console.log(`Qdrant URL: ${QDRANT_URL}`);

  for (const col of COLLECTIONS) {
    await dedupCollection(col.name, col.threshold);
  }

  console.log('\n--- Summary ---');
  console.log(DRY_RUN ? 'Dry-run complete. Run with --apply to execute deletions.' : 'All deletions applied.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
