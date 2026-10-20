import { known, missing } from "../candidate-fields.js";
import type { CandidateField, Provenance } from "../contracts.js";
import { comparisonKey } from "./text.js";

type Evidence = {
  genres: CandidateField<string[]>;
  keywords: CandidateField<string[]>;
  originalLanguage: CandidateField<string>;
  countries: CandidateField<string[]>;
};
export function classifyAnime(
  input: Evidence,
  source: Provenance,
): CandidateField<boolean> {
  if (input.genres.state !== "known") return input.genres;
  if (!input.genres.value.length) return missing();
  const animation = input.genres.value.some(
    (value) => comparisonKey(value) === "animation",
  );
  const animeKeyword =
    input.keywords.state === "known" &&
    input.keywords.value.some((value) =>
      ["anime", "japanese animation"].includes(comparisonKey(value)),
    );
  const japanese =
    input.originalLanguage.state === "known" &&
    input.originalLanguage.value.split("-")[0] === "ja" &&
    input.countries.state === "known" &&
    input.countries.value.includes("JP");
  if (animation && (animeKeyword || japanese))
    return {
      ...known(true, source),
      certainty: "INFERRED",
      evidence: [
        "Animation genre.",
        ...(animeKeyword
          ? ["Explicit anime keyword."]
          : [
              "Japanese original language and Japanese production/origin country.",
            ]),
      ],
    };
  if (!animation && animeKeyword) return missing("UNSUPPORTED");
  if (!animation)
    return {
      ...known(false, source),
      certainty: "INFERRED",
      evidence: [
        "Provider genre set does not classify this work as Animation.",
      ],
    };
  if (
    input.originalLanguage.state === "known" &&
    input.originalLanguage.value.split("-")[0] !== "ja" &&
    input.countries.state === "known" &&
    input.countries.value.length &&
    !input.countries.value.includes("JP") &&
    input.keywords.state === "known"
  )
    return {
      ...known(false, source),
      certainty: "INFERRED",
      evidence: [
        "Animation with non-Japanese original language/origin and no explicit anime keyword.",
      ],
    };
  return missing();
}
