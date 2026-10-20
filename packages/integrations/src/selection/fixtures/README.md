# Representative selection fixtures

`representative-media.json` contains small public provider excerpts from the
read-only research playground's current scene-first game reports and recorded
video checks. It is independent of that repository at test runtime. No
production credentials, persistence fixtures or downloaded image bytes are
included.

These are source inputs, including deliberately unsuitable media, not approved
content-page assets. `recordedBackdropUrl` names a historical provider
reference, not a selected hero. Bad inputs are retained to test that they do not
become recommendations.

The replay uses **18 titles**: 12 recorded games, four recorded movie/series
video samples, plus the existing synthetic King Kong and Cowboy Bebop adapter
fixtures. The recorded excerpts include 53 game image references and 12 video
references. This is a bounded regression sample, not a catalogue audit or
accuracy benchmark.

Games include Red Dead Redemption 2, GTA V, The Witcher 3, Portal 2, Portal,
Skyrim, Final Fantasy VII, Tunic, Hyper Light Drifter, Resident Evil 4, Ghost of
Yotei and Clair Obscur. Screen samples include Runner, Ramayana, Reacher and 3
Body Problem.

- RDR2 recommends the recorded snowy riding scene; Resident Evil 4 recommends
  the village scene. Saved playground layouts were inspected to check contrast
  and overlay readability. The Witcher layout was also inspected as a visual
  reference.
- Eleven of the twelve game suggestions match the saved scene-first choice,
  including missing-hero results. This is agreement with that frozen subset, not
  proof of visual correctness. Stored image dimensions describe those inspected
  URLs, which can differ from provider-original dimensions.
- GTA V favors `sc10f94` over the saved `sc10f95`. Both images were opened and
  visually compared: the former has a strong action scene; the latter has more
  useful left-side space for an overlay. Both remain selectable. Color/edge
  heuristics cannot settle this editorial composition choice objectively.
- Portal has no recommendable hero. Final Fantasy VII's text-dominated artwork
  remains eligible for manual inspection, with no automatic hero suggestion.
- Recorded poster dimensions and some screen media are absent. They stay
  unknown; the replay does not invent geometry or stretch small images.
- Reacher's recorded backdrop was opened for visual review: it is a posed
  promotional portrait on a red/blue studio background. Its separate
  `backdropReview` records the observed 3840 × 2160 dimensions and an explicit
  `PROMOTIONAL_PORTRAIT` assessment. It remains eligible for deliberate manual
  choice, but receives no automatic hero recommendation despite sufficient size.
- Runner's “What if RUNNER was a K-drama?” clip is a negative video example. Its
  independently inspected title has no supported promo format, so the selector
  rejects it rather than trusting the provider's official teaser label.
- Three additional artwork references were visually reviewed: Resident Evil 4's
  `ar1xhu` is a close-up character montage, Ghost of Yotei's `ar4u71` combines a
  posed character with a large title logo, and GTA V's `ar3m56` is a logo card.
  Separate `visualReview` assessments make these manual-only, including when
  evaluated without better alternatives. Original pixel heuristics are retained:
  their low text scores do not establish that logos or promotional composition
  are absent. These assessments are test evidence, not a production URL
  blacklist or an automatic image-analysis service.
- The recorded video reports do not preserve stable channel IDs. Their earlier
  display-name trust claims are deliberately not promoted to verified uploader
  evidence, so this replay supplies no automatic primary videos. Separate
  focused tests exercise successful primary selection, trusted IDs, language
  preference and trailer/teaser/gameplay fallbacks using explicit synthetic
  evidence.

Pixel signals were recorded by the playground's lightweight heuristics; no new
pixel analysis or live provider catalogue fetch was performed for this replay.
The two GTA V image references were opened for their near-tie comparison; the
Reacher reference and the three flagged game artwork references were
subsequently opened for separate visual assessments. Provider metadata and
playback availability can change. The test preserves original claims and
identifies unknowns rather than treating old reports as current provider truth
or editorial approval.
