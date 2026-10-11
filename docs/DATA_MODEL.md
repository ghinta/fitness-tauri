# Data Model and IndexedDB Schema

## Domain model

Identifiers are stable UUID strings and timestamps are ISO 8601 UTC strings. Weight
is a finite non-negative kilogram value or `null` when no weight was recorded.
Weight entry is optional for both warmup and working sets. Imported/entered weights are capped at 100,000 kg, durations at 86,400
seconds, and equipment increments at 1,000 kg.

- **Exercise**: `id`, `name`, `muscleGroup`, `movementCategory`, `equipmentType`,
  `weightIncrementKg`, optional local `image` (`dataUrl`, `thumbnailDataUrl`,
  `updatedAt`), `active`, `createdAt`, `updatedAt`.
- **WorkoutTemplate**: `id`, `name`, `active`, `createdAt`, `updatedAt`.
- **ExerciseSlot**: `id`, `templateId`, `movementCategory`, `label`, `order`,
  `primaryExerciseId`, `alternativeExerciseIds`, `active`.
- **WorkoutSession**: `id`, `workoutTemplateId`, `templateNameSnapshot`, `status`
  (`active|completed`), `startedAt`, `completedAt`, `notes`, and
  `exerciseSelections` (slot-ID to exercise-ID mapping), plus optional `setTimer`
  (`exerciseSlotId`, `setType`, `startedAt`, nullable `stoppedAt` and
  `durationSeconds`, plus the in-progress `weightKg` and `notes`).
- **ExerciseResult**: `id`, `workoutSessionId`, `exerciseSlotId`, `exerciseId`,
  `exerciseNameSnapshot`, `setType` (`warmup|working`), `weightKg`,
  `durationSeconds`, `notes`, `createdAt`.

Snapshots preserve meaningful history after configuration names change. Session
selections preserve alternatives across reloads and remain related to the immutable
slot ID.

## IndexedDB version 2

Database name: `fitness-glass`; schema version: `2`.

| Store              | Key   | Indexes                                                                      |
| ------------------ | ----- | ---------------------------------------------------------------------------- |
| `exercises`        | `id`  | `active`, `movementCategory`                                                 |
| `workoutTemplates` | `id`  | `active`                                                                     |
| `exerciseSlots`    | `id`  | `templateId`, `[templateId+order]`                                           |
| `workoutSessions`  | `id`  | `status`, `startedAt`, `workoutTemplateId`                                   |
| `exerciseResults`  | `id`  | `workoutSessionId`, `exerciseId`, `[exerciseId+createdAt]`, `exerciseSlotId` |
| `meta`             | `key` | none                                                                         |

Booleans are retained in the documented schema but active rows are filtered after a
read because booleans are not valid IndexedDB index keys. Initial data and the seed
version are inserted by Dexie's first-population transaction. The version-2 forward
migration preserves existing rows and adds only the new arm exercises and sixth slot
for each template when their stable IDs are absent.

## Invariants and transactions

There is at most one active session. It selects exactly one active configured
exercise for every active slot. A completed session has a completion time and one
working result per selected slot. Each session has at most one warm-up and one
working result per slot. All exercises may omit weight; missing weight is not interpreted as zero or bodyweight.
Exercise names are unique after German-locale lowercase and whitespace
normalization. Slot categories and selected exercises must match.

Results are append-only through the V1 UI. Completion, session discard, slot
reordering, seed population, snapshot reads, and full snapshot replacement use
transactions. Configuration changes that would invalidate an active session are
rejected. An active session has at most one timer/draft, preventing overlapping set
timers. Its duration is derived from start/stop timestamps and may be corrected
before saving.

## Export contract

The JSON root contains `format: "fitness-pwa-backup"`, `formatVersion: 1`,
`exportedAt`, arrays for all five entity stores, and `meta`. Image data and thumbnails
are embedded in exercise rows. Import accepts at most 50 MiB and rejects malformed
JSON, unknown root fields/versions, invalid fields,
collection limits, duplicate IDs/names/metadata keys, dangling references, and all
domain invariants. Import never merges: after confirmation and successful saving of a
pre-import backup, all six stores are replaced atomically.

## Migration policy

Every future schema change increments the Dexie version and adds a forward migration
tested from each supported prior version. Version 2 migrates the durable version-1
schema as described above. Downgrades are unsupported; failures preserve the earlier
transaction and show recovery guidance.

The desktop importer accepts missing weights in all exercises. Earlier Fitness PWA versions reject backups containing non-bodyweight results without weights. Existing PWA exports remain importable into Fitness Glass.
