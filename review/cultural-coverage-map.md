# Cultural content — coverage map

_Generated 7 October 2026 from `src/lib/onboarding-config.ts` (what a woman can pick at onboarding)
and `src/lib/community-map.ts` (which content file she then gets). Every option was resolved by
script and every file's existence checked on disk — nothing here is inferred from file names._

This is a gap map, not content. Every new cultural file is health content and needs verified
sources and Pamela's sign-off before it ships (see `CLAUDE.md`).

## Summary

| What she gets | Options | Share |
|---|---:|---:|
| Content written for her specific community | 6 | 7% |
| A broader regional file (a fallback) | 77 | 85% |
| No cultural content at all | 8 | 9% |
| **Total heritage options** | **91** | |

Location: only the **UK** has a location file. **US, Canada and Australia** are offered at
onboarding and mapped in code, but their files don't exist, so those users silently get nothing.

---

## 1. Fallbacks that send her to the wrong culture (highest priority)

The code already rejects this pattern for Middle East & North Africa (MENA): its comment says
falling back to `west-african.yaml` ("egusi soup, moringa — wrong culture, wrong diet, wrong
context") is **worse than showing no cultural modifier at all**. These options do exactly that today:

| Group | Options | Currently gets | Problem |
|---|---|---|---|
| East & Southern Africa | Kikuyu, Luo, Other Kenyan, Baganda, Other Ugandan, Bemba, Other Zambian, Shona, Zulu, Xhosa, Other South African | `west-african.yaml` | West African diet and context for women from Kenya, Uganda, Zambia, Zimbabwe and South Africa |
| Horn of Africa | Amhara / Oromo (Ethiopia), Somali | `west-african.yaml` | Very different food traditions from West Africa (e.g. teff and injera), and many Ethiopian Orthodox women follow religious fasting periods |
| Latin America | Brazilian | `hispanic-latina.yaml` | Brazil is Portuguese-speaking, not Hispanic; the file's header doesn't list Brazil |
| Europe | Polish, Other Eastern European, Mediterranean (Italian / Greek / Spanish), Other White European | `white-british-irish.yaml` | File content is British-specific (e.g. fish and chips) |

**Decision needed (you and Pamela):** for each row, either (a) unmap it until proper content
exists, as was done for MENA, or (b) keep the fallback because some of the content still helps.
Option (a) is consistent with the rule already in the code.

## 2. Offered at onboarding, no content at all

| Group | Options |
|---|---|
| Middle East & North Africa | Arab (general), Moroccan, Egyptian, Lebanese / Syrian, Iranian / Persian, Turkish / Kurdish — **deliberately** unmapped until a MENA file is written |
| Other | Mixed heritage, Prefer not to say — correct by design (mixed heritage picks its communities above) |

## 3. Reasonable regional fallback, dedicated file still to write

Listed as TODOs in `community-map.ts`. Each group's regional file is broadly the right culture.

| Regional file | Options still using it | TODO files named in code |
|---|---|---|
| `west-african.yaml` | Ijaw, Edo, Efik / Ibibio, Urhobo, Other Nigerian, Akan, Ewe, Ga, Other Ghanaian, Wolof, Temne / Mende | `communities/ghana-akan.yaml` |
| `afro-caribbean.yaml` | Jamaican, Trinidadian, Barbadian, Guyanese, Haitian, Grenadian, St Lucian, Other Caribbean, Krio (Sierra Leone) | `communities/jamaica.yaml` |
| `south-asian.yaml` | Bengali (West Bengal), Tamil, Malayali, Marathi, Telugu, Kannada, Bihari / UP, Rajasthani, Other Indian, Sindhi, Pashtun, Kashmiri, Other Pakistani, Bangladeshi, Sylheti, Sri Lankan | `india-bengali`, `india-tamil`, `india-malayali`, `pakistan-sindhi`, `bangladesh` |
| `east-asian.yaml` | Cantonese, Mandarin, Hakka, Hokkien, Japanese, Korean, Taiwanese, Vietnamese, Filipino, Thai, Malay, Indonesian | `china-cantonese`, `japan`, `korea` |
| `hispanic-latina.yaml` | Mexican, Colombian, Puerto Rican, Cuban, Dominican, Peruvian, Other Latin American | — |
| `white-british-irish.yaml` | English, Scottish, Welsh, Irish | — |

Notes:
- **Southeast Asia** (Vietnamese, Filipino, Thai, Malay, Indonesian) uses `east-asian.yaml`,
  whose content is built around Chinese and Japanese soy-rich diets. That works less well here
  than for the East Asian options; worth a Southeast Asia file in time.
- **Krio → `afro-caribbean.yaml`** looks deliberate (Krio heritage includes settlers from the
  Caribbean), but unlike the other choices it has no comment explaining it. Worth confirming.
- **Punjabi (Pakistan / Muslim)** uses `communities/india-punjabi.yaml`, whose header says it
  covers both and notes religious dietary differences. Fine as is, though the file name says India.

## 4. Have content

| File | Options |
|---|---|
| `communities/nigeria-yoruba.yaml` | Yoruba |
| `communities/nigeria-igbo.yaml` | Igbo |
| `communities/nigeria-hausa.yaml` | Hausa / Hausa-Fulani |
| `communities/india-punjabi.yaml` | Punjabi (India), Punjabi (Pakistan) |
| `communities/india-gujarati.yaml` | Gujarati |
| `location-modifiers/uk-diaspora.yaml` | Country = UK |

## 5. Problems found in the existing cultural files

Not gaps, but found while mapping. These need fixing before more content is built on them:

- **Afro-Caribbean timeline contradicts itself.** The source note at the top of
  `afro-caribbean.yaml` (line 8) says SWAN found Black women reach menopause **8.5 months**
  earlier; the text users see (line 25) says **about 18 months** earlier. At most one of those
  is right. Check against the SWAN paper before anything else.
- **Weak sources.** The research notes in `nigeria-hausa.yaml` and `nigeria-igbo.yaml` cite
  Quora, Legit.ng and BusinessDay, and `india-punjabi.yaml` cites "Goldman Labs 2026", which
  I could not identify. None of these meets the "real, checkable source" rule for health claims.
- **None of the cultural files' numbers are in `content/wellness/claims.yaml`**, so the build's
  tripwire for numeric claims doesn't cover them.

## Suggested order

1. Fix the Afro-Caribbean 8.5- vs 18-month contradiction (live, user-facing).
2. Decide the wrong-culture fallbacks in section 1 (a one-line code change each, once decided).
3. Write `east-southern-african.yaml` and a Horn of Africa file — the largest groups currently
   given the wrong culture.
4. Write the MENA file.
5. US / Canada / Australia location files, or remove them from onboarding until they exist.
6. Then the dedicated community files in section 3.
