// Community → YAML file mapping for cultural-engine.ts
// This replaces the HERITAGE_FILE_MAP in cultural-engine.ts
// More granular: community-level not continent-level

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
  'ijaw':                 'fallbacks/west-african.yaml',
  'tiv':                  'fallbacks/west-african.yaml',
  'efik':                 'fallbacks/west-african.yaml',
  'urhobo':               'fallbacks/west-african.yaml',
  'edo':                  'fallbacks/west-african.yaml',
  'nigerian_other':       'fallbacks/west-african.yaml',
  'nigerian':             'fallbacks/west-african.yaml',

  // ── GHANA ─────────────────────────────────────────────────────────────────
  'akan':                 'fallbacks/west-african.yaml',   // TODO: communities/ghana-akan.yaml
  'ashanti':              'fallbacks/west-african.yaml',
  'fante':                'fallbacks/west-african.yaml',
  'ewe':                  'fallbacks/west-african.yaml',
  'ga':                   'fallbacks/west-african.yaml',
  'dagomba':              'fallbacks/west-african.yaml',
  'ghanaian':             'fallbacks/west-african.yaml',

  // ── SIERRA LEONE ─────────────────────────────────────────────────────────
  'temne':                'fallbacks/west-african.yaml',
  'mende':                'fallbacks/west-african.yaml',
  'sierra_leonean':       'fallbacks/west-african.yaml',
  'krio':                 'fallbacks/afro-caribbean.yaml',

  // ── SENEGAL / GAMBIA ──────────────────────────────────────────────────────
  'wolof':                'fallbacks/west-african.yaml',
  'serer':                'fallbacks/west-african.yaml',
  'senegalese':           'fallbacks/west-african.yaml',
  'gambian':              'fallbacks/west-african.yaml',

  // ── KENYA ─────────────────────────────────────────────────────────────────
  'kikuyu':               'fallbacks/west-african.yaml',   // TODO: communities/kenya-kikuyu.yaml
  'luo':                  'fallbacks/west-african.yaml',
  'luhya':                'fallbacks/west-african.yaml',
  'kalenjin':             'fallbacks/west-african.yaml',
  'kamba':                'fallbacks/west-african.yaml',
  'maasai':               'fallbacks/west-african.yaml',
  'kenyan':               'fallbacks/west-african.yaml',

  // ── UGANDA ────────────────────────────────────────────────────────────────
  'baganda':              'fallbacks/west-african.yaml',   // TODO: communities/uganda-baganda.yaml
  'banyankole':           'fallbacks/west-african.yaml',
  'acholi':               'fallbacks/west-african.yaml',
  'ugandan':              'fallbacks/west-african.yaml',

  // ── ZAMBIA ────────────────────────────────────────────────────────────────
  'bemba':                'fallbacks/west-african.yaml',   // TODO: communities/zambia-bemba.yaml
  'tonga_zambia':         'fallbacks/west-african.yaml',
  'nyanja':               'fallbacks/west-african.yaml',
  'lozi':                 'fallbacks/west-african.yaml',
  'zambian':              'fallbacks/west-african.yaml',

  // ── ZIMBABWE ──────────────────────────────────────────────────────────────
  'shona':                'fallbacks/west-african.yaml',
  'ndebele':              'fallbacks/west-african.yaml',
  'zimbabwean':           'fallbacks/west-african.yaml',

  // ── SOUTH AFRICA ──────────────────────────────────────────────────────────
  'zulu':                 'fallbacks/west-african.yaml',   // TODO: communities/south-africa-zulu.yaml
  'xhosa':                'fallbacks/west-african.yaml',
  'sotho':                'fallbacks/west-african.yaml',
  'tswana':               'fallbacks/west-african.yaml',
  'south_african':        'fallbacks/west-african.yaml',

  // ── ETHIOPIA / ERITREA ────────────────────────────────────────────────────
  'amhara':               'fallbacks/west-african.yaml',
  'oromo':                'fallbacks/west-african.yaml',
  'tigrinya':             'fallbacks/west-african.yaml',
  'ethiopian':            'fallbacks/west-african.yaml',
  'eritrean':             'fallbacks/west-african.yaml',

  // ── SOMALIA ───────────────────────────────────────────────────────────────
  'somali':               'fallbacks/west-african.yaml',   // TODO: communities/somalia.yaml

  // ── CARIBBEAN ─────────────────────────────────────────────────────────────
  'jamaican':             'fallbacks/afro-caribbean.yaml', // TODO: communities/jamaica.yaml
  'trinidadian':          'fallbacks/afro-caribbean.yaml',
  'barbadian':            'fallbacks/afro-caribbean.yaml',
  'guyanese':             'fallbacks/afro-caribbean.yaml',
  'haitian':              'fallbacks/afro-caribbean.yaml',
  'bajan':                'fallbacks/afro-caribbean.yaml',
  'grenadian':            'fallbacks/afro-caribbean.yaml',
  'vincentian':           'fallbacks/afro-caribbean.yaml',
  'kittitian':            'fallbacks/afro-caribbean.yaml',
  'antiguan':             'fallbacks/afro-caribbean.yaml',
  'st_lucian':            'fallbacks/afro-caribbean.yaml',
  'dominican_caribbean':  'fallbacks/afro-caribbean.yaml',
  'caribbean':            'fallbacks/afro-caribbean.yaml',

  // ── SOUTH ASIA — INDIA ────────────────────────────────────────────────────
  'punjabi':              'communities/india-punjabi.yaml',
  'punjabi_india':        'communities/india-punjabi.yaml',
  'punjabi_pakistan':     'communities/india-punjabi.yaml',
  'sikh':                 'communities/india-punjabi.yaml',
  'jat':                  'communities/india-punjabi.yaml',

  'gujarati':             'communities/india-gujarati.yaml',
  'jain':                 'communities/india-gujarati.yaml',
  'patel':                'communities/india-gujarati.yaml',

  'bengali_india':        'fallbacks/south-asian.yaml',   // TODO: communities/india-bengali.yaml
  'bengali':              'fallbacks/south-asian.yaml',

  'tamil':                'fallbacks/south-asian.yaml',   // TODO: communities/india-tamil.yaml
  'tamil_india':          'fallbacks/south-asian.yaml',
  'malayali':             'fallbacks/south-asian.yaml',   // TODO: communities/india-malayali.yaml
  'kerala':               'fallbacks/south-asian.yaml',
  'marathi':              'fallbacks/south-asian.yaml',
  'kannada':              'fallbacks/south-asian.yaml',
  'telugu':               'fallbacks/south-asian.yaml',
  'bihari':               'fallbacks/south-asian.yaml',
  'rajasthani':           'fallbacks/south-asian.yaml',
  'indian':               'fallbacks/south-asian.yaml',

  // ── SOUTH ASIA — PAKISTAN ─────────────────────────────────────────────────
  'sindhi':               'fallbacks/south-asian.yaml',   // TODO: communities/pakistan-sindhi.yaml
  'pashtun':              'fallbacks/south-asian.yaml',
  'pashto':               'fallbacks/south-asian.yaml',
  'balochi':              'fallbacks/south-asian.yaml',
  'kashmiri':             'fallbacks/south-asian.yaml',
  'pakistani':            'fallbacks/south-asian.yaml',

  // ── SOUTH ASIA — BANGLADESH ───────────────────────────────────────────────
  'bangladeshi':          'fallbacks/south-asian.yaml',   // TODO: communities/bangladesh.yaml
  'sylheti':              'fallbacks/south-asian.yaml',

  // ── SOUTH ASIA — SRI LANKA ───────────────────────────────────────────────
  'sinhalese':            'fallbacks/south-asian.yaml',
  'tamil_sri_lanka':      'fallbacks/south-asian.yaml',
  'sri_lankan':           'fallbacks/south-asian.yaml',

  // ── EAST ASIA ─────────────────────────────────────────────────────────────
  'cantonese':            'fallbacks/east-asian.yaml',    // TODO: communities/china-cantonese.yaml
  'hakka':                'fallbacks/east-asian.yaml',
  'mandarin':             'fallbacks/east-asian.yaml',
  'shanghainese':         'fallbacks/east-asian.yaml',
  'hokkien':              'fallbacks/east-asian.yaml',
  'chinese':              'fallbacks/east-asian.yaml',

  'japanese':             'fallbacks/east-asian.yaml',    // TODO: communities/japan.yaml
  'korean':               'fallbacks/east-asian.yaml',    // TODO: communities/korea.yaml
  'taiwanese':            'fallbacks/east-asian.yaml',

  // ── SOUTHEAST ASIA ───────────────────────────────────────────────────────
  'vietnamese':           'fallbacks/east-asian.yaml',
  'thai':                 'fallbacks/east-asian.yaml',
  'filipino':             'fallbacks/east-asian.yaml',
  'tagalog':              'fallbacks/east-asian.yaml',
  'cebuano':              'fallbacks/east-asian.yaml',
  'malay':                'fallbacks/east-asian.yaml',
  'javanese':             'fallbacks/east-asian.yaml',
  'indonesian':           'fallbacks/east-asian.yaml',
  'cambodian':            'fallbacks/east-asian.yaml',
  'myanmar':              'fallbacks/east-asian.yaml',

  // ── MIDDLE EAST / NORTH AFRICA ────────────────────────────────────────────
  'arab':                 'fallbacks/west-african.yaml',   // TODO: communities/arabic.yaml
  'moroccan':             'fallbacks/west-african.yaml',
  'algerian':             'fallbacks/west-african.yaml',
  'egyptian':             'fallbacks/west-african.yaml',
  'lebanese':             'fallbacks/west-african.yaml',
  'iranian':              'fallbacks/west-african.yaml',
  'persian':              'fallbacks/west-african.yaml',
  'turkish':              'fallbacks/west-african.yaml',
  'kurdish':              'fallbacks/west-african.yaml',
  'middle_eastern':       'fallbacks/west-african.yaml',

  // ── LATIN AMERICA ────────────────────────────────────────────────────────
  'mexican':              'fallbacks/hispanic-latina.yaml',
  'colombian':            'fallbacks/hispanic-latina.yaml',
  'puerto_rican':         'fallbacks/hispanic-latina.yaml',
  'cuban':                'fallbacks/hispanic-latina.yaml',
  'dominican':            'fallbacks/hispanic-latina.yaml',
  'peruvian':             'fallbacks/hispanic-latina.yaml',
  'ecuadorian':           'fallbacks/hispanic-latina.yaml',
  'guatemalan':           'fallbacks/hispanic-latina.yaml',
  'brazilian':            'fallbacks/hispanic-latina.yaml',
  'argentina':            'fallbacks/hispanic-latina.yaml',
  'chilean':              'fallbacks/hispanic-latina.yaml',
  'venezuelan':           'fallbacks/hispanic-latina.yaml',
  'bolivian':             'fallbacks/hispanic-latina.yaml',
  'hispanic':             'fallbacks/hispanic-latina.yaml',
  'latina':               'fallbacks/hispanic-latina.yaml',

  // ── WHITE BRITISH / EUROPEAN ──────────────────────────────────────────────
  'white_british':        'fallbacks/white-british-irish.yaml',
  'english':              'fallbacks/white-british-irish.yaml',
  'scottish':             'fallbacks/white-british-irish.yaml',
  'welsh':                'fallbacks/white-british-irish.yaml',
  'white_irish':          'fallbacks/white-british-irish.yaml',
  'irish':                'fallbacks/white-british-irish.yaml',
  'white_european':       'fallbacks/white-british-irish.yaml',
  'eastern_european':     'fallbacks/white-british-irish.yaml',
  'polish':               'fallbacks/white-british-irish.yaml',
  'romanian':             'fallbacks/white-british-irish.yaml',
  'ukrainian':            'fallbacks/white-british-irish.yaml',
  'mediterranean':        'fallbacks/white-british-irish.yaml',
  'italian':              'fallbacks/white-british-irish.yaml',
  'greek':                'fallbacks/white-british-irish.yaml',
  'spanish':              'fallbacks/white-british-irish.yaml',
  'portuguese':           'fallbacks/white-british-irish.yaml',

}

// Location file map — applied in addition to community modifier
export const LOCATION_FILE_MAP: Record<string, string> = {
  'GB':  'location-modifiers/uk-diaspora.yaml',
  'UK':  'location-modifiers/uk-diaspora.yaml',
  'US':  'location-modifiers/usa-diaspora.yaml',   // TODO
  'CA':  'location-modifiers/canada-diaspora.yaml', // TODO
  'AU':  'location-modifiers/australia-diaspora.yaml', // TODO
}
