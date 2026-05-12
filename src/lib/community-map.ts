/**
 * Community → YAML file mapping for cultural-engine.ts.
 *
 * Each key is a normalised community identifier (lowercase, underscored) that
 * maps to a YAML file path relative to content/wellness/cultural/.
 *
 * Specific communities (e.g. Yoruba, Gujarati) map to files under communities/.
 * Communities without a dedicated file fall back to a regional file at the root
 * level (e.g. west-african.yaml, south-asian.yaml).
 *
 * The cultural engine (loadCulturalModifiers) joins these paths with the
 * CULTURAL_DIR constant to produce the full filesystem path.
 */

export const COMMUNITY_FILE_MAP: Record<string, string> = {

  // ── NIGERIA ───────────────────────────────────────────────────────────────
  // Yoruba
  'yoruba':               'communities/nigeria-yoruba.yaml',
  'yoruba_nigeria':       'communities/nigeria-yoruba.yaml',
  'nigerian_yoruba':      'communities/nigeria-yoruba.yaml',

  // Igbo
  'igbo':                 'communities/nigeria-igbo.yaml',
  'ibo':                  'communities/nigeria-igbo.yaml',
  'nigerian_igbo':        'communities/nigeria-igbo.yaml',

  // Hausa-Fulani
  'hausa':                'communities/nigeria-hausa.yaml',
  'fulani':               'communities/nigeria-hausa.yaml',
  'hausa_fulani':         'communities/nigeria-hausa.yaml',
  'nigerian_hausa':       'communities/nigeria-hausa.yaml',
  'northern_nigerian':    'communities/nigeria-hausa.yaml',

  // Other Nigerian → fallback to west-african
  'ijaw':                 'west-african.yaml',
  'tiv':                  'west-african.yaml',
  'efik':                 'west-african.yaml',
  'urhobo':               'west-african.yaml',
  'edo':                  'west-african.yaml',
  'nigerian_other':       'west-african.yaml',
  'nigerian':             'west-african.yaml',

  // ── GHANA ─────────────────────────────────────────────────────────────────
  'akan':                 'west-african.yaml',   // TODO: communities/ghana-akan.yaml
  'ashanti':              'west-african.yaml',
  'fante':                'west-african.yaml',
  'ewe':                  'west-african.yaml',
  'ga':                   'west-african.yaml',
  'dagomba':              'west-african.yaml',
  'ghanaian':             'west-african.yaml',

  // ── SIERRA LEONE ─────────────────────────────────────────────────────────
  'temne':                'west-african.yaml',
  'mende':                'west-african.yaml',
  'sierra_leonean':       'west-african.yaml',
  'krio':                 'afro-caribbean.yaml',

  // ── SENEGAL / GAMBIA ──────────────────────────────────────────────────────
  'wolof':                'west-african.yaml',
  'serer':                'west-african.yaml',
  'senegalese':           'west-african.yaml',
  'gambian':              'west-african.yaml',

  // ── KENYA ─────────────────────────────────────────────────────────────────
  'kikuyu':               'west-african.yaml',   // TODO: communities/kenya-kikuyu.yaml
  'luo':                  'west-african.yaml',
  'luhya':                'west-african.yaml',
  'kalenjin':             'west-african.yaml',
  'kamba':                'west-african.yaml',
  'maasai':               'west-african.yaml',
  'kenyan':               'west-african.yaml',

  // ── UGANDA ────────────────────────────────────────────────────────────────
  'baganda':              'west-african.yaml',   // TODO: communities/uganda-baganda.yaml
  'banyankole':           'west-african.yaml',
  'acholi':               'west-african.yaml',
  'ugandan':              'west-african.yaml',

  // ── ZAMBIA ────────────────────────────────────────────────────────────────
  'bemba':                'west-african.yaml',   // TODO: communities/zambia-bemba.yaml
  'tonga_zambia':         'west-african.yaml',
  'nyanja':               'west-african.yaml',
  'lozi':                 'west-african.yaml',
  'zambian':              'west-african.yaml',

  // ── ZIMBABWE ──────────────────────────────────────────────────────────────
  'shona':                'west-african.yaml',
  'ndebele':              'west-african.yaml',
  'zimbabwean':           'west-african.yaml',

  // ── SOUTH AFRICA ──────────────────────────────────────────────────────────
  'zulu':                 'west-african.yaml',   // TODO: communities/south-africa-zulu.yaml
  'xhosa':                'west-african.yaml',
  'sotho':                'west-african.yaml',
  'tswana':               'west-african.yaml',
  'south_african':        'west-african.yaml',

  // ── ETHIOPIA / ERITREA ────────────────────────────────────────────────────
  'amhara':               'west-african.yaml',
  'oromo':                'west-african.yaml',
  'tigrinya':             'west-african.yaml',
  'ethiopian':            'west-african.yaml',
  'eritrean':             'west-african.yaml',

  // ── SOMALIA ───────────────────────────────────────────────────────────────
  'somali':               'west-african.yaml',   // TODO: communities/somalia.yaml

  // ── CARIBBEAN ─────────────────────────────────────────────────────────────
  'jamaican':             'afro-caribbean.yaml', // TODO: communities/jamaica.yaml
  'trinidadian':          'afro-caribbean.yaml',
  'barbadian':            'afro-caribbean.yaml',
  'guyanese':             'afro-caribbean.yaml',
  'haitian':              'afro-caribbean.yaml',
  'bajan':                'afro-caribbean.yaml',
  'grenadian':            'afro-caribbean.yaml',
  'vincentian':           'afro-caribbean.yaml',
  'kittitian':            'afro-caribbean.yaml',
  'antiguan':             'afro-caribbean.yaml',
  'st_lucian':            'afro-caribbean.yaml',
  'dominican_caribbean':  'afro-caribbean.yaml',
  'caribbean':            'afro-caribbean.yaml',

  // ── SOUTH ASIA — INDIA ────────────────────────────────────────────────────
  'punjabi':              'communities/india-punjabi.yaml',
  'punjabi_india':        'communities/india-punjabi.yaml',
  'punjabi_pakistan':     'communities/india-punjabi.yaml',
  'sikh':                 'communities/india-punjabi.yaml',
  'jat':                  'communities/india-punjabi.yaml',

  'gujarati':             'communities/india-gujarati.yaml',
  'jain':                 'communities/india-gujarati.yaml',
  'patel':                'communities/india-gujarati.yaml',

  'bengali_india':        'south-asian.yaml',   // TODO: communities/india-bengali.yaml
  'bengali':              'south-asian.yaml',

  'tamil':                'south-asian.yaml',   // TODO: communities/india-tamil.yaml
  'tamil_india':          'south-asian.yaml',
  'malayali':             'south-asian.yaml',   // TODO: communities/india-malayali.yaml
  'kerala':               'south-asian.yaml',
  'marathi':              'south-asian.yaml',
  'kannada':              'south-asian.yaml',
  'telugu':               'south-asian.yaml',
  'bihari':               'south-asian.yaml',
  'rajasthani':           'south-asian.yaml',
  'indian':               'south-asian.yaml',

  // ── SOUTH ASIA — PAKISTAN ─────────────────────────────────────────────────
  'sindhi':               'south-asian.yaml',   // TODO: communities/pakistan-sindhi.yaml
  'pashtun':              'south-asian.yaml',
  'pashto':               'south-asian.yaml',
  'balochi':              'south-asian.yaml',
  'kashmiri':             'south-asian.yaml',
  'pakistani':            'south-asian.yaml',

  // ── SOUTH ASIA — BANGLADESH ───────────────────────────────────────────────
  'bangladeshi':          'south-asian.yaml',   // TODO: communities/bangladesh.yaml
  'sylheti':              'south-asian.yaml',

  // ── SOUTH ASIA — SRI LANKA ───────────────────────────────────────────────
  'sinhalese':            'south-asian.yaml',
  'tamil_sri_lanka':      'south-asian.yaml',
  'sri_lankan':           'south-asian.yaml',

  // ── EAST ASIA ─────────────────────────────────────────────────────────────
  'cantonese':            'east-asian.yaml',    // TODO: communities/china-cantonese.yaml
  'hakka':                'east-asian.yaml',
  'mandarin':             'east-asian.yaml',
  'shanghainese':         'east-asian.yaml',
  'hokkien':              'east-asian.yaml',
  'chinese':              'east-asian.yaml',

  'japanese':             'east-asian.yaml',    // TODO: communities/japan.yaml
  'korean':               'east-asian.yaml',    // TODO: communities/korea.yaml
  'taiwanese':            'east-asian.yaml',

  // ── SOUTHEAST ASIA ───────────────────────────────────────────────────────
  'vietnamese':           'east-asian.yaml',
  'thai':                 'east-asian.yaml',
  'filipino':             'east-asian.yaml',
  'tagalog':              'east-asian.yaml',
  'cebuano':              'east-asian.yaml',
  'malay':                'east-asian.yaml',
  'javanese':             'east-asian.yaml',
  'indonesian':           'east-asian.yaml',
  'cambodian':            'east-asian.yaml',
  'myanmar':              'east-asian.yaml',

  // ── MIDDLE EAST / NORTH AFRICA ────────────────────────────────────────────
  'arab':                 'west-african.yaml',   // TODO: communities/arabic.yaml
  'moroccan':             'west-african.yaml',
  'algerian':             'west-african.yaml',
  'egyptian':             'west-african.yaml',
  'lebanese':             'west-african.yaml',
  'iranian':              'west-african.yaml',
  'persian':              'west-african.yaml',
  'turkish':              'west-african.yaml',
  'kurdish':              'west-african.yaml',
  'middle_eastern':       'west-african.yaml',

  // ── LATIN AMERICA ────────────────────────────────────────────────────────
  'mexican':              'hispanic-latina.yaml',
  'colombian':            'hispanic-latina.yaml',
  'puerto_rican':         'hispanic-latina.yaml',
  'cuban':                'hispanic-latina.yaml',
  'dominican':            'hispanic-latina.yaml',
  'peruvian':             'hispanic-latina.yaml',
  'ecuadorian':           'hispanic-latina.yaml',
  'guatemalan':           'hispanic-latina.yaml',
  'brazilian':            'hispanic-latina.yaml',
  'argentina':            'hispanic-latina.yaml',
  'chilean':              'hispanic-latina.yaml',
  'venezuelan':           'hispanic-latina.yaml',
  'bolivian':             'hispanic-latina.yaml',
  'hispanic':             'hispanic-latina.yaml',
  'latina':               'hispanic-latina.yaml',

  // ── WHITE BRITISH / EUROPEAN ──────────────────────────────────────────────
  'white_british':        'white-british-irish.yaml',
  'english':              'white-british-irish.yaml',
  'scottish':             'white-british-irish.yaml',
  'welsh':                'white-british-irish.yaml',
  'white_irish':          'white-british-irish.yaml',
  'irish':                'white-british-irish.yaml',
  'white_european':       'white-british-irish.yaml',
  'eastern_european':     'white-british-irish.yaml',
  'polish':               'white-british-irish.yaml',
  'romanian':             'white-british-irish.yaml',
  'ukrainian':            'white-british-irish.yaml',
  'mediterranean':        'white-british-irish.yaml',
  'italian':              'white-british-irish.yaml',
  'greek':                'white-british-irish.yaml',
  'spanish':              'white-british-irish.yaml',
  'portuguese':           'white-british-irish.yaml',

}

// Location file map — applied in addition to community modifier
export const LOCATION_FILE_MAP: Record<string, string> = {
  'GB':  'location-modifiers/uk-diaspora.yaml',
  'UK':  'location-modifiers/uk-diaspora.yaml',
  'US':  'location-modifiers/usa-diaspora.yaml',   // TODO
  'CA':  'location-modifiers/canada-diaspora.yaml', // TODO
  'AU':  'location-modifiers/australia-diaspora.yaml', // TODO
}
