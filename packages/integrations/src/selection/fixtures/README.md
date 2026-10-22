# Media and video selection fixtures

`representative-media.json` contains recorded public provider metadata used by
`../representative-fixtures.ts` and `../representative.test.ts` to test media
and video selection. It is test data, not production catalogue content or a list
of approved assets. Tests run without live provider requests or another
repository.

The suite covers 18 titles: 12 recorded games, four recorded movie/series
samples, and two synthetic adapter fixtures. Cases include strong scene-based
heroes, unsuitable promotional artwork, misleading video labels and missing
media.

## What the data means

- Image URLs identify source candidates. `recordedBackdropUrl` is a historical
  reference, not a selected hero. Deliberately unsuitable inputs remain in the
  fixtures to test rejection and manual-review behavior.
- Dimensions and visual signals describe recorded observations. Missing values
  remain unknown; tests do not invent dimensions or perform image analysis.
- `visualReview` and `backdropReview` contain explicit human assessments. These
  are separate from automated signals, which can miss logos, embedded text or
  promotional composition.
- Video metadata preserves provider claims separately from inspected evidence.
  An official teaser label alone does not establish suitability or a trusted
  uploader.

## Important regression cases

- Red Dead Redemption 2 and Resident Evil 4 recommend scene-based heroes.
- Portal has no recommended hero. Text-heavy or promotional artwork can remain
  eligible for manual selection without receiving an automatic recommendation.
- Reacher's posed promotional backdrop and artwork IDs `ar1xhu`, `ar4u71` and
  `ar3m56` require manual selection, even without better alternatives.
- Runner's “What if RUNNER was a K-drama?” clip is rejected as non-promotional.
- Recorded videos lack stable channel IDs, so these samples produce no automatic
  primary video. Separate focused tests cover successful primary selection,
  trusted uploaders, language preferences and category fallbacks.

Valid alternatives must remain selectable, rejected candidates must retain their
reasons, and repeated evaluation must produce identical results. Visual review
evidence is not a production URL blacklist or an automatic image-analysis
service.

This is a small regression sample, not an accuracy benchmark. Provider metadata
and playback availability can change; recorded evidence does not establish
current availability or editorial approval.
