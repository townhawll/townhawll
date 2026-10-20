// Small synthetic API excerpts: no credentials, persistence fixtures or live requests.
export const movie = {
  id: 254,
  title: "King Kong",
  original_title: "King Kong",
  overview: "A film overview.",
  release_date: "2005-12-12",
  status: "Released",
  runtime: 187,
  original_language: "en",
  popularity: 25.3,
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  genres: [{ id: 12, name: "Adventure" }],
  production_countries: [{ iso_3166_1: "US", name: "United States" }],
  spoken_languages: [{ iso_639_1: "en" }, { iso_639_1: "fr" }],
  production_companies: [
    {
      id: 33,
      name: "Universal",
      origin_country: "US",
      logo_path: "/company.png",
    },
  ],
  belongs_to_collection: { id: 2936, name: "King Kong Collection" },
  keywords: { keywords: [{ id: 1721, name: "giant ape" }] },
  alternative_titles: {
    titles: [
      { title: "Kong", iso_3166_1: "US", type: "Working title" },
      { title: "KONG", iso_3166_1: "GB" },
      { title: "King Kong", iso_3166_1: "US" },
    ],
  },
  credits: {
    cast: [
      {
        id: 1,
        name: "Actor One",
        original_name: "Actor One",
        profile_path: "/person.jpg",
        character: "Ann",
        credit_id: "cast1",
        order: 0,
      },
    ],
    crew: [
      {
        id: 2,
        name: "Director One",
        job: "Director",
        department: "Directing",
        credit_id: "director1",
      },
      {
        id: 2,
        name: "Director One",
        job: "Writer",
        department: "Writing",
        credit_id: "writer1",
      },
      {
        id: 3,
        name: "Director Two",
        job: "Director",
        department: "Directing",
        credit_id: "director2",
      },
    ],
  },
  images: {
    posters: [
      {
        file_path: "/poster.jpg",
        width: 1000,
        height: 1500,
        iso_639_1: "en",
        vote_average: 7,
        vote_count: 10,
      },
    ],
    backdrops: [
      {
        file_path: "/backdrop.jpg",
        width: 1920,
        height: 1080,
        iso_639_1: null,
      },
      {
        file_path: "/alternate.jpg",
        width: 1280,
        height: 720,
        iso_639_1: "ja",
      },
    ],
  },
  videos: {
    results: [
      {
        id: "video1",
        key: "abcdefghijk",
        site: "YouTube",
        type: "Trailer",
        name: "Official Trailer",
        official: true,
        iso_639_1: "en",
        iso_3166_1: "US",
        published_at: "2020-01-01T00:00:00.000Z",
        size: 1080,
      },
      {
        id: "video2",
        key: "2345",
        site: "Vimeo",
        type: "Behind the Scenes",
        name: "On set",
        official: false,
      },
    ],
  },
  release_dates: {
    results: [
      {
        iso_3166_1: "US",
        release_dates: [
          {
            certification: "PG-13",
            type: 3,
            release_date: "2005-12-14T00:00:00Z",
            note: "Theatrical",
          },
        ],
      },
      {
        iso_3166_1: "IN",
        release_dates: [
          {
            certification: "UA",
            system: "CBFC",
            type: 3,
            release_date: "2005-12-16T00:00:00Z",
          },
        ],
      },
    ],
  },
  "watch/providers": {
    results: {
      US: {
        link: "https://www.themoviedb.org/movie/254/watch?locale=US",
        flatrate: [
          {
            provider_id: 8,
            provider_name: "Netflix",
            logo_path: "/netflix.jpg",
            display_priority: 1,
          },
        ],
        rent: [{ provider_id: 8, provider_name: "Netflix" }],
      },
      IN: {
        link: "https://www.themoviedb.org/movie/254/watch?locale=IN",
        buy: [{ provider_id: 8, provider_name: "Netflix" }],
      },
    },
  },
};

export const series = {
  id: 30991,
  name: "Cowboy Bebop",
  original_name: "カウボーイビバップ",
  overview: "A series overview.",
  first_air_date: "1998-04-03",
  last_air_date: "1999-04-24",
  status: "Ended",
  episode_run_time: [24, 26],
  number_of_seasons: 1,
  number_of_episodes: 26,
  original_language: "ja",
  origin_country: ["JP"],
  spoken_languages: [{ iso_639_1: "ja" }, { iso_639_1: "en" }],
  genres: [{ id: 16, name: "Animation" }],
  keywords: { results: [{ id: 210024, name: "anime" }] },
  alternative_titles: { results: [] },
  production_companies: [{ id: 12, name: "Studio" }],
  networks: [{ id: 12, name: "Network" }],
  created_by: [
    { id: 4, name: "Creator Director", profile_path: "/creator.jpg" },
  ],
  credits: {
    cast: [],
    crew: [
      {
        id: 4,
        name: "Creator Director",
        job: "Series Director",
        department: "Directing",
        credit_id: "seriesdir",
      },
    ],
  },
  aggregate_credits: {
    cast: [
      {
        id: 5,
        name: "Voice Actor",
        order: 0,
        roles: [
          { character: "Spike", credit_id: "spike", episode_count: 26 },
          { character: "Other", credit_id: "other", episode_count: 1 },
        ],
      },
    ],
    crew: [
      {
        id: 4,
        name: "Creator Director",
        department: "Directing",
        jobs: [{ job: "Director", credit_id: "episodedir", episode_count: 26 }],
      },
    ],
  },
  seasons: [
    {
      id: 92720,
      season_number: 0,
      name: "Specials",
      air_date: null,
      episode_count: 2,
      poster_path: null,
    },
    {
      id: 92721,
      season_number: 1,
      name: "Season 1",
      air_date: "1998-04-03",
      episode_count: 26,
      poster_path: "/season.jpg",
    },
  ],
  images: { posters: [], backdrops: [] },
  videos: { results: [] },
  content_ratings: {
    results: [
      { iso_3166_1: "US", rating: "TV-MA" },
      { iso_3166_1: "GB", rating: "15" },
    ],
  },
  "watch/providers": { results: {} },
};

export const person = {
  id: 1,
  name: "Actor One",
  original_name: "Actor One",
  biography: "A full biography. ".repeat(60),
  birthday: "1968-09-28",
  deathday: null,
  place_of_birth: "England",
  profile_path: "/person.jpg",
  images: {
    profiles: [
      { file_path: "/person.jpg", width: 400, height: 600, iso_639_1: null },
    ],
  },
};
