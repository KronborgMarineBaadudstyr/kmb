-- 047: Add image_url and description to categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_url   text,
  ADD COLUMN IF NOT EXISTS description text;

-- Seed AI-generated Danish descriptions for existing categories
UPDATE categories SET description = CASE name
  WHEN 'Sko/støvler'        THEN 'Vandtætte og slidstærke sko og støvler til søfolk og bådentusiaster. Fra lette dækssko til varme vinterstøvler — beskyttelse og komfort uanset vejret på vandet.'
  WHEN 'Sejlertøj'          THEN 'Teknisk beklædning til sejlads og livet på vandet. Vandtætte jakker, sejlerbukser, termoundertøj og fleece — lavet til at holde dig varm og tør i alle vejrforhold.'
  WHEN 'Sikkerhed'          THEN 'Sikkerhedsudstyr der kan redde liv til søs. Redningsveste, sikkerhedsseler, nødblus, mand-over-bord udstyr og alt hvad der hører til en forsvarlig sikkerhedsplan om bord.'
  WHEN 'Gaveartikler'       THEN 'Unikke gaver til søfolk og bådentusiaster. Fra praktiske sømandsartikler til dekorative marinetema-varer — find den perfekte gave til den maritime person i dit liv.'
  WHEN 'Vandsport'          THEN 'Udstyr til vandsport og rekreative aktiviteter på vandet. SUP-boards, kajakker, dykkermateriel, snorkel og alt hvad der giver dig de bedste oplevelser på og under vandoverfladen.'
  WHEN 'Komfort ombord'     THEN 'Produkter der gør livet om bord mere behageligt. Puder, tæpper, belysning, ventilation og interiørdetaljer der forvandler bådens kabys og kahyt til et hyggeligt hjem på vandet.'
  WHEN 'Tovværk & Anker'    THEN 'Ankre, ankerkæder, tovværk og fortøjningsudstyr i høj kvalitet. Alt hvad du behøver for at holde båden sikkert forankret og manøvrere effektivt i havn og på reden.'
  WHEN 'Rig & Dæk'          THEN 'Rigningsgrej, sejltilbehør og dæksudstyr til sejlbåde. Blokke, klamper, stag, puller og alt andet hardware der hører til rig og dæk — fra rekvisitter til komplet omrigning.'
  WHEN 'Elektronik og Navigation' THEN 'Navigationsinstrumenter, chartplottere, AIS, VHF-radioer og elektronik til den moderne båd. Præcis navigation og kommunikation til søs — teknologi der holder dig på rette kurs.'
  WHEN 'Motor & Olie'       THEN 'Reservedele, smøremidler, filtre og tilbehør til både indbords- og påhængsmotorer. Hold din motor i top med de rigtige produkter til vedligeholdelse og reparation.'
  WHEN 'El & installationer' THEN 'Elektrisk udstyr, kabler, stik og installeringsmaterialer til marine-brug. Sikker og pålidelig strøm om bord — fra batterier og ladere til komplet eludstyr til maritime miljøer.'
  WHEN 'Vand & Sanitet'     THEN 'Vandsystemer, pumper, toiletter og sanitetsudstyr til båden. Ferskvandssystemer, spildevandshåndtering og komfortabelt sanitetsgrej der gør livet om bord nemmere og mere hygiejnisk.'
  WHEN 'Bådpleje & vedligeholdelse' THEN 'Bundmaling, polermidler, rengøringsmidler og vedligeholdelsesprodukter til båden. Hold din båd i perfekt stand med professionelle produkter til beskyttelse af skrog, dæk og interiør.'
  ELSE description
END
WHERE description IS NULL;
