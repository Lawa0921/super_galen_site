# CS development fixture portability

This increment fixes the development candidate's missing checkout inputs. It does not change the character, motion, renderer, approval decisions, or published runtime assets.

## Diagnosis and chosen scope

`skin-candidate.ts` imports four pinned `?url` assets. The calibration JSON was tracked; the GLB, vest index buffer, and compact motion JSON were not. Only the GLB was ignored, by the shared local `.git/info/exclude` rule `art-factory/cs/runs/**/*.glb`; the other two were ordinary untracked files omitted by the earlier snapshot's input selection. Earlier reports calling all three "ignored" were imprecise.

Rebuilding these exact historical outputs requires additional untracked inputs and local meshoptimizer tooling. Preserve the existing 20,559,752 bytes instead: add only those three files to Git, keep all original paths and SHA-256 values, and retain the existing candidate restrictions. The already-tracked 62.5 MB diagnostic GLB and calibration JSON need no changes. No ignore rules, loaders, production assets, or source approvals are changed.

The new `art-factory/cs/manifests/development_fixtures.json` links the four loader inputs to their original contracts. `development-fixtures.test.ts` verifies:

- Complete correspondence with the loader's four imports, exact size and SHA-256, and the loader's pinned hash.
- The correct contract asset identity, fixture path, available contract hash, and pending/false publishing decisions.
- When Git metadata exists, stage 0, ordinary file mode, and the exact Git blob contents for every fixture. Source archives still run the unconditional content/contract checks; they do not claim to have an index.

## Verification evidence

All paths below are relative to `art-factory/cs/runs/run-20261011-continuation/qa`.

- `fixture-portability-red.json`: five assertions passed; index inclusion failed for the missing GLB. After the three precise additions, `fixture-portability-green.json` passed all six.
- `fixture-mutations.json`: an isolated index missing the vest and another containing the wrong motion blob each fail exactly one assertion. The real index and original manifest are preserved.
- Independent review found that a different pending contract could be substituted. Merely checking path/hash did not close it: the LOD contract also references its source GLB. `fixture-mutation-wrong-sole-contract.json` preserves that false-green result; fixed contract identity matching rejects it in `fixture-mutation-wrong-sole-contract-v2.json`.
- `fixture-portability-final.json`: the final six targeted assertions pass.
- `verify-fixture-portability.py` exports Git-indexed working-tree files plus explicit pending source/test/public/contract/manifest inputs into a fresh directory. All four fixture files must come from Git's tracked set; there is no manual fixture restoration. It performs the documented Windows clean install, complete Vitest, production build, and all CS Chromium E2E tests serially. Results are recorded in `fixture-clean-verification.json` and the snapshot input inventory.
- The new snapshot contains 9,305 files / 2,299,268,767 bytes. Clean install passed in 31.04 seconds, Vitest passed 171 files / 1,681 tests in 93.11 seconds, and build passed in 54.36 seconds. The four candidate files came from Git's tracked set; no post-export intake was needed. All nine candidate/real-skin browser cases passed.
- The complete CS Chromium run passed 71 cases and timed out once before the smoke case could start. All 122 captured requests returned 200; the page still showed loading, with no loading error. A snapshot-only renderer subclass measured resource-manager and prewarm boundaries: two subsequent loads completed in 3,866.6 / 3,576.4 ms, but did not reproduce the stall. Both original, unmodified grenade tests then passed. `fixture-final-coverage.json` records 72 distinct cases across the complete run plus whole-file recheck; it does not claim a single clean run or a resolved startup stall.
- `fixture-production-exclusion.json` verifies all 30 runtime files / 33,215,561 bytes remain exact. Across 3,191 Vercel output files and 564 JavaScript/MJS files, no development-loader markers or exact fixture byte hashes were found. This fixture change adds no production asset download.
- Independent delta review passed after the contract identity correction. `fixture-source-check.json` seals the five staged files and confirms the loader and four original source contracts remain unchanged. The three fixtures, manifest and test are staged, not committed or pushed.

## Separate baseline test corrections

The existing family-missions navigation test contradicted intentional removal in `2216b327`. Only the corresponding test fragment from `d202d462` was adopted, not its other 33 files: assert no homepage entry, retain direct-route 200/H1, tolerate the heading's `<br>` whitespace, and assert the completed task's exact accessible button name and disabled state. Star increment, persistence, and profile isolation remain covered. No family runtime code changed. Independent delta review passed; all 15 cases across the five projects passed, with Mobile Safari completed separately after the mixed baseline run stopped on unrelated Tetris failures.

The unchanged Tetris menu diagnostic produced a Chromium failure with 29 `ERR_NETWORK_CHANGED` module requests; the click itself was delivered. The OS/server trigger is unknown. Two mobile cases still expect desktop-only behavior; those tests and all Tetris runtime code remain unchanged. The mixed baseline run was 40 passed, 3 failed, 17 skipped/aborted, not a full-site pass. Trace hashes and the inspected network boundaries are in `startup-baseline-diagnosis.json`.

The snapshot contains current uncommitted changes and is not a released Git revision. Complete commercial acceptance still requires the outstanding performance, browser, art/source, and full-site gates documented in the continuation plan.
