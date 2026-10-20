import type {
  PersonCandidate,
  CreditCandidate,
} from "../../catalogue-candidates.js";
import type { CandidateField, Provenance } from "../../contracts.js";
import {
  exactCalendarDate,
  normalizeCreditCandidates,
  normalizeName,
} from "../../normalization/index.js";
import {
  creditsSchema,
  imagesSchema,
  type TmdbPerson,
  type TmdbPersonReference,
} from "./schemas.js";
import { normalizeImages } from "./media.js";
import {
  clean,
  field,
  known,
  missing,
  provenance,
  section,
  tmdbIdentity,
  type NormalizationContext,
} from "./values.js";

export function personReference(
  person: TmdbPersonReference,
  fetchedAt: string,
): PersonCandidate {
  const identity = tmdbIdentity("person", person.id);
  const source = provenance(identity, fetchedAt);
  return {
    identity,
    name: normalizeName(person.name),
    originalName: field(clean(person.original_name), source),
    biography: missing("NOT_REQUESTED"),
    birthday: missing("NOT_REQUESTED"),
    deathday: missing("NOT_REQUESTED"),
    placeOfBirth: missing("NOT_REQUESTED"),
    media: normalizeImages(
      missing("NOT_REQUESTED"),
      { kind: "PERSON", identity },
      source,
      { profile: person.profile_path },
    ),
    detailStatus: "NOT_REQUESTED",
    provenance: source,
  };
}

export function normalizePerson(
  person: TmdbPerson,
  fetchedAt: string,
): { person: PersonCandidate; issues: NormalizationContext["issues"] } {
  const reference = personReference(person, fetchedAt);
  const context: NormalizationContext = {
    provenance: reference.provenance,
    issues: [],
  };
  return {
    person: {
      ...reference,
      biography: field(clean(person.biography), reference.provenance),
      birthday: field(exactCalendarDate(person.birthday), reference.provenance),
      deathday: field(exactCalendarDate(person.deathday), reference.provenance),
      placeOfBirth: field(clean(person.place_of_birth), reference.provenance),
      detailStatus: "AVAILABLE",
      media: normalizeImages(
        section(imagesSchema, person.images, "person.images", context),
        { kind: "PERSON", identity: reference.identity },
        reference.provenance,
        { profile: person.profile_path },
      ),
    },
    issues: context.issues,
  };
}

/** Expand aggregate roles/jobs; a person's distinct credits are never collapsed by person ID. */
export function normalizeCredits(
  raw: unknown,
  aggregate: unknown,
  creators: TmdbPersonReference[] | null | undefined,
  context: NormalizationContext,
  aggregateRequested = false,
): { credits: CandidateField<CreditCandidate[]>; people: PersonCandidate[] } {
  const source: Provenance = context.provenance;
  const direct = section(creditsSchema, raw, "credits", context);
  const combined = aggregateRequested
    ? section(creditsSchema, aggregate, "aggregate_credits", context)
    : missing("NOT_REQUESTED");
  const credits: CreditCandidate[] = [];
  const people = new Map<string, PersonCandidate>();
  const addPerson = (person: TmdbPersonReference) => {
    const reference = personReference(person, source.fetchedAt);
    const previous = people.get(reference.identity.id);
    if (!previous || previous.media.state !== "known")
      people.set(reference.identity.id, reference);
    return reference.identity;
  };
  const addCredit = (credit: CreditCandidate) => {
    credits.push(credit);
  };
  for (const input of [combined, direct]) {
    if (input.state !== "known") continue;
    for (const cast of input.value.cast) {
      const identity = addPerson(cast);
      const roles = cast.roles?.length
        ? cast.roles
        : [
            {
              character: cast.character,
              credit_id: cast.credit_id,
              episode_count: null,
            },
          ];
      for (const role of roles)
        addCredit({
          personIdentity: identity,
          type: "CAST",
          characterName: clean(role.character),
          job: null,
          department: null,
          displayOrder: cast.order ?? null,
          providerCreditId: clean(role.credit_id),
          episodeCount: role.episode_count ?? null,
          provenance: source,
        });
    }
    for (const crew of input.value.crew) {
      const identity = addPerson(crew);
      const jobs = crew.jobs?.length
        ? crew.jobs
        : [{ job: crew.job, credit_id: crew.credit_id, episode_count: null }];
      for (const job of jobs)
        addCredit({
          personIdentity: identity,
          type: "CREW",
          characterName: null,
          job: clean(job.job),
          department: clean(crew.department),
          displayOrder: null,
          providerCreditId: clean(job.credit_id),
          episodeCount: job.episode_count ?? null,
          provenance: source,
        });
    }
  }
  for (const creator of creators ?? [])
    addCredit({
      personIdentity: addPerson(creator),
      type: "CREATOR",
      characterName: null,
      job: "Creator",
      department: null,
      displayOrder: null,
      providerCreditId: null,
      episodeCount: null,
      provenance: source,
    });
  return {
    credits:
      direct.state === "known" ||
      combined.state === "known" ||
      credits.length > 0
        ? known(normalizeCreditCandidates(credits), source)
        : missing("UNAVAILABLE"),
    people: [...people.values()],
  };
}
