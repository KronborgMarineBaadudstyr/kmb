-- Migration 044: categories tabel — erstatter hardcodet standard-categories.ts
-- Gemmer de 13 kategorier + underkategorier i DB så de kan CRUD'es fra admin

CREATE TABLE IF NOT EXISTS categories (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  subcategories jsonb       NOT NULL DEFAULT '[]',
  -- [{"name": "Sejlersko", "keywords": ["sejlersko","dækssko"]}]
  keywords      text[]      NOT NULL DEFAULT '{}',
  boat_types    text[]      NOT NULL DEFAULT '{"sejlbåd","motorbåd"}',
  sort_order    int         NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_name        ON categories (name);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order  ON categories (sort_order);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seed: de 13 kategorier fra standard-categories.ts ───────────────────────

INSERT INTO categories (name, subcategories, keywords, boat_types, sort_order) VALUES

('Sko/støvler',
 '[{"name":"Sejlersko","keywords":["sejlersko","bådsko","dækssko"]},{"name":"Gummistøvler","keywords":["gummistøvl"]},{"name":"Dækssko","keywords":["dækssko"]},{"name":"Sandaler","keywords":["sandal"]}]'::jsonb,
 ARRAY['sejlersko','dækssko','bådsko','gummistøvl','sejlerstøvl','vandsko'],
 ARRAY['sejlbåd','motorbåd'], 1),

('Sejlertøj',
 '[{"name":"Jakker & regntøj","keywords":["jakke","regnjakke","foulweather","offshore"]},{"name":"Bukser","keywords":["bukser","sejlerbukser"]},{"name":"Handsker","keywords":["handsk"]},{"name":"Hatte & huer","keywords":["hat","hue","kasket"]},{"name":"Mellemlag & fleece","keywords":["fleece","midterlag","mellemlag"]},{"name":"Badetøj & UV","keywords":["badetøj","uv-shirt","uv-trøje"]}]'::jsonb,
 ARRAY['sejlerjakke','regnjakke','sejlerbukser','offshore','foulweather','flydedrag','sejlerhandsk','sejlervest'],
 ARRAY['sejlbåd','motorbåd'], 2),

('Sikkerhed',
 '[{"name":"Redningsveste","keywords":["redningsvest","flydevest"]},{"name":"Pyroteknik","keywords":["pyroteknik","nødraket","signalraket","røgbombe"]},{"name":"Brandslukker","keywords":["brandslukker"]},{"name":"MOB-udstyr","keywords":["MOB","man overbord"]},{"name":"EPIRB & PLB","keywords":["EPIRB","PLB","nødsender"]},{"name":"Sikkerhedsseler","keywords":["sikkerhedssele"]},{"name":"Kastering","keywords":["kastering","redningskrans","redningsring"]},{"name":"Livline & sikkerhedsnet","keywords":["livline","sikkerhedsnet"]}]'::jsonb,
 ARRAY['redningsvest','flydevest','pyroteknik','nødraket','brandslukker','MOB','EPIRB','PLB','sikkerhedssele','livline','kastering','liferaft','redningsflåde'],
 ARRAY['sejlbåd','motorbåd'], 3),

('Gaveartikler',
 '[{"name":"Skibsklokker","keywords":["skibsklokke"]},{"name":"Ure","keywords":["ur"]},{"name":"Søkort","keywords":["søkort"]},{"name":"Teak artikler","keywords":["teak artikel","teak gave"]},{"name":"Olielamper","keywords":["olielampe"]},{"name":"Sengetøj","keywords":["sengetøj","dyne"]},{"name":"Messing artikler","keywords":["messing"]},{"name":"Cykler","keywords":["cykel","foldecykel"]},{"name":"Nøgleringe","keywords":["nøglering"]},{"name":"Bøger","keywords":["bog","bøger"]},{"name":"Væger","keywords":["væger"]}]'::jsonb,
 ARRAY['skibsklokke','olielampe','messing','teak','nøglering','skibsmodel','bådmodel','nautisk dekoration'],
 ARRAY['sejlbåd','motorbåd'], 4),

('Vandsport',
 '[{"name":"Gummibåd","keywords":["gummibåd","oppustelig båd"]},{"name":"SUP","keywords":["SUP","paddleboard","standup paddle"]},{"name":"Våddragter","keywords":["våddragt","wetsuit"]},{"name":"Tubes","keywords":["tube","tubes"]},{"name":"Vandski","keywords":["vandski","wakeboard"]},{"name":"Tørdragter","keywords":["tørdragt","drysuit"]},{"name":"Tilbehør","keywords":["snorkel","dykke","svømmefødder","flipper"]}]'::jsonb,
 ARRAY['gummibåd','SUP','paddleboard','våddragt','tørdragt','tube','vandski','wakeboard','snorkel'],
 ARRAY['sejlbåd','motorbåd'], 5),

('Komfort ombord',
 '[{"name":"Køleskab & køleboks","keywords":["køleskab","køleboks"]},{"name":"Komfur","keywords":["komfur","gaskoger","kogeblus"]},{"name":"Gas ombord","keywords":["gas","gasflaske","gasanlæg"]},{"name":"Vaske","keywords":["vask","pantryvaske"]},{"name":"Flag m.m.","keywords":["flag","vimpel","stander"]},{"name":"Grill","keywords":["grill"]},{"name":"Hynder","keywords":["hynde","polstring"]},{"name":"Solsejl","keywords":["solsejl","bimini"]},{"name":"Opbevaring","keywords":["opbevaring","net","stuvning"]},{"name":"Stole & borde","keywords":["stol","bord"]},{"name":"Sengetøj, Puder m.m.","keywords":["sengetøj","pude","dyne","sovepose"]}]'::jsonb,
 ARRAY['køleskab','køleboks','komfur','gaskoger','gasgrill','hynde','cockpithynde','solsejl','bimini','skibsflag','sengetøj'],
 ARRAY['sejlbåd','motorbåd'], 6),

('Tovværk & Anker',
 '[{"name":"Tov","keywords":["polyester tov","nylon tov","dobbeltflettet","flydeline"]},{"name":"Fortøjning","keywords":["fortøjning"]},{"name":"Taklegarn","keywords":["taklegarn"]},{"name":"Sjækler","keywords":["sjækel"]},{"name":"Splejsegrej","keywords":["splejse"]},{"name":"Elastik","keywords":["elastik","bungee"]},{"name":"Tov hamp","keywords":["hamp","hampetov"]},{"name":"Fald","keywords":["fald"]},{"name":"Skøde","keywords":["skøde"]},{"name":"Fenderline","keywords":["fenderline","fendertov"]},{"name":"Blytov","keywords":["blytov","lodline"]},{"name":"Anker","keywords":["anker","CQR","delta anker","plov anker"]},{"name":"Kæde","keywords":["kæde","ankerkæde"]}]'::jsonb,
 ARRAY['fortøjningstov','fortøjningsline','polyester','nylon tov','taklegarn','sjækel','splejse','fald','skøde','fenderline','anker','ankerkæde'],
 ARRAY['sejlbåd','motorbåd'], 7),

('Rig & Dæk',
 '[{"name":"Hængsler og Beslag","keywords":["hængsel","beslag"]},{"name":"Blokke","keywords":["blok","blokke"]},{"name":"Aflaster","keywords":["aflaster","clutch"]},{"name":"Klamper & klyds","keywords":["klampe","klyds"]},{"name":"Spil","keywords":["spil","winch"]},{"name":"Ankerspil","keywords":["ankerspil","vindespil"]},{"name":"Skødvogne & skinner","keywords":["skødvogn","travervogn"]},{"name":"Håndlister","keywords":["håndliste"]},{"name":"Badestiger","keywords":["badestige"]},{"name":"Bade & stævnplatform","keywords":["badeplatform","stævnplatform"]},{"name":"Teak dæk","keywords":["teak dæk"]},{"name":"Luger & skylight","keywords":["luge","skylight"]},{"name":"Fender","keywords":["fender"]},{"name":"Gasfjedre","keywords":["gasfjedr","gasfjeder"]}]'::jsonb,
 ARRAY['blok','klampe','klyds','spil','winch','skødvogn','håndliste','pulpit','badestige','badeplatform','teak dæk','luge','fender','gasfjedr','ankerspil'],
 ARRAY['sejlbåd'], 8),

('Elektronik og Navigation',
 '[{"name":"GPS","keywords":["GPS","chartplotter","plotter"]},{"name":"Ekkolod","keywords":["ekkolod"]},{"name":"Fishfinder","keywords":["fishfinder"]},{"name":"Vindmåler","keywords":["vindmåler","vindgiver","anemometer"]},{"name":"VHF & AIS","keywords":["VHF","AIS","marifon","DSC"]},{"name":"Antenner","keywords":["antenne"]},{"name":"Autopilot","keywords":["autopilot"]},{"name":"Søkort","keywords":["søkort"]},{"name":"Kikkerter","keywords":["kikkert"]},{"name":"Stereo","keywords":["stereo","højttal"]},{"name":"Radar","keywords":["radar"]},{"name":"Tilbehør m.m.","keywords":[]}]'::jsonb,
 ARRAY['chartplotter','GPS','ekkolod','fishfinder','vindmåler','VHF','AIS','marifon','radar','autopilot','transducer','søkort','kikkert'],
 ARRAY['sejlbåd','motorbåd'], 9),

('Motor & Olie',
 '[{"name":"Olieprodukter","keywords":["olie","fedt"]},{"name":"Zink","keywords":["zink"]},{"name":"Filtre","keywords":["filter","motorfilter","brændstoffilter","oliefilter"]},{"name":"Impeller","keywords":["impeller"]},{"name":"Brændstoftanke","keywords":["brændstoftank","benzintank","dieseltank"]},{"name":"Reservedele indenbordsmotor","keywords":["indbords del","reservedel indbords"]},{"name":"Reservedele udenbordsmotor","keywords":["udenbords del","reservedel udenbords"]},{"name":"El-motor","keywords":["el-motor","elektrisk motor"]},{"name":"Brændstofslanger","keywords":["brændstofslange"]},{"name":"Motorbeslag","keywords":["motorbeslag"]},{"name":"Styringer","keywords":["styring","rorlinke"]},{"name":"Rat","keywords":["rat"]},{"name":"Bovtruster","keywords":["bovtruster","hæktruster","truster"]}]'::jsonb,
 ARRAY['motorolie','geárolie','2-takt','4-takt','impeller','zinkanode','brændstoftank','brændstoffilter','udenbords','indbords','propel','gearkasse','bovtruster','hæktruster'],
 ARRAY['motorbåd'], 10),

('El & installationer',
 '[{"name":"Belysning","keywords":["belysning","LED lys"]},{"name":"Lanterner","keywords":["lanterne","navigationslys","ankerlys","toplys"]},{"name":"Pære","keywords":["pære"]},{"name":"Projektører","keywords":["projektør","søgelys"]},{"name":"Dækslys","keywords":["dækslys"]},{"name":"Sikringer","keywords":["sikring","smeltesikring"]},{"name":"Kontakter","keywords":["kontakt"]},{"name":"El-panel","keywords":["el-panel","fordelingspanel"]},{"name":"Hovedafbryder","keywords":["hovedafbryder","batteriafbryder"]},{"name":"Ledninger & Kabler","keywords":["ledning","kabel"]},{"name":"Landstrøm","keywords":["landstrøm","shore power"]},{"name":"Batterier","keywords":["AGM","lithium batteri","gel batteri","batteri"]},{"name":"Lader","keywords":["batterilader","oplader"]},{"name":"Solceller & paneler","keywords":["solcelle","solpanel","solar"]}]'::jsonb,
 ARRAY['AGM batteri','gel batteri','lithium batteri','batterilader','solcelle','solpanel','LED','navigationslys','lanterne','el-panel','landstrøm','inverter','shore power'],
 ARRAY['sejlbåd','motorbåd'], 11),

('Vand & Sanitet',
 '[{"name":"Toiletter","keywords":["toilet","jabsco","thetford"]},{"name":"Varmvandsbeholder","keywords":["varmvandsbeholder","vandvarmer"]},{"name":"Fittings","keywords":["fitting","seacock"]},{"name":"Pumper","keywords":["bilgepumpe","lænsepumpe","vandpumpe","dykpumpe"]},{"name":"Slanger","keywords":["vandslange","sanitetslange"]},{"name":"Septiktank","keywords":["septiktank","holdingtank"]},{"name":"Vandtanke","keywords":["vandtank"]},{"name":"Varme","keywords":["varme","diesel varme","webasto","eberspächer"]},{"name":"Ventilation","keywords":["ventilation","udluftning"]},{"name":"Vandhaner","keywords":["vandhan","blandingsbatteri"]},{"name":"Tru-Design","keywords":["Tru-Design"]}]'::jsonb,
 ARRAY['toilet','jabsco','thetford','septiktank','holdingtank','vandtank','varmvandsbeholder','bilgepumpe','lænsepumpe','vandpumpe','watermaker','osmoseanlæg'],
 ARRAY['sejlbåd','motorbåd'], 12),

('Bådpleje & vedligeholdelse',
 '[{"name":"Maling","keywords":["antifouling","bundmaling","primer","maling"]},{"name":"Lakker","keywords":["lak","lakering"]},{"name":"Reparationer","keywords":["bundrepar","epoxy","gelcoat","repar"]},{"name":"Polering","keywords":["poler","pudsemid","polerpasta"]},{"name":"Malergrej & værktøj","keywords":["malergrej","pensel","malerrulle"]},{"name":"Fugtfjerner","keywords":["fugtfjerner"]},{"name":"Kaleche, Pressening","keywords":["pressening","kaleche"]},{"name":"Tape","keywords":["tape"]},{"name":"Rengøringsartikler","keywords":["rengøringsmid","rengøringsprodukt"]},{"name":"Div. Plejemidler","keywords":["plejemid","voks","wax","teakolie","rustbeskyttelse"]}]'::jsonb,
 ARRAY['antifouling','bundmaling','selvpoler','selvslibende','epoxy','gelcoat','poler','polermid','klargøring','fugtfjerner','pressening','kaleche','rengøringsmid','voks','teakolie'],
 ARRAY['sejlbåd','motorbåd'], 13)

ON CONFLICT (name) DO NOTHING;
