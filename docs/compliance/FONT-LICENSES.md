# Self-hosted font provenance and licenses

Reviewed and downloaded: 2026-10-18 UTC.

The interface uses **DM Sans** and **Manrope**, served from this application's own `/fonts/` paths. `src/styles.css` no longer imports Google Fonts CSS or requests fonts from Google's CDN. Both families keep their original names, normal styles and `font-display: swap`. Variable weight ranges include the interface's 400–800 weights. No font package dependency was added.

## Permission basis

Both upstream families are distributed under the **SIL Open Font License 1.1**. The license permits embedding and redistribution with software while requiring preservation of the applicable copyright notice and license. Fonts must not be sold on their own, modified versions must respect any reserved-name restrictions, and redistribution must retain the font license. These unmodified files are bundled with the application; they are not sold separately. [Official DM Sans license](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/dmsans/OFL.txt), [official Manrope license](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/manrope/OFL.txt).

The complete upstream license texts remain alongside the fonts at `/fonts/dm-sans/OFL.txt` and `/fonts/manrope/OFL.txt`. Original font binaries, embedded notices and family names were not modified. Manrope's upstream `FONTLOG.txt` is also preserved. Its OFL file names a 2018 copyright, while its binary contains a 2019 copyright; both original notices are retained exactly as supplied.

## Pinned official sources

All assets came directly from the official [google/fonts repository](https://github.com/google/fonts), pinned to commit `47d54ca1ebb14fd864695f1d39dc734f39017c33`. The source directories supplied variable TrueType files; the app uses those original binaries without format conversion or subsetting.

| Local asset                                 | Exact upstream asset                                                                                                                                    |          Size | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------: | ------------------------------------------------------------------ |
| `public/fonts/dm-sans/dm-sans-variable.ttf` | [DMSans[opsz,wght].ttf](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf) | 240,164 bytes | `8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d` |
| `public/fonts/dm-sans/OFL.txt`              | [OFL.txt](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/dmsans/OFL.txt)                                   |   4,482 bytes | `9af36190332437f5ecd09974de43c1f7c77a310a996cdd8ceb25628b458840e1` |
| `public/fonts/manrope/manrope-variable.ttf` | [Manrope[wght].ttf](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/manrope/Manrope%5Bwght%5D.ttf)          | 164,700 bytes | `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6` |
| `public/fonts/manrope/OFL.txt`              | [OFL.txt](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/manrope/OFL.txt)                                  |   4,387 bytes | `58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b` |
| `public/fonts/manrope/FONTLOG.txt`          | [FONTLOG.txt](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/manrope/FONTLOG.txt)                          |   3,075 bytes | `b6b54bcc1dbd1b18d5afd087ec0b578097644b1c9ec3e0a642d4df7808f449c2` |

## Validation

- Both font files have the TrueType `0x00010000` signature and complete, in-bounds SFNT tables, including `name` and `fvar`.
- DM Sans has a weight axis of 100–1000 and an optical-size axis of 9–40. Its typographic family name is `DM Sans`.
- Manrope has a weight axis of 200–800. Its typographic family name is `Manrope`.
- Both full weight ranges cover the interface's 400, 500, 600, 700 and 800 styles. The full upstream fonts preserve accented characters rather than selecting a reduced web subset.
- A source scan found no remaining Google Fonts/CDN URL or external CSS import in `src` or `public` after replacement.

The change removes the browser's font-related third-party requests. It does not make claims about unrelated network features. Font assets and all sidecar notices must remain in the deployed public directory. The main review performs the final production build and browser verification.
