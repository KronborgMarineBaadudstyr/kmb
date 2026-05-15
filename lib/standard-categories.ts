// ── Category & boat-type assignment ──────────────────────────────────────────
// Single source of truth for the 13 main categories, their subcategories,
// default boat types, and the regex patterns used to classify products.

export type BoatType = 'sejlbåd' | 'motorbåd'

export type SubcatDef = {
  name:     string
  patterns: RegExp[]
}

export type CategoryDef = {
  name:             string
  subcategories:    SubcatDef[]
  defaultBoatTypes: BoatType[]   // used when name-level keywords give no signal
  patterns:         RegExp[]     // match against product name (and old category strings)
}

// ── Name-level boat-type overrides ────────────────────────────────────────────
const SAIL_KW  = /\b(sejlbåd|sejlring|mastekrog|mastetop|bom\b|vant\b|stag\b|fok\b|genua|spiler|stagfok|klyverbom|spinaker|achterstag|forestag|skødevogn|faldwire|haletalje)\b/i
const MOTOR_KW = /\b(udenbords|indbords|påhængsmotor|gearkasse|propel(?:aksel|ring|nav|hub)?|z.?drev|saildrive|bovtruster|hæktruster)\b/i

// ── The 13 categories ─────────────────────────────────────────────────────────
export const CATEGORIES: CategoryDef[] = [

  // 1 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Sko/støvler',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(sejlersko|dækssko|bådsko|gummistøvl|sejlerstøvl|neopren.*sko|vandsko)\b/i],
    subcategories: [
      { name: 'Sejlersko',    patterns: [/sejlersko|bådsko|dækssko/i] },
      { name: 'Gummistøvler', patterns: [/gummistøvl/i] },
      { name: 'Dækssko',      patterns: [/dækssko/i] },
      { name: 'Sandaler',     patterns: [/sandal/i] },
    ],
  },

  // 2 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Sejlertøj',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(sejlerjakke|regnjakke|sejlerbukser?|offshore.*jakke|foulweather|gore.?tex.*båd|flydedrag|sejlerhandsk|neopren.*handsk|uv.?shirt|uv.?trøje|sejlervest)\b/i],
    subcategories: [
      { name: 'Jakker & regntøj',   patterns: [/jakke|regnjakke|foulweather|offshore/i] },
      { name: 'Bukser',             patterns: [/bukser?|sejlerbukser/i] },
      { name: 'Handsker',           patterns: [/handsk/i] },
      { name: 'Hatte & huer',       patterns: [/hat\b|hue\b|kasket/i] },
      { name: 'Mellemlag & fleece', patterns: [/fleece|midterlag|mellemlag/i] },
      { name: 'Badetøj & UV',       patterns: [/badetøj|uv.?shirt|uv.?trøje|uv.?beskyt/i] },
    ],
  },

  // 3 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Sikkerhed',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(redningsvest|flydevest|flydedrag|pyroteknik|nødraket|signalraket|røgbombe|brandslukker|MOB\b|EPIRB|PLB\b|nødsender|sikkerhedssele|livline|kastering|redningskrans|redningsring|sikkerhedsnet|overlevelsesdragt|liferaft|redningsflåde)\b/i],
    subcategories: [
      { name: 'Redningsveste',           patterns: [/redningsvest|flydevest/i] },
      { name: 'Pyroteknik',              patterns: [/pyroteknik|nødraket|signalraket|røgbombe/i] },
      { name: 'Brandslukker',            patterns: [/brandslukker/i] },
      { name: 'MOB-udstyr',              patterns: [/\bMOB\b|man.*overbord/i] },
      { name: 'EPIRB & PLB',             patterns: [/EPIRB|\bPLB\b|nødsender/i] },
      { name: 'Sikkerhedsseler',         patterns: [/sikkerhedssele/i] },
      { name: 'Kastering',               patterns: [/kastering|redningskrans|redningsring/i] },
      { name: 'Livline & sikkerhedsnet', patterns: [/livline|sikkerhedsnet/i] },
    ],
  },

  // 4 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Gaveartikler',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(skibsklokke|olielampe|messing.*artikel|teak.*artikel|nøglering.*båd|miniature.*båd|skibsmodel|bådmodel|nautisk.*dekoration)\b/i],
    subcategories: [
      { name: 'Skibsklokker',     patterns: [/skibsklokke/i] },
      { name: 'Ure',              patterns: [/\bur\b(?!.*instrument)/i] },
      { name: 'Søkort',           patterns: [/søkort(?!.*navigation)/i] },
      { name: 'Teak artikler',    patterns: [/teak.*artikel|teak.*gave/i] },
      { name: 'Olielamper',       patterns: [/olielampe/i] },
      { name: 'Sengetøj',         patterns: [/sengetøj(?!.*komfort)|dyne(?!.*komfort)/i] },
      { name: 'Messing artikler', patterns: [/messing/i] },
      { name: 'Cykler',           patterns: [/cykel|foldecykel/i] },
      { name: 'Nøgleringe',       patterns: [/nøglering/i] },
      { name: 'Bøger',            patterns: [/\bbog\b|bøger(?!.*navigation)/i] },
      { name: 'Væger',            patterns: [/væger/i] },
    ],
  },

  // 5 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Vandsport',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(gummibåd|SUP\b|sup.board|paddleboard|våddragt|tørdragt|tube\b|tubes\b|vandski|wakeboard|snorkel|dykkemask|svømmefødder|flippers|kneeboard)\b/i],
    subcategories: [
      { name: 'Gummibåd',    patterns: [/gummibåd|oppustelig.*båd/i] },
      { name: 'SUP',         patterns: [/\bSUP\b|sup.board|paddleboard|standup.*paddle/i] },
      { name: 'Våddragter',  patterns: [/våddragt|wetsuit/i] },
      { name: 'Tubes',       patterns: [/\btube\b|\btubes\b/i] },
      { name: 'Vandski',     patterns: [/vandski|wakeboard/i] },
      { name: 'Tørdragter',  patterns: [/tørdragt|drysuit/i] },
      { name: 'Redningsveste', patterns: [/redningsvest.*sport|sport.*redningsvest|buoyancy.*aid/i] },
      { name: 'Tilbehør',    patterns: [/snorkel|dykke|svømmefødder|flipper/i] },
    ],
  },

  // 6 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Komfort ombord',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(køleskab|køleboks|komfur|gaskoger|gasgrill|pantryvaske|hynde|cockpit.*hynde|kahytshynde|solsejl|bimini|skibsflag|grill.*båd|kabysudstyr|sengetøj.*båd|pude.*båd|aptering|skibsur|kahytsur)\b/i],
    subcategories: [
      { name: 'Køleskab & køleboks',      patterns: [/køleskab|køleboks|kompressor.*køl/i] },
      { name: 'Komfur',                   patterns: [/komfur|gaskoger|kogeblus/i] },
      { name: 'Gas ombord',               patterns: [/\bgas\b.*(?:ombord|flaske|anlæg|regulat)|gasflaske|gasanlæg/i] },
      { name: 'Vaske',                    patterns: [/\bvask\b|pantryvaske|kum/i] },
      { name: 'Service',                  patterns: [/service.*sæt|tallerk|bestik/i] },
      { name: 'Flag m.m.',                patterns: [/\bflag\b|vimpel|stander/i] },
      { name: 'Grill',                    patterns: [/grill/i] },
      { name: 'Pantry pumper',            patterns: [/pantrypumpe|foot.*pump.*pantry/i] },
      { name: 'Hynder',                   patterns: [/hynde|polstring/i] },
      { name: 'Solsejl',                  patterns: [/solsejl|solpresenning|bimini/i] },
      { name: 'Opbevaring',               patterns: [/opbevar|net.*opbevar|stuvning/i] },
      { name: 'Stole & borde',            patterns: [/\bstol\b|\bbord\b.*båd|folde.*stol/i] },
      { name: 'Sengetøj, Puder m.m.',     patterns: [/sengetøj|pude\b|dyne\b|sovepose/i] },
      { name: 'Aptering',                 patterns: [/aptering|interior|interiør/i] },
      { name: 'Ure, skibsklokker m.m.',   patterns: [/skibsur|kahytsur/i] },
    ],
  },

  // 7 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Tovværk & Anker',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(fortøjningstov|fortøjningsline|polyester.*tov|nylon.*tov|dobbeltflettet|enkeltflettet|taklegarn|hampetov|hamp.*tov|elastik.*tov|bungee.*tov|sjækel|splejsegrej|splejsepind|fald\b|skøde\b|fenderline|blytov|anker\b|ankerkæde|plov.*anker|delta.*anker|CQR\b|fortøjningsbeslag)\b/i],
    subcategories: [
      { name: 'Tov',          patterns: [/(?:polyester|nylon|dobbelt|enkelt).*tov|tov.*(?:polyester|nylon)|flydeline/i] },
      { name: 'Fortøjning',   patterns: [/fortøjning/i] },
      { name: 'Taklegarn',    patterns: [/taklegarn/i] },
      { name: 'Nåle m.m.',    patterns: [/splejsenål|syenål|marlspicer/i] },
      { name: 'Elastik',      patterns: [/elastik|bungee/i] },
      { name: 'Tov hamp',     patterns: [/hamp|hampetov/i] },
      { name: 'Sjækler',      patterns: [/sjækel/i] },
      { name: 'Splejsegrej',  patterns: [/splejse/i] },
      { name: 'Fald',         patterns: [/\bfald\b/i] },
      { name: 'Skøde',        patterns: [/\bskøde\b/i] },
      { name: 'Fenderline',   patterns: [/fenderline|fendertov/i] },
      { name: 'Blytov',       patterns: [/blytov|lodline/i] },
      { name: 'Anker',        patterns: [/\banker\b|CQR|delta.*anker|plov.*anker/i] },
      { name: 'Kæde',         patterns: [/kæde|ankerkæde/i] },
    ],
  },

  // 8 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Rig & Dæk',
    defaultBoatTypes: ['sejlbåd'],
    patterns: [/\b(blok\b|blokke|klampe\b|klyds\b|rigdel|spil\b|winch\b|skødvogn|håndliste|pulpit|badestige|badeplatform|stævnplatform|teak.*dæk|luge\b|skylight|fender\b|fenderpude|gasfjedr|ankerspil|bomkicker|kicker\b|bompresse|nakkeline)\b/i],
    subcategories: [
      { name: 'Hængsler og Beslag',       patterns: [/hængsel|beslag.*dæk|dæk.*beslag/i] },
      { name: 'Blokke',                   patterns: [/\bblok\b|\bblokke\b/i] },
      { name: 'Aflaster',                 patterns: [/aflaster|clutch\b/i] },
      { name: 'Klamper & klyds',          patterns: [/klampe|klyds/i] },
      { name: 'Rigdele',                  patterns: [/rigdel/i] },
      { name: 'Spil',                     patterns: [/\bspil\b|\bwinch\b/i] },
      { name: 'Ankerspil',                patterns: [/ankerspil|vindespil/i] },
      { name: 'Skødvogne & skinner',      patterns: [/skødvogn|travervogn/i] },
      { name: 'Håndlister',               patterns: [/håndliste/i] },
      { name: 'Stiger',                   patterns: [/stige(?!.*bade)/i] },
      { name: 'Pulpits',                  patterns: [/pulpit/i] },
      { name: 'Sjækler',                  patterns: [/sjækel/i] },
      { name: 'Badestiger',               patterns: [/badestige/i] },
      { name: 'Bade & stævnplatform',     patterns: [/badeplatform|stævnplatform|swim.*platform/i] },
      { name: 'Teak dæk',                 patterns: [/teak.*dæk|dæk.*teak/i] },
      { name: 'Luger & skylight',         patterns: [/luge\b|skylight/i] },
      { name: 'Fender',                   patterns: [/fender/i] },
      { name: 'Gasfjedre',                patterns: [/gasfjedr|gasfjeder/i] },
    ],
  },

  // 9 ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Elektronik og Navigation',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(chartplotter|GPS\b|ekkolod|fishfinder|fish.*finder|vindmåler|vindgiver|VHF\b|AIS\b|marifon|radar\b|autopilot|transducer|søkort|kompas|kikkert|skibsradio|marin.*stereo|NMEA\b|plotter\b|DSC\b)\b/i],
    subcategories: [
      { name: 'GPS',                patterns: [/\bGPS\b|chartplotter|plotter/i] },
      { name: 'Ekkolod',            patterns: [/ekkolod/i] },
      { name: 'Fishfinder',         patterns: [/fishfinder|fish.*finder/i] },
      { name: 'Vindmåler',          patterns: [/vindmåler|vindgiver|anemometer/i] },
      { name: 'VHF & AIS',          patterns: [/\bVHF\b|\bAIS\b|marifon|DSC/i] },
      { name: 'Antenner',           patterns: [/antenne/i] },
      { name: 'Autopilot',          patterns: [/autopilot/i] },
      { name: 'Instrumenter',       patterns: [/instrument.*panel|instrumentpanel|instrument.*display/i] },
      { name: 'Transducer',         patterns: [/transducer/i] },
      { name: 'Kabler',             patterns: [/kabel.*nav|NMEA.*kabel/i] },
      { name: 'Søkort',             patterns: [/søkort/i] },
      { name: 'Kikkerter',          patterns: [/kikkert/i] },
      { name: 'Stereo',             patterns: [/stereo|højttal|marin.*lyd/i] },
      { name: 'Radio & Tv',         patterns: [/radio|tv\b|fjernsyn/i] },
      { name: 'Bøger & Navigation', patterns: [/\bbog\b.*nav|nautisk.*håndbog/i] },
      { name: 'Radar',              patterns: [/\bradar\b/i] },
      { name: 'Tilbehør m.m.',      patterns: [/.*/i] },   // catch-all within this category
    ],
  },

  // 10 ────────────────────────────────────────────────────────────────────────
  {
    name: 'Motor & Olie',
    defaultBoatTypes: ['motorbåd'],
    patterns: [/\b(motorolie|gear.*olie|2.?takt|4.?takt|impeller|zinkanode|brændstoftank|benzintank|dieseltank|brændstofslange|brændstoffilter|motorfilter|udenbords.*del|indbords.*del|reservedel.*motor|el.?motor.*båd|motorbeslag|bovtruster|hæktruster|propel(?:aksel|ring|nav|hub)?|gearkasse|styresystem|ror(?:aksel|beslag|pinne)?|rat\b(?!.*grill)|brændstofsystem|motor(?:køler|ventil|pakning))\b/i],
    subcategories: [
      { name: 'Olieprodukter',                patterns: [/olie|fedt\b/i] },
      { name: 'Zink',                         patterns: [/zink/i] },
      { name: 'Filtre',                       patterns: [/filter.*motor|motorfilter|brændstoffilter|oliefilter/i] },
      { name: 'Impeller',                     patterns: [/impeller/i] },
      { name: 'Brændstoftanke',               patterns: [/brændstoftank|benzintank|dieseltank/i] },
      { name: 'Reservedele indenbordsmotor',  patterns: [/indbords.*del|reservedel.*indbords/i] },
      { name: 'Reservedele udenbordsmotor',   patterns: [/udenbords.*del|reservedel.*udenbords/i] },
      { name: 'El-motor',                     patterns: [/el.?motor|elektrisk.*motor/i] },
      { name: 'Brændstofslanger',             patterns: [/brændstofslange|benzinslange|dieselslange/i] },
      { name: 'Motorbeslag',                  patterns: [/motorbeslag|motorfæste/i] },
      { name: 'Styringer',                    patterns: [/styring|styresystem|rorlinke/i] },
      { name: 'Rat',                          patterns: [/\brat\b(?!.*grill)/i] },
      { name: 'Bovtruster',                   patterns: [/bovtruster|hæktruster|truster/i] },
      { name: 'Plejemidler til motor',        patterns: [/plejemid.*motor|motor.*rens|karbur.*rens/i] },
      { name: 'Instrumenter',                 patterns: [/tachometer|omdrejnings.*tæller|motor.*instrument|temp.*instrument/i] },
    ],
  },

  // 11 ────────────────────────────────────────────────────────────────────────
  {
    name: 'El & installationer',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(AGM.*batteri|gel.*batteri|lithium.*batteri|batterilader|solcelle|solpanel|LED\b|LED.*lys|navigationslys|lanterne\b|lanterner\b|projektør.*båd|dækslys|sikringsautomat|el.?panel|fordelingspanel|elfordeling|hovedafbryder|batterikobler|landstrøm|shore.*power|inverter|shorestrøm|batteriovervåg|batterimonitor|DC.*DC)\b/i],
    subcategories: [
      { name: 'Belysning',           patterns: [/belysning|LED.*lys(?!.*nav)/i] },
      { name: 'Lanterner',           patterns: [/lanterne|navigationslys|ankerlys|toplys/i] },
      { name: 'Pære',                patterns: [/\bpære\b/i] },
      { name: 'Projektører',         patterns: [/projektør|søgelys/i] },
      { name: 'Dækslys',             patterns: [/dækslys/i] },
      { name: 'Sikringer',           patterns: [/sikring|sikringsautomat|smeltesikring/i] },
      { name: 'Kontakter',           patterns: [/kontakt(?!.*service)/i] },
      { name: 'El-panel',            patterns: [/el.?panel|fordelingspanel|elfordeling/i] },
      { name: 'Hovedafbryder',       patterns: [/hovedafbryder|batteriafbryder|batterikobler/i] },
      { name: 'El-udtag',            patterns: [/el.?udtag|strøm.*udtag|12v.*udtag|USB.*udtag/i] },
      { name: 'Ledninger & Kabler',  patterns: [/ledning|kabel(?!.*nav)/i] },
      { name: 'Landstrøm',           patterns: [/landstrøm|shore.*power|shorestrøm/i] },
      { name: 'Lamper',              patterns: [/lampe\b/i] },
      { name: 'Batterier',           patterns: [/AGM|lithium.*batteri|gel.*batteri|\bbatteri\b(?!.*lader)/i] },
      { name: 'Lader',               patterns: [/batterilader|oplader|lader\b/i] },
      { name: 'Solceller & paneler', patterns: [/solcelle|solpanel|solar/i] },
    ],
  },

  // 12 ────────────────────────────────────────────────────────────────────────
  {
    name: 'Vand & Sanitet',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(marin.*toilet|jabsco|thetford|septiktank|holdingtank|vandtank|varmvandsbeholder|bilgepumpe|lænsepumpe|dykpumpe|vandpumpe|trykvandspumpe|vandslange|vandfilter|watermaker|osmoseanlæg|Tru.?Design|vandhan|seacock|dækspåfyldning|vandpåfyldning)\b/i],
    subcategories: [
      { name: 'Toiletter',         patterns: [/toilet|WC\b|jabsco.*toilet|thetford/i] },
      { name: 'Varmvandsbeholder', patterns: [/varmvandsbeholder|varmtvandsbeholder|vandvarmer/i] },
      { name: 'Fittings',          patterns: [/fitting|rørfitting|seacock/i] },
      { name: 'Pumper',            patterns: [/bilgepumpe|lænsepumpe|vandpumpe|trykvandspumpe|dykpumpe/i] },
      { name: 'Slanger',           patterns: [/vandslange|sanitetslange/i] },
      { name: 'Septiktank',        patterns: [/septiktank|holdingtank/i] },
      { name: 'Vandtanke',         patterns: [/vandtank/i] },
      { name: 'Vedligeholdelse',   patterns: [/toilet.*service|wc.*rens|sanitetsrens/i] },
      { name: 'Varme',             patterns: [/varme(?!.*vand)|diesel.*varme|webasto|eberspächer/i] },
      { name: 'Ventilation',       patterns: [/ventilat|udluftning/i] },
      { name: 'Vandhaner',         patterns: [/vandhan|blandingsbatteri|drejehane/i] },
      { name: 'Dæksler',           patterns: [/dæksl(?!ys)|inspektionsdæksel/i] },
      { name: 'Tru-Design',        patterns: [/Tru.?Design/i] },
      { name: 'Instrumenter',      patterns: [/vandmåler|tankindikator|flowmåler/i] },
    ],
  },

  // 13 ────────────────────────────────────────────────────────────────────────
  {
    name: 'Bådpleje & vedligeholdelse',
    defaultBoatTypes: ['sejlbåd', 'motorbåd'],
    patterns: [/\b(antifouling|bundmaling|selvpoler|selvslibende|eroderende|bundrepar|epoxy.*båd|gelcoat|lakk?(?:er|ering)?|poler(?:ing|ingsmid|ér)?|polermid|pudsemid|polerpasta|klargøring|malergrej|båd.*pensel|rulle.*maling|fugtfjerner|pressening|kaleche|rengøringsmid|rengøringsprodukt|plejemid(?!.*motor)|voks(?:ning)?|wax\b|teakolie|teak.*olie|rustbeskyt|antirust|zinkspray)\b/i],
    subcategories: [
      { name: 'Maling',              patterns: [/antifouling|bundmaling|primer|maling(?!sgrej)/i] },
      { name: 'Lakker',              patterns: [/lakk/i] },
      { name: 'Reparationer',        patterns: [/bundrepar|epoxy|gelcoat|repar/i] },
      { name: 'Polering',            patterns: [/poler|pudsemid|polerpasta|polermid/i] },
      { name: 'Malergrej & værktøj', patterns: [/malergrej|pensel|rulle.*maling|malerrulle/i] },
      { name: 'Fugtfjerner',         patterns: [/fugtfjern/i] },
      { name: 'Kaleche, Pressening', patterns: [/pressening|kaleche/i] },
      { name: 'Tape',                patterns: [/\btape\b/i] },
      { name: 'Rengøringsartikler',  patterns: [/rengøringsmid|rengøringsprodukt|skrubber/i] },
      { name: 'Div. Plejemidler',    patterns: [/plejemid|voks|wax|teakolie|teak.*olie|rustbeskyt/i] },
    ],
  },
]

// ── Core assignment function ──────────────────────────────────────────────────

export function assignProductCategory(name: string): {
  category:    string | null
  subcategory: string | null
  boatType:    BoatType[]
} {
  const lc = name.toLowerCase()

  for (const cat of CATEGORIES) {
    if (!cat.patterns.some(p => p.test(lc))) continue

    // Find subcategory
    let subcategory: string | null = null
    for (const sub of cat.subcategories) {
      if (sub.patterns.some(p => p.test(lc))) { subcategory = sub.name; break }
    }

    // Determine boat type from name keywords, fallback to category default
    const hasSail  = SAIL_KW.test(lc)
    const hasMotor = MOTOR_KW.test(lc)
    let boatType: BoatType[]
    if      (hasSail && hasMotor) boatType = ['sejlbåd', 'motorbåd']
    else if (hasSail)             boatType = ['sejlbåd']
    else if (hasMotor)            boatType = ['motorbåd']
    else                          boatType = [...cat.defaultBoatTypes]

    return { category: cat.name, subcategory, boatType }
  }

  return { category: null, subcategory: null, boatType: ['sejlbåd', 'motorbåd'] }
}

// ── Category list helpers (for UI) ───────────────────────────────────────────

export const CATEGORY_NAMES = CATEGORIES.map(c => c.name)

export function getSubcategories(categoryName: string): string[] {
  return CATEGORIES.find(c => c.name === categoryName)?.subcategories.map(s => s.name) ?? []
}

// ── Legacy helpers (used by pipeline step 1: product_types.our_category) ─────

export function normalizeCategory(cat: string): string {
  const lc = cat.toLowerCase().trim()
  for (const c of CATEGORIES) {
    if (c.name.toLowerCase() === lc) return c.name
    if (c.patterns.some(p => p.test(lc))) return c.name
  }
  for (const c of CATEGORIES) {
    const words = c.name.toLowerCase().split(/\W+/).filter(w => w.length >= 4)
    if (words.some(w => lc.includes(w))) return c.name
  }
  return cat
}

export function buildDedupeMap(categories: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const cat of categories) {
    const normalized = normalizeCategory(cat)
    if (normalized !== cat) result.set(cat, normalized)
  }
  return result
}
