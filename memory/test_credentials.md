# Test Credentials

## SWU Marketing Research Platform

| Role    | Email                  | Password   | Notes |
|---------|------------------------|------------|-------|
| Admin   | admin@swu.ac.th        | admin123   | Full access — Brand Equity owner, Conjoint, Alumni admin |
| Student | student1@swu.ac.th     | student123 | Card owner role, Alumni member |

## Brand Equity seed data (created by testing agent iteration 10)

- Study ID: `0a0a1f3b-54f9-4d06-addb-10a4c620d187`
- Brand: `TEST_UIBrand`
- Status: `collecting`
- Share token: `e936845d9491`
- Public respond URL: `/brand-equity/respond/e936845d9491`
- 12 anonymous responses already submitted → dashboard unlocked
- Owner: `admin@swu.ac.th`

Delete via `DELETE /api/brand-equity/studies/0a0a1f3b-54f9-4d06-addb-10a4c620d187` (admin auth).

## Brand Equity QA seed (Jun 2026)
- Wave-significance test study: `zz-wavesig-0001` (title/brand ZZ_WaveSigTest), owner admin@swu.ac.th
  - 90 responses: 45 in Apr 2026 (wave 1) + 45 in Jun 2026 (wave 2, ratings shifted +1.1)
  - Public survey token: `zzwavesig01`
  - Re-seed with: `cd /app/backend && python scripts/seed_wave_significance_study.py`

## Simulated demo study (Jun 2026)
- `demo-sim-chathai-001` — "DEMO · ชาไทยมะลิ (ข้อมูลจำลอง)", owner admin@swu.ac.th, `is_simulated: true`
  - ~183 completed responses over 2 waves (Feb + May 2026) + ~27 unfinished drafts
  - Public survey token: `demosimchathai`
  - Cronbach α: quality ~0.89, identity ~0.93, loyalty ~0.72 (awareness has 1 Likert item by design)
  - Segment significance: `age` is SIGNIFICANT on identity + loyalty, `gender` is ns (by construction)
  - Re-seed with: `cd /app/backend && python scripts/seed_simulated_brand_study.py`
