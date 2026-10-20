export const instant = "2026-10-20T12:00:00.000Z";
export const game = {
  id: 42,
  name: "Example Adventure",
  summary: "A co-operative adventure.",
  storyline: "The full storyline.",
  updated_at: 1_700_000_000,
  first_release_date: 1_577_836_800,
  game_type: { type: "Main Game" },
  game_status: { status: "Released" },
  alternative_names: [
    { id: 1, name: "  Ｅxample   Adventure  ", comment: "Localized title" },
    { id: 2, name: "Example Adventure", comment: "Alternative spelling" },
  ],
  release_dates: [
    {
      id: 100,
      date: 1_577_836_800,
      date_format: { format: "YYYYMMMMDD" },
      y: 2020,
      m: 1,
      d: 1,
      human: "Jan 1, 2020",
      platform: { id: 6, name: "PC (Microsoft Windows)" },
      release_region: { region: "worldwide" },
      status: { name: "Full Release" },
    },
  ],
  platforms: [{ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC" }],
  game_modes: [
    { id: 1, name: "Single player" },
    { id: 3, name: "Co-operative" },
  ],
  genres: [{ id: 12, name: "Role-playing (RPG)" }],
  themes: [{ id: 1, name: "Fantasy" }],
  keywords: [{ id: 1, name: "adventure" }],
  involved_companies: [
    {
      id: 1,
      developer: true,
      publisher: true,
      company: { id: 12, name: "Example Studio" },
    },
  ],
  franchises: [{ id: 5, name: "Example Universe" }],
  collections: [{ id: 5, name: "Example Series" }],
  dlcs: [{ id: 43, name: "Example Adventure: More" }],
  expansions: [44],
  standalone_expansions: [],
  remakes: [{ id: 45, name: "Example Reimagined" }],
  remasters: [{ id: 46, name: "Example Remastered" }],
  external_games: [
    { id: 1, uid: "123456", external_game_source: { name: "Steam" } },
  ],
  age_ratings: [
    { id: 1, organization: { name: "ESRB" }, rating_category: { rating: "T" } },
    {
      id: 2,
      organization: { name: "PEGI" },
      rating_category: { rating: "12" },
    },
  ],
  cover: { id: 11, image_id: "coexample", width: 600, height: 900 },
  artworks: [
    { id: 12, image_id: "arexample", width: 1920, height: 1080 },
    { id: 13, image_id: "arother", width: 3840, height: 2160 },
  ],
  screenshots: [{ id: 14, image_id: "scexample", width: 1920, height: 1080 }],
  videos: [
    { id: 15, name: "Launch trailer", video_id: "dQw4w9WgXcQ" },
    { id: 16, name: "Gameplay", video_id: "abcdefghijk" },
  ],
};
export const completion = {
  id: 7,
  game_id: 42,
  hastily: 3600,
  normally: 5400,
  completely: 7200,
  count: 11,
  updated_at: 1_700_000_001,
};
