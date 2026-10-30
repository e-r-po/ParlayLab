
 // Server-side nflverse weekly player statistics.
 // No API key required for historical statistics.

const URL =
  'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv';

let cache = null;
let cacheAt = 0;

function csv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.length > 1) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'GET only'
    });
  }

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=1800, stale-while-revalidate=3600'
  );

  try {
    if (!cache || Date.now() - cacheAt > 1800000) {
      const response = await fetch(URL, {
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok) {
        throw Error(
          `nflverse download HTTP ${response.status}`
        );
      }

      const text = await response.text();

      if (text.length > 18000000) {
        throw Error('Dataset unexpectedly large');
      }

      const parsed = csv(text);

      const header = parsed.shift().map(x =>
        x.trim().replace(/^\uFEFF/, '')
      );

      const required = [
        'player_display_name',
        'season',
        'week',
        'season_type',
        'passing_yards',
        'rushing_yards',
        'receiving_yards',
        'receptions'
      ];

      if (required.some(k => !header.includes(k))) {
        throw Error('nflverse schema changed');
      }

      const fields = [
        'player_display_name',
        'player_id',
        'season',
        'week',
        'season_type',
        'recent_team',
        'opponent_team',
        'passing_yards',
        'rushing_yards',
        'receiving_yards',
        'receptions',
        'passing_tds',
        'rushing_tds',
        'receiving_tds',
        'attempts',
        'completions',
        'carries',
        'targets'
      ];

      const ix = Object.fromEntries(
        fields.map(k => [k, header.indexOf(k)])
      );

      cache = parsed
        .filter(r =>
          r[ix.season_type] === 'REG' &&
          r[ix.player_display_name]
        )
        .map(r =>
          Object.fromEntries(
            fields.map(k => [
              k,
              ix[k] < 0 ? null : r[ix[k]]
            ])
          )
        );

      cacheAt = Date.now();
    }

    return res.status(200).json({
      source: 'nflverse',
      season: 2026,
      updatedAt: new Date(cacheAt).toISOString(),
      data: cache
    });

  } catch (e) {
    return res.status(502).json({
      error:
        `Historical statistics unavailable: ${e.message}`
    });
  }
}
