import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "./client.ts";

const enabled = process.env.TOWNHAWLL_DB_INTEGRATION === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test")
  ) {
    throw new Error(
      "Catalogue integration tests require a local *_test database.",
    );
  }
}

type Transaction = Prisma.TransactionClient;
let db: typeof import("./client.ts").db;
const rollbackSignal = new Error("rollback catalogue test fixtures");

// Every test rolls back its fixtures. Flush deferred SQL checks before rollback
// so invalid metadata cannot pass just because the transaction never commits.
async function rollback(run: (transaction: Transaction) => Promise<void>) {
  try {
    await db.$transaction(
      async (transaction) => {
        await run(transaction);
        await transaction.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
        throw rollbackSignal;
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    if (error !== rollbackSignal) throw error;
  }
}

function titleInput(type: "GAME" | "MOVIE" | "SERIES" = "GAME") {
  return { type, title: "Catalogue test", slug: randomUUID() };
}

describe.skipIf(!enabled)("catalogue PostgreSQL integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("./client.ts"));
    await db.$connect();
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("creates all title types with matching one-to-one metadata and date-only values", async () => {
    await rollback(async (tx) => {
      const movie = await tx.title.create({
        data: {
          ...titleInput("MOVIE"),
          publicationStatus: "PUBLISHED",
          primaryReleaseDate: new Date("2020-01-02T13:00:00Z"),
          normalizedAgeRating: "18+",
          effectiveCertification: "R",
          effectiveCertificationSystem: "MPA",
          effectiveCertificationCountry: "US",
          providerCertifications: { US: "R" },
          movie: {
            create: { runtimeMinutes: 100, dubbedLanguageCodes: ["hi"] },
          },
        },
        include: { movie: true },
      });
      expect(movie.movie?.runtimeMinutes).toBe(100);
      const stored = await tx.title.findUniqueOrThrow({
        where: { id: movie.id },
      });
      expect(stored.primaryReleaseDate?.toISOString()).toBe(
        "2020-01-02T00:00:00.000Z",
      );
      const series = await tx.title.create({
        data: { ...titleInput("SERIES"), series: { create: {} } },
        include: { series: true },
      });
      const game = await tx.title.create({
        data: {
          ...titleInput(),
          game: { create: { modes: ["SINGLE_PLAYER", "CO_OP"] } },
        },
        include: { game: true },
      });
      expect(series.series?.status).toBe("UNKNOWN");
      expect(game.game?.modes).toEqual(["SINGLE_PLAYER", "CO_OP"]);
      expect(
        await tx.movieMetadata.count({ where: { titleId: movie.id } }),
      ).toBe(1);
    });
  });

  it("rejects duplicate metadata, mismatched metadata, and incomplete publication", async () => {
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({
          data: { ...titleInput(), game: { create: {} } },
        });
        await tx.gameMetadata.create({ data: { titleId: title.id } });
      }),
    ).rejects.toThrow(/Unique constraint/);
    await expect(
      rollback(async (tx) => {
        await tx.title.create({
          data: { ...titleInput(), movie: { create: {} } },
        });
      }),
    ).rejects.toThrow(/metadata does not match/);
    await expect(
      rollback(async (tx) => {
        await tx.title.create({
          data: { ...titleInput(), publicationStatus: "PUBLISHED" },
        });
      }),
    ).rejects.toThrow(/Published titles require/);
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({
          data: { ...titleInput(), game: { create: {} } },
        });
        await tx.title.update({
          where: { id: title.id },
          data: { type: "MOVIE" },
        });
      }),
    ).rejects.toThrow(/metadata does not match/);
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({
          data: {
            ...titleInput(),
            publicationStatus: "PUBLISHED",
            game: { create: {} },
          },
        });
        await tx.gameMetadata.delete({ where: { titleId: title.id } });
      }),
    ).rejects.toThrow(/Published titles require/);
  });

  it("keeps provider identity unique without conflating identical IDs from different providers", async () => {
    await rollback(async (tx) => {
      const title = await tx.title.create({ data: titleInput() });
      for (const provider of ["igdb", "steam"]) {
        await tx.titleProviderMapping.create({
          data: { titleId: title.id, provider, providerId: "42" },
        });
      }
      await tx.providerSnapshot.create({
        data: {
          provider: "igdb",
          providerId: "42",
          entityType: "game",
          payload: { name: "Raw" },
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      expect(
        await tx.titleProviderMapping.count({ where: { titleId: title.id } }),
      ).toBe(2);
    });
    await expect(
      rollback(async (tx) => {
        const first = await tx.title.create({ data: titleInput() });
        const second = await tx.title.create({ data: titleInput() });
        for (const titleId of [first.id, second.id]) {
          await tx.titleProviderMapping.create({
            data: { titleId, provider: "igdb", providerId: "unique-test" },
          });
        }
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("persists aliases, reusable taxonomy, companies, franchises, credits and external videos", async () => {
    await rollback(async (tx) => {
      const person = await tx.person.create({
        data: {
          name: "Director",
          birthday: new Date("1980-01-01"),
          mappings: {
            create: { provider: "tmdb", providerPersonId: randomUUID() },
          },
        },
      });
      const title = await tx.title.create({
        data: {
          ...titleInput("MOVIE"),
          movie: { create: {} },
          aliases: {
            create: {
              name: "Alternate title",
              normalizedKey: "alternate title",
            },
          },
          genres: {
            create: {
              genre: { create: { name: "Drama", slug: randomUUID() } },
            },
          },
          keywords: {
            create: {
              keyword: {
                create: { name: "Journey", slug: randomUUID(), type: "THEME" },
              },
            },
          },
          companies: {
            create: {
              role: "STUDIO",
              company: {
                create: {
                  name: "Studio",
                  mappings: {
                    create: {
                      provider: "tmdb",
                      providerCompanyId: randomUUID(),
                    },
                  },
                },
              },
            },
          },
          franchises: {
            create: {
              franchise: {
                create: {
                  name: "Franchise",
                  mappings: {
                    create: {
                      provider: "tmdb",
                      providerFranchiseId: randomUUID(),
                    },
                  },
                },
              },
            },
          },
          credits: {
            create: [
              { personId: person.id, type: "CREW", job: "Director" },
              { personId: person.id, type: "CAST", characterName: "Guest" },
            ],
          },
          videos: {
            create: {
              platform: "youtube",
              externalKey: randomUUID(),
              type: "TRAILER",
              selected: true,
            },
          },
        },
        include: {
          aliases: true,
          genres: true,
          keywords: true,
          companies: true,
          franchises: true,
          credits: true,
          videos: true,
        },
      });
      expect(title.aliases).toHaveLength(1);
      expect(title.genres).toHaveLength(1);
      expect(title.keywords).toHaveLength(1);
      expect(title.companies).toHaveLength(1);
      expect(title.franchises).toHaveLength(1);
      expect(title.credits).toHaveLength(2);
      expect(title.videos[0]?.selected).toBe(true);
    });
  });

  it("rejects duplicate normalized aliases and external video references", async () => {
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({ data: titleInput() });
        for (let i = 0; i < 2; i++)
          await tx.titleAlias.create({
            data: { titleId: title.id, name: "Name", normalizedKey: "name" },
          });
      }),
    ).rejects.toThrow(/Unique constraint/);
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({ data: titleInput() });
        for (let i = 0; i < 2; i++)
          await tx.videoAsset.create({
            data: {
              titleId: title.id,
              platform: "youtube",
              externalKey: "video",
              type: "TRAILER",
            },
          });
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("persists seasons, platform releases, requirements and optional completion times", async () => {
    await rollback(async (tx) => {
      const series = await tx.title.create({
        data: {
          ...titleInput("SERIES"),
          series: { create: {} },
          seasons: {
            create: {
              seasonNumber: 0,
              airDate: new Date("2025-01-01"),
              providerMappings: {
                create: { provider: "tmdb", providerId: randomUUID() },
              },
            },
          },
        },
        include: { seasons: true },
      });
      const game = await tx.title.create({
        data: {
          ...titleInput(),
          game: { create: {} },
          gamePlatforms: {
            create: {
              releaseDate: new Date("2025-01-01"),
              platform: {
                create: {
                  name: "PC",
                  slug: randomUUID(),
                  providerMappings: {
                    create: { provider: "igdb", providerId: randomUUID() },
                  },
                },
              },
            },
          },
          requirements: {
            create: { platform: "WINDOWS", tier: "MINIMUM", ramMb: 8192 },
          },
          completionTime: {
            create: { mainStoryMinutes: 120, source: "Editorial" },
          },
        },
        include: {
          gamePlatforms: true,
          requirements: true,
          completionTime: true,
        },
      });
      expect(series.seasons[0]?.seasonNumber).toBe(0);
      expect(game.gamePlatforms).toHaveLength(1);
      expect(game.requirements[0]?.ramMb).toBe(8192);
      expect(game.completionTime?.mainPlusExtraMinutes).toBeNull();
    });
    await expect(
      rollback(async (tx) => {
        await tx.title.create({
          data: {
            ...titleInput("MOVIE"),
            seasons: { create: { seasonNumber: 1 } },
          },
        });
      }),
    ).rejects.toThrow(/metadata does not match/);
    await expect(
      rollback(async (tx) => {
        await tx.title.create({
          data: {
            ...titleInput("MOVIE"),
            completionTime: { create: { mainStoryMinutes: 10 } },
          },
        });
      }),
    ).rejects.toThrow(/metadata does not match/);
  });

  it("rejects self, duplicate directional and reversed RELATED relationships", async () => {
    for (const kind of ["self", "duplicate", "reverse"] as const) {
      await expect(
        rollback(async (tx) => {
          const source = await tx.title.create({ data: titleInput() });
          const target = await tx.title.create({ data: titleInput() });
          if (kind === "self") {
            await tx.titleRelation.create({
              data: {
                sourceTitleId: source.id,
                targetTitleId: source.id,
                type: "SEQUEL",
              },
            });
          } else {
            const type = kind === "reverse" ? "RELATED" : "SEQUEL";
            await tx.titleRelation.create({
              data: {
                sourceTitleId: source.id,
                targetTitleId: target.id,
                type,
              },
            });
            await tx.titleRelation.create({
              data: {
                sourceTitleId: kind === "reverse" ? target.id : source.id,
                targetTitleId: kind === "reverse" ? source.id : target.id,
                type,
              },
            });
          }
        }),
      ).rejects.toThrow(
        kind === "self"
          ? /different_titles|check constraint/
          : /Unique constraint/,
      );
    }
    await rollback(async (tx) => {
      const source = await tx.title.create({ data: titleInput() });
      const target = await tx.title.create({ data: titleInput() });
      await tx.titleRelation.create({
        data: {
          sourceTitleId: source.id,
          targetTitleId: target.id,
          type: "SEQUEL",
        },
      });
      expect(
        await tx.titleRelation.count({ where: { sourceTitleId: source.id } }),
      ).toBe(1);
    });
  });

  it("treats missing watch accessType as unique while preserving distinct known types", async () => {
    await rollback(async (tx) => {
      const title = await tx.title.create({ data: titleInput("MOVIE") });
      const provider = await tx.watchProvider.create({
        data: { provider: "tmdb", providerId: randomUUID(), name: "Service" },
      });
      for (const accessType of [null, "rent", "buy"]) {
        await tx.titleWatchProvider.create({
          data: {
            titleId: title.id,
            watchProviderId: provider.id,
            regionCode: "US",
            accessType,
          },
        });
      }
      expect(
        await tx.titleWatchProvider.count({ where: { titleId: title.id } }),
      ).toBe(3);
    });
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({ data: titleInput("MOVIE") });
        const provider = await tx.watchProvider.create({
          data: { provider: "tmdb", providerId: randomUUID(), name: "Service" },
        });
        for (let i = 0; i < 2; i++)
          await tx.titleWatchProvider.create({
            data: {
              titleId: title.id,
              watchProviderId: provider.id,
              regionCode: "US",
            },
          });
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("allows exactly one supported media owner and rejects unsupported owner purposes", async () => {
    await rollback(async (tx) => {
      const title = await tx.title.create({ data: titleInput("SERIES") });
      const season = await tx.season.create({
        data: { seriesTitleId: title.id, seasonNumber: 1 },
      });
      const person = await tx.person.create({ data: { name: "Person" } });
      await tx.mediaAsset.create({
        data: { titleId: title.id, purpose: "POSTER", sourceType: "POSTER" },
      });
      await tx.mediaAsset.create({
        data: { seasonId: season.id, purpose: "POSTER", sourceType: "POSTER" },
      });
      await tx.mediaAsset.create({
        data: {
          personId: person.id,
          purpose: "PERSON_IMAGE",
          sourceType: "PROFILE",
        },
      });
    });
    for (const kind of ["none", "multiple", "unsupported"] as const) {
      await expect(
        rollback(async (tx) => {
          const title = await tx.title.create({ data: titleInput() });
          const person = await tx.person.create({ data: { name: "Person" } });
          await tx.mediaAsset.create({
            data: {
              ...(kind === "none" ? {} : { titleId: title.id }),
              ...(kind === "multiple" ? { personId: person.id } : {}),
              purpose: kind === "unsupported" ? "AVATAR" : "POSTER",
              sourceType: "POSTER",
            },
          });
        }),
      ).rejects.toThrow(
        /one_owner|supported_purpose|check constraint|Null constraint violation/,
      );
    }
  });

  it("enforces the owner CHECK for SQL writers, independently of Prisma validation", async () => {
    await expect(
      rollback(async (tx) => {
        await tx.$executeRaw`INSERT INTO media_assets
          (id, purpose, source_type, updated_at)
          VALUES (${randomUUID()}, 'POSTER', 'POSTER', CURRENT_TIMESTAMP)`;
      }),
    ).rejects.toThrow(/media_assets_one_owner_check/);
  });

  it("activates and replaces only READY versions belonging to the same asset", async () => {
    await rollback(async (tx) => {
      const title = await tx.title.create({ data: titleInput() });
      const asset = await tx.mediaAsset.create({
        data: { titleId: title.id, purpose: "POSTER", sourceType: "COVER" },
      });
      const versions = [];
      for (let i = 0; i < 2; i++) {
        versions.push(
          await tx.mediaAssetVersion.create({
            data: {
              mediaAssetId: asset.id,
              processingProfile: "poster",
              processingVersion: "1",
              status: "READY",
              variants: {
                create: [
                  {
                    type: "CARD",
                    objectKey: randomUUID(),
                    width: 200,
                    height: 300,
                    mimeType: "image/webp",
                    byteSize: 1024n,
                  },
                  {
                    type: "MASTER",
                    objectKey: randomUUID(),
                    width: 800,
                    height: 1200,
                    mimeType: "image/webp",
                    byteSize: 8192n,
                  },
                ],
              },
            },
          }),
        );
      }
      for (const version of versions)
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { currentVersionId: version.id },
        });
      const current = await tx.mediaAsset.findUniqueOrThrow({
        where: { id: asset.id },
        include: {
          currentVersion: { include: { variants: true } },
          versions: true,
        },
      });
      expect(current.currentVersion?.id).toBe(versions[1]?.id);
      expect(current.currentVersion?.variants).toHaveLength(2);
      expect(current.versions).toHaveLength(2);
    });
    for (const kind of ["foreign", "pending", "downgrade", "delete"] as const) {
      await expect(
        rollback(async (tx) => {
          const title = await tx.title.create({ data: titleInput() });
          const asset = await tx.mediaAsset.create({
            data: { titleId: title.id, purpose: "POSTER", sourceType: "COVER" },
          });
          const other = await tx.mediaAsset.create({
            data: {
              titleId: title.id,
              purpose: "HERO_ART",
              sourceType: "ARTWORK",
            },
          });
          const version = await tx.mediaAssetVersion.create({
            data: {
              mediaAssetId: kind === "foreign" ? other.id : asset.id,
              processingProfile: "poster",
              processingVersion: "1",
              status: kind === "pending" ? "PENDING" : "READY",
            },
          });
          await tx.mediaAsset.update({
            where: { id: asset.id },
            data: { currentVersionId: version.id },
          });
          if (kind === "downgrade")
            await tx.mediaAssetVersion.update({
              where: { id: version.id },
              data: { status: "FAILED" },
            });
          if (kind === "delete")
            await tx.mediaAssetVersion.delete({ where: { id: version.id } });
        }),
      ).rejects.toThrow(kind === "delete" ? /Foreign key constraint/ : /READY/);
    }
  });

  it("enforces the composite version FK even when its READY trigger is bypassed", async () => {
    // Transaction-local trigger disable is possible only in this disposable,
    // superuser-owned test DB. Rollback restores it immediately.
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({ data: titleInput() });
        const first = await tx.mediaAsset.create({
          data: { titleId: title.id, purpose: "POSTER", sourceType: "POSTER" },
        });
        const second = await tx.mediaAsset.create({
          data: {
            titleId: title.id,
            purpose: "HERO_ART",
            sourceType: "ARTWORK",
          },
        });
        const version = await tx.mediaAssetVersion.create({
          data: {
            mediaAssetId: second.id,
            processingProfile: "hero",
            processingVersion: "1",
            status: "READY",
          },
        });
        await tx.$executeRaw`ALTER TABLE media_assets DISABLE TRIGGER media_assets_ready_version`;
        await tx.mediaAsset.update({
          where: { id: first.id },
          data: { currentVersionId: version.id },
        });
      }),
    ).rejects.toThrow(/Foreign key constraint/);
  });

  it("rejects negative durations, requirements, invalid dimensions and award years", async () => {
    for (const kind of [
      "runtime",
      "completion",
      "ram",
      "dimensions",
      "year",
    ] as const) {
      await expect(
        rollback(async (tx) => {
          const title = await tx.title.create({
            data: titleInput(kind === "runtime" ? "MOVIE" : "GAME"),
          });
          if (kind === "runtime")
            await tx.movieMetadata.create({
              data: { titleId: title.id, runtimeMinutes: -1 },
            });
          if (kind === "completion")
            await tx.gameCompletionTime.create({
              data: { titleId: title.id, mainStoryMinutes: -1 },
            });
          if (kind === "ram")
            await tx.gameSystemRequirement.create({
              data: {
                titleId: title.id,
                platform: "WINDOWS",
                tier: "MINIMUM",
                ramMb: -1,
              },
            });
          if (kind === "dimensions")
            await tx.mediaAsset.create({
              data: {
                titleId: title.id,
                purpose: "POSTER",
                sourceType: "POSTER",
                sourceWidth: 0,
              },
            });
          if (kind === "year")
            await tx.industryAwardEntry.create({
              data: {
                title: { connect: { id: title.id } },
                year: -1,
                result: "NOMINEE",
                category: {
                  create: {
                    name: "Category",
                    slug: "category",
                    award: { create: { name: "Award", slug: randomUUID() } },
                  },
                },
              },
            });
        }),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it("retains curated awards on soft delete, excludes deleted public titles and supports restore", async () => {
    await rollback(async (tx) => {
      const title = await tx.title.create({
        data: {
          ...titleInput(),
          game: { create: {} },
          publicationStatus: "PUBLISHED",
          awardEntries: {
            create: {
              year: 2025,
              result: "WINNER",
              sourceUrl: "https://example.test/official-award",
              category: {
                create: {
                  name: "Best Game",
                  slug: "best-game",
                  award: { create: { name: "Award", slug: randomUUID() } },
                },
              },
            },
          },
        },
      });
      await tx.title.update({
        where: { id: title.id },
        data: { deletedAt: new Date() },
      });
      expect(
        await tx.industryAwardEntry.count({ where: { titleId: title.id } }),
      ).toBe(1);
      expect(
        await tx.title.count({
          where: {
            id: title.id,
            publicationStatus: "PUBLISHED",
            deletedAt: null,
          },
        }),
      ).toBe(0);
      await tx.title.update({
        where: { id: title.id },
        data: { deletedAt: null },
      });
      expect(
        await tx.title.count({
          where: {
            id: title.id,
            publicationStatus: "PUBLISHED",
            deletedAt: null,
          },
        }),
      ).toBe(1);
    });
    await expect(
      rollback(async (tx) => {
        const title = await tx.title.create({
          data: {
            ...titleInput(),
            awardEntries: {
              create: {
                year: 2025,
                result: "NOMINEE",
                category: {
                  create: {
                    name: "Category",
                    slug: "category",
                    award: { create: { name: "Award", slug: randomUUID() } },
                  },
                },
              },
            },
          },
        });
        await tx.title.delete({ where: { id: title.id } });
      }),
    ).rejects.toThrow(/Foreign key constraint/);
  });
});
