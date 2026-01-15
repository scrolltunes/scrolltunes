//! Shared normalization functions for LRCLIB-Spotify matching.
//! Used by both lrclib-extract and normalize-spotify binaries.
//!
//! CRITICAL: Any changes here affect both binaries. Run tests after changes.

use any_ascii::any_ascii;
use once_cell::sync::Lazy;
use regex::Regex;
use rustc_hash::FxHashMap;
use unicode_normalization::UnicodeNormalization;

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/// Title cleanup patterns (applied in order).
pub static TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        // Remaster variants: "- Remastered 2021", "(2021 Remaster)", "/ 1997 Remastered"
        Regex::new(r"(?i)\s*[-–—/]\s*(?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)[\)\]]").unwrap(),
        // Live/acoustic: "(Live at Wembley)", "- Acoustic Version"
        Regex::new(r"(?i)\s*[\(\[](?:live(?:\s+(?:at|from|in)\s+[^)\]]+)?|acoustic(?:\s+version)?|unplugged)[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[-–—]\s*(?:live(?:\s+(?:at|from|in)\s+.+)?|acoustic(?:\s+version)?)").unwrap(),
        // Edition variants: "(Deluxe Edition)", "[Super Deluxe]"
        Regex::new(r"(?i)\s*[\(\[](?:deluxe|super\s+deluxe|expanded|anniversary|bonus\s+track(?:s)?|special|collector'?s?)(?:\s+edition)?[\)\]]").unwrap(),
        // Mix/version variants: "(Radio Edit)", "[Album Version]", "(Mono)", "(Stereo)"
        Regex::new(r"(?i)\s*[\(\[](?:radio\s+edit|single\s+version|album\s+version|extended(?:\s+(?:mix|version))?|original\s+mix|mono|stereo)[\)\]]").unwrap(),
        // Content variants: "(Explicit)", "[Clean]", "(Instrumental)"
        Regex::new(r"(?i)\s*[\(\[](?:explicit|clean|censored|instrumental|karaoke)[\)\]]").unwrap(),
        // Recording variants: "(Demo)", "[Alternate Take]", "(Outtake)"
        Regex::new(r"(?i)\s*[\(\[](?:demo(?:\s+version)?|alternate(?:\s+(?:take|version))?|outtake|take\s*\d+)[\)\]]").unwrap(),
        // Year suffix: "- 2021", "- 1997 Version"
        Regex::new(r"(?i)\s*[-–—]\s*\d{4}(?:\s+(?:version|mix|edit))?$").unwrap(),
        // Featured artists: "(feat. Artist)", "[ft. Someone]"
        Regex::new(r"(?i)\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+[^)\]]+[\)\]]").unwrap(),
        // Speed variants: "(Sped Up)", "(Slowed)", "(Slowed + Reverb)"
        Regex::new(r"(?i)\s*[\(\[](?:sped\s+up|slowed(?:\s*\+\s*reverb)?|nightcore|daycore)[\)\]]").unwrap(),
        // Rework variants: "(Reworked)", "(Redux)", "(Re-recorded)"
        Regex::new(r"(?i)\s*[\(\[](?:reworked?|redux|re-?recorded|reimagined)[\)\]]").unwrap(),
        // Version numbers: "(2)", "(Version 2)", "[V2]"
        Regex::new(r"(?i)\s*[\(\[](?:v(?:ersion)?\s*)?\d[\)\]]").unwrap(),
        // Dash format for mono/stereo/version: "- Mono", "- Stereo / 2021 Remaster"
        Regex::new(r"(?i)\s*[-–—]\s*(?:mono|stereo)(?:\s*/\s*\d{4}\s*remaster(?:ed)?)?").unwrap(),
        // Feat without brackets: "Song feat. Artist", "Song ft. Someone"
        Regex::new(r"(?i)\s+(?:feat\.?|ft\.?|featuring)\s+.+$").unwrap(),
        // URL suffixes: "Song - SongsLover.com", "Track_Artist.mp3.com"
        Regex::new(r"(?i)\s*[-–—_]?\s*[a-z0-9]+\.(?:com|net|org|io|ru|de|fr|es|co\.uk)").unwrap(),
        // Visualizer/commentary tags: "(Visualiser)", "(Lyric Video)", "(comentario)"
        Regex::new(r"(?i)\s*[\(\[](?:visuali[sz]er|lyric\s*video|official\s*video|audio|comentario|commentary)[\)\]]").unwrap(),
        // Additional suffix patterns identified from failure analysis (Jan 2026)
        // Digital remaster with year: "- 2001 Digital Remaster"
        Regex::new(r"(?i)\s*[-–—]\s*\d{4}\s+digital\s+remaster(?:ed)?\s*$").unwrap(),
        // Disc/CD markers: "(Disc 1)", "[CD 2]"
        Regex::new(r"(?i)\s*[\(\[](?:disc|cd)\s*\d+[\)\]]").unwrap(),
        // Single/LP version with dash: "- Single Version", "- LP Version"
        Regex::new(r#"(?i)\s*[-–—]\s*(?:single|lp|7["']?|12["']?)\s+version\s*$"#).unwrap(),
        // Bonus track markers: "(Bonus Track)", "[Bonus]"
        Regex::new(r"(?i)\s*[\(\[](?:bonus(?:\s+track)?|hidden\s+track)[\)\]]").unwrap(),
        // From soundtrack/movie: "(From Movie Soundtrack)", "(from The Album)"
        Regex::new(r"(?i)\s*[\(\[]from\s+[^)\]]+[\)\]]").unwrap(),
        // UK/US mix: "(UK Mix)", "[US Version]"
        Regex::new(r"(?i)\s*[\(\[](?:uk|us|usa|original)\s+(?:mix|version|edit)[\)\]]").unwrap(),
        // Remix artist attribution: "(Artist Remix)", "- DJ Remix"
        Regex::new(r"(?i)\s*[-–—]\s*[a-z0-9\s]+\s+(?:remix|mix|edit)\s*$").unwrap(),
        // Session/take info: "(BBC Session)", "[Peel Session]", "(Take 1)"
        Regex::new(r"(?i)\s*[\(\[](?:[a-z]+\s+)?(?:session|sessions|take\s*\d+)[\)\]]").unwrap(),
        // Tour/concert year: "(Live 2019)", "[Concert 2021]"
        Regex::new(r"(?i)\s*[\(\[](?:live|concert|tour)(?:\s+\d{4})?[\)\]]").unwrap(),
        // Parenthetical prod credits: "(Prod. by Someone)"
        Regex::new(r"(?i)\s*[\(\[]prod\.?\s+(?:by\s+)?[^)\]]+[\)\]]").unwrap(),
        // Copyright free/no copyright markers
        Regex::new(r"(?i)\s*[\(\[](?:copyright\s+free|no\s+copyright|royalty\s+free)[\)\]]").unwrap(),
        // Music video markers with year: "(Official Music Video 2023)"
        Regex::new(r"(?i)\s*[\(\[](?:official\s+)?music\s+video(?:\s+\d{4})?[\)\]]").unwrap(),
    ]
});

/// Matches track number prefixes like "03 - ", "Track 5 - ", "01. ", etc.
pub static TRACK_NUMBER_PREFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-–—._]\s*").unwrap()
);

/// Matches track number prefix without separator: "16 Eleanor Rigby" → "Eleanor Rigby"
/// Only matches 1-2 digit numbers (1-99) to avoid false positives like "1970 Somethin'"
/// Pattern: 01-09 or 1-99 followed by space and uppercase letter.
pub static TRACK_NUMBER_SPACE_PREFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"^(?:0[1-9]|[1-9]\d?)\s+([A-Z])").unwrap()
);

/// Matches track number in brackets: "[01] Song", "[12] Title"
pub static TRACK_NUMBER_BRACKET: Lazy<Regex> = Lazy::new(||
    Regex::new(r"^\[\d{1,2}\]\s*").unwrap()
);

/// Matches "Artist - Title" format where track number precedes artist
/// e.g., "117.任贤齐 - 小狼狗" → "小狼狗" (when processed with artist context)
pub static TRACK_ARTIST_TITLE: Lazy<Regex> = Lazy::new(||
    Regex::new(r"^\d{1,3}\.\s*[^-–—]+\s*[-–—]\s*").unwrap()
);

/// Matches mojibake replacement characters at end of string
pub static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"[\u{FFFD}]+$").unwrap()
);

/// Matches bracket suffixes like [Mono], [RM1], [take 2], [Live], etc.
pub static BRACKET_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"\s*\[[^\]]+\]\s*$").unwrap()
);

/// Matches file extensions in titles
pub static FILE_EXTENSION: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)\.(flac|mp3|wav|m4a|ogg|aac)$").unwrap()
);

/// Matches year suffix like (1964), (2009), etc.
pub static YEAR_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"\s*\(\d{4}\)\s*$").unwrap()
);

/// Artist cleanup patterns
pub static ARTIST_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s+(?:feat\.?|ft\.?|featuring|with|&|,|;|/)\s+.*").unwrap(),
        Regex::new(r"(?i)\s+(?:band|orchestra|ensemble|quartet|trio)$").unwrap(),
    ]
});

/// Multi-artist separator pattern for extracting primary artist.
/// Matches: &, /, ,, •, +, x, vs, and, with, feat, ft
pub static ARTIST_SEPARATOR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\s*(?:[&/,•+×]|(?:\s+(?:x|vs\.?|and|with|feat\.?|ft\.?)\s+))\s*").unwrap()
});

/// Regex to collapse multiple whitespace into single space
pub static MULTI_SPACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s{2,}").unwrap());

// ============================================================================
// ARTIST TRANSLITERATIONS
// ============================================================================

/// Cyrillic/Hebrew to Latin artist name mappings for deduplication.
/// Used for cross-script matching where automatic transliteration fails.
pub static ARTIST_TRANSLITERATIONS: Lazy<FxHashMap<&str, &str>> = Lazy::new(|| {
    let mut m = FxHashMap::default();

    // === RUSSIAN ARTISTS ===
    // Top rock bands
    m.insert("ддт", "ddt");
    m.insert("кино", "kino");
    m.insert("аквариум", "aquarium");
    m.insert("ария", "aria");
    m.insert("алиса", "alisa");
    m.insert("сплин", "splean");
    m.insert("мумий тролль", "mumiy troll");
    m.insert("би-2", "bi-2");
    m.insert("би2", "bi-2");
    m.insert("земфира", "zemfira");
    m.insert("ленинград", "leningrad");
    m.insert("король и шут", "korol i shut");
    m.insert("киш", "korol i shut");
    m.insert("машина времени", "mashina vremeni");
    m.insert("наутилус помпилиус", "nautilus pompilius");
    m.insert("пикник", "piknik");
    m.insert("секрет", "sekret");
    m.insert("чайф", "chaif");
    m.insert("агата кристи", "agata kristi");
    m.insert("любэ", "lyube");
    m.insert("сектор газа", "sektor gaza");
    m.insert("браво", "bravo");
    m.insert("гражданская оборона", "grazhdanskaya oborona");
    m.insert("ногу свело", "nogu svelo");
    m.insert("ночные снайперы", "nochnye snaipery");
    m.insert("крематорий", "krematorij");
    m.insert("смысловые галлюцинации", "smyslovye gallyutsinatsii");
    m.insert("чиж", "chizh");
    m.insert("чиж и ко", "chizh");
    m.insert("звери", "zveri");
    m.insert("танцы минус", "tantsy minus");
    m.insert("ундервуд", "undervud");
    m.insert("пилот", "pilot");
    m.insert("lumen", "lumen");
    m.insert("люмен", "lumen");
    m.insert("кипелов", "kipelov");
    m.insert("серьга", "serga");
    m.insert("город 312", "gorod 312");
    m.insert("ума турман", "uma2rman");
    // Solo artists
    m.insert("виктор цой", "viktor tsoi");
    m.insert("борис гребенщиков", "boris grebenshchikov");
    m.insert("юрий шевчук", "yuri shevchuk");
    m.insert("диана арбенина", "diana arbenina");
    m.insert("валерий кипелов", "valery kipelov");
    m.insert("константин кинчев", "konstantin kinchev");
    m.insert("вячеслав бутусов", "vyacheslav butusov");
    m.insert("андрей макаревич", "andrey makarevich");
    // Pop artists
    m.insert("филипп киркоров", "philipp kirkorov");
    m.insert("алла пугачева", "alla pugacheva");
    m.insert("валерия", "valeria");
    m.insert("дима билан", "dima bilan");
    m.insert("полина гагарина", "polina gagarina");
    m.insert("сергей лазарев", "sergey lazarev");
    m.insert("тимати", "timati");
    m.insert("баста", "basta");
    m.insert("егор крид", "egor kreed");
    m.insert("макс корж", "max korzh");
    m.insert("мот", "mot");
    m.insert("jah khalib", "jah khalib");
    m.insert("джах халиб", "jah khalib");
    m.insert("монатик", "monatik");
    m.insert("нюша", "nyusha");
    m.insert("елка", "elka");
    m.insert("ёлка", "elka");
    m.insert("loboda", "loboda");
    m.insert("лобода", "loboda");
    m.insert("светлана лобода", "loboda");
    m.insert("zivert", "zivert");
    m.insert("зиверт", "zivert");
    m.insert("клава кока", "klava koka");
    m.insert("инстасамка", "instasamka");
    m.insert("miyagi", "miyagi");
    m.insert("мияги", "miyagi");
    m.insert("хаски", "husky");
    m.insert("oxxxymiron", "oxxxymiron");
    m.insert("оксимирон", "oxxxymiron");
    m.insert("face", "face");
    m.insert("фейс", "face");
    m.insert("morgenshtern", "morgenshtern");
    m.insert("моргенштерн", "morgenshtern");
    m.insert("little big", "little big");
    m.insert("литл биг", "little big");
    m.insert("ic3peak", "ic3peak");
    m.insert("molchat doma", "molchat doma");
    m.insert("молчат дома", "molchat doma");

    // === ISRAELI/HEBREW ARTISTS ===
    // Bands
    m.insert("היהודים", "hayehudim");
    m.insert("משינה", "mashina");
    m.insert("אתניקס", "ethnix");
    m.insert("כוורת", "kaveret");
    m.insert("טיפקס", "tipex");
    m.insert("הדג נחש", "hadag nahash");
    m.insert("הדורבנים", "hadorbanim");
    m.insert("מוניקה סקס", "monica sex");
    m.insert("בום פאם", "boom pam");
    m.insert("ימן בלוז", "yemen blues");
    m.insert("שבק ס", "shabak samech");
    m.insert("תיסלם", "teapacks");
    m.insert("בנות נחש", "bnot nechash");
    m.insert("מרסדס בנד", "mercedes band");
    // Solo artists - classic
    m.insert("שלום חנוך", "shalom hanoch");
    m.insert("אריק איינשטיין", "arik einstein");
    m.insert("עידן רייכל", "idan raichel");
    m.insert("הפרויקט של עידן רייכל", "idan raichel project");
    m.insert("שלמה ארצי", "shlomo artzi");
    m.insert("יהודה פוליקר", "yehuda poliker");
    m.insert("רמי קלינשטיין", "rami kleinstein");
    m.insert("אביב גפן", "aviv geffen");
    m.insert("עברי לידר", "ivri lider");
    m.insert("עפרה חזה", "ofra haza");
    m.insert("אהוד בנאי", "ehud banai");
    m.insert("ריטה", "rita");
    m.insert("מאיר אריאל", "meir ariel");
    m.insert("ברי סחרוף", "berry sakharof");
    m.insert("רוני דלומי", "ronnie dalumi");
    m.insert("מוש בן ארי", "mosh ben ari");
    m.insert("שלומי שבת", "shlomi shabat");
    // Solo artists - contemporary
    m.insert("עומר אדם", "omer adam");
    m.insert("נועה קירל", "noa kirel");
    m.insert("סטטיק ובן אל תבורי", "static and ben el");
    m.insert("סטטיק ובן אל", "static and ben el");
    m.insert("שרית חדד", "sarit hadad");
    m.insert("שירי מימון", "shiri maimon");
    m.insert("אייל גולן", "eyal golan");
    m.insert("קובי פרץ", "kobi peretz");
    m.insert("דודו אהרון", "dudu aharon");
    m.insert("אברהם טל", "avraham tal");
    m.insert("קרן פלס", "keren peles");
    m.insert("עדן בן זקן", "eden ben zaken");
    m.insert("נטע ברזילי", "netta barzilai");
    m.insert("נטע", "netta");
    m.insert("אגם בוחבוט", "agam buhbut");
    m.insert("שחר טביב", "shachar taviv");
    m.insert("עומרי 4", "omri 4");
    m.insert("אושר כהן", "osher cohen");
    m.insert("אנה זק", "anna zak");
    m.insert("נסרין קדרי", "nasrin kadri");
    m.insert("ליאור נרקיס", "lior narkis");
    m.insert("יונתן קליב", "yonatan klieb");
    m.insert("דנה אינטרנשיונל", "dana international");
    m.insert("עדן חסון", "eden hason");
    m.insert("static and ben el tavori", "static and ben el");
    // Additional Hebrew artists from LRCLIB analysis (Jan 2026)
    // Classic artists
    m.insert("חיים משה", "haim moshe");
    m.insert("דקלון", "daklon");
    m.insert("ישי ריבו", "ishay ribo");
    m.insert("מתי כספי", "matti caspi");
    m.insert("חוה אלברשטיין", "chava alberstein");
    m.insert("חווה אלברשטיין", "chava alberstein");  // alternate spelling
    m.insert("ישי לוי", "yishai levy");
    m.insert("רמי פורטיס", "rami fortis");
    m.insert("קורין אלאל", "korin allal");
    m.insert("כנסיית השכל", "knesiyat hasechel");
    m.insert("ליאור פרחי", "lior farhi");
    m.insert("דני סנדרסון", "danny sanderson");
    m.insert("עידן עמדי", "idan amedi");
    m.insert("ג'ירפות", "girafot");
    m.insert("גלי עטרי", "gali atari");
    m.insert("גבריאל בלחסן", "gabriel belhasen");
    m.insert("רוקפור", "rockfour");
    m.insert("התקווה 6", "hatikva 6");
    m.insert("יהורם גאון", "yehoram gaon");
    m.insert("גידי גוב", "gidi gov");
    m.insert("הפרברים", "haprevarim");
    m.insert("הלם תרבות", "halem tarbut");
    m.insert("סגיב כהן", "sagiv cohen");
    m.insert("שוטי הנבואה", "shotei hanevuah");
    m.insert("פאר טסי", "peer tasi");
    m.insert("ירדנה ארזי", "yardena arazi");
    m.insert("אסף אמדורסקי", "assaf amdursky");
    m.insert("הגר יפת", "hagar yefet");
    m.insert("חיים ישראל", "haim israel");
    m.insert("איתי לוי", "itay levy");
    m.insert("תמוז", "tamuz");
    m.insert("נינט טייב", "ninet tayeb");
    m.insert("בעז שרעבי", "boaz sharabi");
    m.insert("טונה", "tuna");
    m.insert("עקיבא", "akiva");
    m.insert("נעמי שמר", "naomi shemer");
    m.insert("יואב יצחק", "yoav yitzhak");
    m.insert("דודו טסה", "dudu tasa");
    m.insert("ביני לנדאו", "bini landau");
    m.insert("משה פרץ", "moshe peretz");
    m.insert("יוסי בנאי", "yossi banai");
    m.insert("אריאל זילבר", "ariel zilber");
    m.insert("הפיל הכחול", "hapil hakahol");
    m.insert("אילנית", "ilanit");
    m.insert("זוהר ארגוב", "zohar argov");
    m.insert("נורית גלרון", "nurit galron");
    m.insert("אמיר דדון", "amir dadon");
    m.insert("נצ'י נצ'", "nechi nech");
    m.insert("מאיר בנאי", "meir banai");
    m.insert("שולי רנד", "shuli rand");
    m.insert("אריק לביא", "arik lavie");
    m.insert("אביתר בנאי", "evyatar banai");
    m.insert("סינרגיה", "synergia");
    m.insert("ריקי גל", "riki gal");
    m.insert("ליעד מאיר", "liad meir");
    m.insert("שחר סאול", "shachar saul");
    m.insert("עלמה גוב", "alma gov");
    m.insert("הראל סקעת", "harel skaat");
    m.insert("ששון איפרם שאולוב", "sasson ifram shaulov");
    m.insert("המכשפות", "hamechashefot");
    m.insert("פוצים", "potzim");
    m.insert("פוציםפוצים", "potzim");
    m.insert("למה אני חי?", "lama ani hai");
    m.insert("דודא", "duda");

    // Additional Hebrew artists from failure analysis (Jan 2026)
    m.insert("נרקיס", "narkis");
    m.insert("אמנים שונים", "various artists");
    m.insert("שמעון בוסקילה", "shimon buskila");
    m.insert("גיא מזיג", "guy mazig");
    m.insert("בית הבובות", "beit habubut");
    m.insert("אליעד", "eliad");
    m.insert("שלומי שבן", "shlomi shaban");
    m.insert("רביד פלוטניק", "ravid plotnik");
    m.insert("מוקי", "muki");
    m.insert("יזהר אשדות", "izhar ashdot");
    m.insert("הדס קליינמן ואביב בכר", "hadas kleinman and aviv bachar");
    m.insert("הבנות נחמה", "habanot nechama");
    m.insert("דמיס רוסוס", "demis roussos");
    m.insert("אביחי הולנדר", "avichai hollander");
    m.insert("רון עשהאל", "ron eshel");
    m.insert("פורטיסחרוף", "fortis charuf");
    m.insert("ערן צור", "eran tzur");
    m.insert("סילבר19", "silver19");
    m.insert("מוש בן-ארי", "mosh ben ari");
    m.insert("אלון עדר", "alon eder");
    m.insert("אלון עדר ולהקה", "alon eder velahaka");
    m.insert("שם טוב האבי", "shem tov havi");
    m.insert("קפה שחור חזק", "cafe shahor hazak");
    m.insert("עילי בוטנר וילדי החוץ", "ilay botner veyaldey hachutz");
    m.insert("לירן דנינו", "liran danino");
    m.insert("יגאל בשן", "yigal bashan");
    m.insert("דויד ברוזה", "david broza");
    m.insert("גיא ויהל", "guy veyahel");
    m.insert("ארקדי דוכין", "arkadi duchin");
    m.insert("שלישיית גשר הירקון", "shlishiyat gesher hayarkon");
    m.insert("רמי קלינשטיין וקרן פלס", "rami kleinstein and keren peles");
    m.insert("רותם כהן", "rotem cohen");
    m.insert("רון נשר", "ron nesher");
    m.insert("קובי אפללו", "kobi aflalo");
    m.insert("פורטרט", "portrait");
    m.insert("עידו בי", "ido b");
    m.insert("סאבלימינל", "subliminal");
    m.insert("נתנאלה", "netanela");
    m.insert("נועם צוריאלי", "noam tzurieli");
    m.insert("נונו", "nono");
    m.insert("מרסדס בנד", "mercedes band");
    m.insert("מור", "mor");
    m.insert("מוטי טקה", "moti taka");
    m.insert("מאור אשכנזי", "maor ashkenazi");
    m.insert("יהודית רביץ", "yehudit ravitz");
    m.insert("חלב ודבש", "chalav udvash");
    m.insert("חובי", "hovi");
    m.insert("חן פורתי", "chen porti");
    m.insert("הבילויים", "habiluyim");
    m.insert("בר צברי", "bar tzabari");
    m.insert("בן אל", "ben el");
    m.insert("בועז שרעבי", "boaz sharabi");
    m.insert("אתי אנקרי", "etti ankri");
    m.insert("אלישע בנאי וארבעים השודדים", "elisha banai vearbayim hashodedim");
    m.insert("איציק אשל", "itzik eshel");
    m.insert("אבי פרץ", "avi peretz");
    m.insert("אבי אבורומי", "avi aburomi");
    m.insert("החברים של נטאשה", "hachaverim shel natasha");
    m.insert("החלונות הגבוהים", "hachalonot hagvohim");
    m.insert("החצר האחורית", "hachatzer haahorit");
    m.insert("וייב איש", "vibe ish");
    m.insert("זהבה בן", "zehava ben");
    m.insert("זקני צפת", "zikney tzfat");
    m.insert("חבי", "havi");
    m.insert("חוה אלברשטיין", "chava alberstein");
    m.insert("חנן יובל", "hanan yuval");
    m.insert("יגל", "yagel");
    m.insert("יהודית שוורץ", "yehudit schwartz");
    m.insert("יהלי סובול", "yahli sobol");
    m.insert("יובל דיין", "yuval dayan");
    m.insert("יוסי אזולאי", "yossi azulai");
    m.insert("יוסי שטרית", "yossi shitrit");
    m.insert("ילד", "yeled");
    m.insert("יש הכל", "yesh hakol");
    m.insert("להקת חיל הים", "lehakat cheil hayam");
    m.insert("להקת פיקוד צפון", "lehakat pikud tzafon");
    m.insert("ליאור טל", "lior tal");
    m.insert("ליאור מיארה", "lior miara");
    m.insert("לירן אביב", "liran aviv");
    m.insert("מאי טוויק", "mai twick");
    m.insert("מאיה אברהם", "maya avraham");
    m.insert("מונה מור", "mona mor");
    m.insert("מורן מזור", "moran mazor");
    m.insert("מושיק עפיה", "moshik afia");
    m.insert("מושיקו מור", "moshiko mor");
    m.insert("מטרופולין", "metropolitin");
    m.insert("מירי מסיקה", "miri mesika");
    m.insert("מלכים א ומלכים ב", "melachim a umelachim b");
    m.insert("מרגלית צנעני", "margalit tsanani");
    m.insert("נאור כהן", "naor cohen");
    m.insert("נדב גדג'", "nadav gedj");
    m.insert("נוי גבאי", "noy gabay");
    m.insert("נוער שוליים", "noar shulaim");
    m.insert("נורית הירש", "nurit hirsh");
    m.insert("נושאי המגבעת", "nosei hamigbaat");
    m.insert("נעם רותם", "noam rotem");
    m.insert("נקמת הטרקטור", "nikmat hatraktor");
    m.insert("נריה חובב", "neria chovav");
    m.insert("נשמה", "neshama");
    m.insert("נתי לוי", "nati levi");
    m.insert("נתן גושן", "nathan goshen");
    m.insert("נתנאל ששון", "netanel sasson");
    m.insert("סבסטיאן XL", "sebastian xl");
    m.insert("סולג'יי", "soljay");
    m.insert("סטילה", "stella");
    m.insert("סימה נון", "sima non");
    m.insert("עדי אברהמי", "adi avrahami");
    m.insert("עוזי חיטמן", "uzi hitman");
    m.insert("עידן בקשי", "idan bakshi");
    m.insert("עידן יניב", "idan yaniv");
    m.insert("עילי בוטנר", "ilay botner");
    m.insert("עלמה זהר", "alma zohar");
    m.insert("עלמה זוהר", "alma zohar");
    m.insert("עמיר לב", "amir lev");
    m.insert("עמירן דביר", "amiran dvir");
    m.insert("ענבל רז", "inbal raz");
    m.insert("פבלו רוזנברג", "pablo rosenberg");
    m.insert("פייק אביב", "fake aviv");
    m.insert("צביקה פיק", "tzvika pick");
    m.insert("צליל מכוון", "tzlil mechuan");
    m.insert("צמד ילד", "tzmad yeled");
    m.insert("קטריקס ודורון ביטון", "katriks and doron biton");
    m.insert("רביב כנר", "raviv kaner");
    m.insert("רגב הוד", "regev hod");
    m.insert("רון חיון", "ron chiyon");
    m.insert("רונה קינן", "rona kenan");
    m.insert("רועי כפרי", "roi kafri");
    m.insert("רותי נבון", "ruti navon");
    m.insert("ריטה ורמי", "rita verami");
    m.insert("ריף כהן", "riff cohen");
    m.insert("רן דנקר ועילי בוטנר", "ran danker and ilay botner");
    m.insert("שאזאמאט", "shazamat");
    m.insert("שגב", "segev");
    m.insert("שובל שלו", "shuval shalu");
    m.insert("שי צברי", "shai tzabari");
    m.insert("שייגעצ", "shaygets");
    m.insert("שקד מולכו", "shaked mulcho");
    m.insert("שרון רוטר", "sharon rotter");
    m.insert("שרק", "shrek");
    m.insert("תומר חן", "tomer chen");
    m.insert("תיאטרון המדיטק", "teatron hameditek");
    m.insert("אורי בנאי", "uri banai");
    m.insert("אורי פיינמן", "uri feinman");
    m.insert("אורן לוטנברג", "oren lutenberg");
    m.insert("אחינועם ניני", "achinoam nini");
    m.insert("אילנה אביטל", "ilana avital");
    m.insert("אינפקציה", "infectzia");
    m.insert("איפה הילד", "eifo hayeled");
    m.insert("איציק קלה", "itzik kala");
    m.insert("אירה חודיאק", "ira chudiak");
    m.insert("אלה לי", "ela li");
    m.insert("אלי לוזון", "eli luzon");
    m.insert("אליאב זוהר", "eliav zohar");
    m.insert("אלייצור", "elaytzur");
    m.insert("אלישע חכמון", "elisha hachmon");
    m.insert("אלקנה מרציאנו", "elkana marciano");
    m.insert("אן בי", "anne b");
    m.insert("אסאלה", "asala");
    m.insert("אסף אור", "asaf or");
    m.insert("אפוקליפסה", "apocalypse");
    m.insert("אפרים ואסתר שמיר", "efraim veester shamir");
    m.insert("אפרת גוש", "efrat gosh");
    m.insert("ארז לב ארי", "erez lev ari");
    m.insert("האולטראס", "haultras");
    m.insert("האחים צברי", "haachim tzabari");
    m.insert("הכל עובר חביבי", "hakol over habibi");
    m.insert("הלל", "hillel");
    m.insert("העברית", "haivrit");
    m.insert("הפרויקט של רביבו", "haproject shel ravivo");
    m.insert("ותן חלקנו", "veten chelkenu");
    m.insert("טברנק", "tabarnak");
    m.insert("יהונתן חוטה", "yehonatan huta");
    m.insert("יניב בן משיח", "yaniv ben mashiach");
    m.insert("ישראל גוריון", "israel gurion");
    m.insert("בועז מעודה", "boaz mauda");
    m.insert("בן חן", "ben chen");
    m.insert("בן צור", "ben tzur");
    m.insert("בנאל בן ציון", "banal ben tzion");
    m.insert("בנזין", "benzin");
    m.insert("בניה ברבי", "benaya barbi");
    m.insert("ברי סחרוף ורע מוכיח", "berry sakharof and ra mochiach");
    m.insert("ג'קו אייזנברג", "jacko eisenberg");
    m.insert("ג'קי מקייטן", "jackie makayten");
    m.insert("גלעד שגב", "gilad segev");
    m.insert("דובי זלצר", "dubi zeltzer");
    m.insert("דודו פארוק", "dudu faruk");
    m.insert("דורון מזר", "doron mazar");
    m.insert("דנה ברגר", "dana berger");
    m.insert("דני בסן", "danny basan");
    m.insert("דני ליטני", "danny litani");
    m.insert("דפנה ארמוני", "dafna armoni");
    m.insert("הדג נחש ואינפקטד מאשרום", "hadag nahash and infected mushroom");
    m.insert("הדג נחש וארקדי יעקובסון", "hadag nahash and arkadi yakobson");
    m.insert("הדג נחש ויוסי מזרחי", "hadag nahash and yossi mizrachi");
    m.insert("הדג נחש ומארינה מקסימיליאן", "hadag nahash and marina maximilian");
    m.insert("הדג נחש ושי צברי", "hadag nahash and shai tzabari");
    m.insert("כרמלה גרוס ואגנר", "carmela gross and agner");
    m.insert("ארקדי דוכין ומאיר בנאי", "arkadi duchin and meir banai");
    m.insert("אריק איינשטיין ויוני רכטר", "arik einstein and yoni rechter");
    m.insert("אריק איינשטיין ומיקי גבריאלוב", "arik einstein and miki gabrielov");
    m.insert("אריק איינשטיין ושם טוב לוי", "arik einstein and shem tov levy");
    m.insert("אריק איינשטיין ושם-טוב לוי", "arik einstein and shem tov levy");
    m.insert("אריק סיני", "arik sinai");
    m.insert("ארץעיר", "eretz ir");
    m.insert("אהוד בנאי והפליטים", "ehud banai vehaplitim");
    m.insert("אודיה", "odiya");
    m.insert("אודימן", "odiman");
    m.insert("אוחנה וברקת", "ohana vebareket");
    m.insert("אופק אדנק", "ofek adanek");
    m.insert("אחרית הימים", "acharit hayamim");
    m.insert("איב אנד ליר", "eve and lear");
    m.insert("אביאל סולטן", "aviel sultan");
    m.insert("אבנר גדסי", "avner gadasi");
    m.insert("אבנר טואג", "avner toag");
    m.insert("אברהם פריד", "avraham fried");
    m.insert("אברי ג'י", "avri g");
    m.insert("ג'ינג'יות", "gingiot");
    m.insert("נופיה ידידיה", "nufia yedidia");
    m.insert("נערי רפול", "naarei raful");
    m.insert("חמי רודנר", "hami rodner");
    m.insert("חיים בצחוק", "chaim betzchok");
    m.insert("דודו טסה מארח את ברי סחרוף", "dudu tassa mearach et berry sakharof");
    m.insert("טונה & אורטגה", "tuna and ortega");
    m.insert("טונה & בר צברי", "tuna and bar tzabari");
    m.insert("שלומי שבת וירון כהן", "shlomi shabat and yaron cohen");
    m.insert("שלומי שבת וליאור נרקיס", "shlomi shabat and lior narkis");
    m.insert("שירי מימון ושמעון בוסקילה", "shiri maimon and shimon buskila");
    m.insert("משה פרץ ועומר אדם", "moshe peretz and omer adam");
    m.insert("שרית חדד וטיפקס", "sarit hadad and tipex");
    m.insert("אייל גולן ואלין גולן", "eyal golan and alin golan");
    m.insert("אייל גולן וחיים ישראל", "eyal golan and chaim israel");
    m.insert("אייל גולן ומשה פרץ", "eyal golan and moshe peretz");
    m.insert("אייל גולן ושלישיית מה קשור", "eyal golan and shlishiyat ma kashur");
    m.insert("לירן טל וישי לוי", "liran tal and yishai levy");
    // Final batch of missing pure Hebrew artists
    m.insert("'מלכים א' & מלכים ב", "melachim a umelachim b");
    m.insert("אדם", "adam");
    m.insert("אריק איינשטיין ושלום חנוך", "arik einstein and shalom hanoch");
    m.insert("אריק איינשטיין, יוני רכטר", "arik einstein yoni rechter");
    m.insert("אריק איינשטיין, יצחק קלפטר", "arik einstein yitzhak klepter");
    m.insert("אריק אינשטיין", "arik einstein");  // alternate spelling
    m.insert("גזוז", "gazoz");
    m.insert("התזמורת האנדלוסית הישראלית אשדוד", "hatizmoret haandalusit ashdod");
    m.insert("יובל רפאל", "yuval rafael");
    m.insert("ישראל גוריון & אסף אמדורסקי", "israel gurion and asaf amdursky");
    m.insert("סטילה, חובי", "stella hovi");
    m.insert("סטילה, נס", "stella ness");
    m.insert("עומר אדם & משה פרץ", "omer adam and moshe peretz");
    m.insert("עומר אדם (בשיתוף לירן דנינו)", "omer adam liran danino");
    m.insert("עידן רז", "idan raz");
    m.insert("פאר טסי וניב מנצור", "peer tasi and niv mantzur");
    m.insert("פאר טסי ופבלו רוזנברג", "peer tasi and pablo rosenberg");
    m.insert("קיי. ג'י. סי", "kjc");
    m.insert("שם טוב האבי & תמיר בר", "shem tov havi and tamir bar");
    m.insert("שמואל", "shmuel");
    m.insert("ששון איפרם שאולוב, אודיה", "sasson ifram shaulov odiya");

    m
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Check if a character is a Unicode combining mark (diacritical mark).
/// Used to filter out accents during normalization.
pub fn is_combining_mark(c: char) -> bool {
    matches!(c as u32, 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0xFE20..=0xFE2F)
}

/// Fold Unicode text to ASCII by applying NFKD decomposition and removing combining marks.
/// e.g., "Beyoncé" → "beyonce", "naïve" → "naive"
pub fn fold_to_ascii(s: &str) -> String {
    // First strip diacritics via NFKD decomposition
    let stripped: String = s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect();
    // Then transliterate any remaining non-ASCII (Cyrillic, Hebrew, CJK, etc.)
    any_ascii(&stripped).to_lowercase()
}

/// Normalize punctuation by converting curly quotes to straight quotes and & to and.
/// Also fixes common encoding issues and apostrophe spacing problems.
pub fn normalize_punctuation(s: &str) -> String {
    let result = s.replace(['\u{2018}', '\u{2019}'], "'")  // Left/right single curly quotes
        .replace(['\u{201C}', '\u{201D}'], "\"")  // Left/right double curly quotes
        .replace(['\u{00B4}', '\u{0060}'], "'")  // Acute accent and grave accent
        .replace(" & ", " and ")
        // Fix encoding issues: ? often appears where ' should be (e.g., "Can?t" → "Can't")
        .replace("?t ", "'t ")  // Can?t → Can't, Don?t → Don't, Won?t → Won't
        .replace("?s ", "'s ")  // It?s → It's
        .replace("?m ", "'m ")  // I?m → I'm
        .replace("?ve ", "'ve ")  // I?ve → I've
        .replace("?re ", "'re ")  // You?re → You're
        .replace("?ll ", "'ll ")  // I?ll → I'll
        // Fix apostrophe spacing: "She s " → "She's "
        .replace(" s ", "'s ")  // Common OCR/encoding error
        .replace(" t ", "'t ")  // Won t → Won't
        .replace(" m ", "'m ")  // I m → I'm
        .replace(" ve ", "'ve ")  // I ve → I've
        .replace(" re ", "'re ")  // You re → You're
        .replace(" ll ", "'ll ");  // I ll → I'll
    // Collapse multiple spaces into single space (e.g., "Peter Cetera  Amy Grant" → "Peter Cetera Amy Grant")
    MULTI_SPACE.replace_all(&result, " ").to_string()
}

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/// Normalize a title for matching.
/// Strips track numbers, brackets, file extensions, remaster tags, etc.
pub fn normalize_title(title: &str) -> String {
    let mut result = normalize_punctuation(title);

    // Strip file extension first (before other processing)
    result = FILE_EXTENSION.replace(&result, "").to_string();

    // Strip track number prefix (with separator)
    result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();

    // Strip track number prefix (space only, e.g., "16 Eleanor Rigby")
    // Keep the captured capital letter: replace "16 E" with "E"
    result = TRACK_NUMBER_SPACE_PREFIX.replace(&result, "$1").to_string();

    // Strip track number in brackets: "[01] Song" → "Song"
    result = TRACK_NUMBER_BRACKET.replace(&result, "").to_string();

    // Strip "Artist - Title" format: "117.Artist - Title" → "Title"
    result = TRACK_ARTIST_TITLE.replace(&result, "").to_string();

    // Strip bracket suffix like [Mono], [RM1], [take 2]
    result = BRACKET_SUFFIX.replace(&result, "").to_string();

    // Strip year suffix like (1964)
    result = YEAR_SUFFIX.replace(&result, "").to_string();

    // Strip mojibake suffix
    result = MOJIBAKE_SUFFIX.replace(&result, "").to_string();

    // Apply existing patterns
    for pattern in TITLE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }

    // Fold to ASCII and normalize
    let mut normalized = fold_to_ascii(&result).trim().to_string();

    // Strip "the " prefix from titles (e.g., "the sound of silence" → "sound of silence")
    // This helps match "The Sound of Silence" to "Sound of Silence"
    if normalized.starts_with("the ") && normalized.len() > 6 {
        normalized = normalized[4..].to_string();
    }

    normalized
}

/// Normalize title with artist context to strip artist prefix from title.
/// e.g., "Type O Negative - Love You To Death" with artist "Type O Negative" → "love you to death"
pub fn normalize_title_with_artist(title: &str, artist: &str) -> String {
    let mut result = normalize_punctuation(title);

    // Strip file extension first (before other processing)
    result = FILE_EXTENSION.replace(&result, "").to_string();

    // Strip track number prefix (with separator)
    result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();

    // Strip track number prefix (space only, e.g., "16 Eleanor Rigby")
    // Keep the captured capital letter: replace "16 E" with "E"
    result = TRACK_NUMBER_SPACE_PREFIX.replace(&result, "$1").to_string();

    // Strip track number in brackets: "[01] Song" → "Song"
    result = TRACK_NUMBER_BRACKET.replace(&result, "").to_string();

    // Strip "Artist - Title" format: "117.Artist - Title" → "Title"
    result = TRACK_ARTIST_TITLE.replace(&result, "").to_string();

    // Strip artist prefix if artist is long enough (avoid false positives for short names)
    let artist_norm = normalize_artist(artist);
    if artist_norm.len() >= 3 {
        let escaped = regex::escape(&artist_norm);
        if let Ok(prefix_re) = Regex::new(&format!(r"(?i)^\s*{}\s*[-–—:]\s*", escaped)) {
            result = prefix_re.replace(&result, "").to_string();
        }
    }

    // Strip bracket suffix like [Mono], [RM1], [take 2]
    result = BRACKET_SUFFIX.replace(&result, "").to_string();

    // Strip year suffix like (1964)
    result = YEAR_SUFFIX.replace(&result, "").to_string();

    // Strip mojibake suffix
    result = MOJIBAKE_SUFFIX.replace(&result, "").to_string();

    // Apply existing patterns
    for pattern in TITLE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }

    // Fold to ASCII and normalize
    let mut normalized = fold_to_ascii(&result).trim().to_string();

    // Strip "the " prefix from titles (e.g., "the sound of silence" → "sound of silence")
    if normalized.starts_with("the ") && normalized.len() > 6 {
        normalized = normalized[4..].to_string();
    }

    normalized
}

/// Normalize an artist name for matching.
/// Strips featured artists, handles "The" prefix/suffix, applies transliterations.
pub fn normalize_artist(artist: &str) -> String {
    let mut result = normalize_punctuation(artist);
    for pattern in ARTIST_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }

    // Check for known transliterations BEFORE ASCII folding (Hebrew/Cyrillic keys)
    let pre_fold_key = result.trim().to_lowercase();
    if let Some(&transliterated) = ARTIST_TRANSLITERATIONS.get(pre_fold_key.as_str()) {
        return transliterated.to_string();
    }

    let mut normalized = fold_to_ascii(&result).trim().to_lowercase();

    // Strip "the " prefix (e.g., "The Beatles" → "beatles")
    if normalized.starts_with("the ") {
        normalized = normalized[4..].to_string();
    }

    // Strip ", the" suffix (e.g., "Scorpions, The" → "scorpions")
    if normalized.ends_with(", the") {
        normalized = normalized[..normalized.len() - 5].to_string();
    }
    // Strip "(the)" suffix (e.g., "Dandy Warhols (the)" → "dandy warhols")
    if normalized.ends_with(" (the)") {
        normalized = normalized[..normalized.len() - 6].to_string();
    }

    // Also check transliterations AFTER ASCII folding (for Cyrillic that folds to known keys)
    ARTIST_TRANSLITERATIONS
        .get(normalized.as_str())
        .map(|&s| s.to_string())
        .unwrap_or(normalized)
}

/// Extract the primary (first) artist from a multi-artist string.
/// Returns None if no separator found or result would be empty.
/// e.g., "Mustard, Migos" → Some("mustard")
///       "Duck Sauce, A-Trak & Armand Van Helden" → Some("duck sauce")
///       "Beatles" → None (no separator)
pub fn extract_primary_artist(artist_norm: &str) -> Option<String> {
    // Find first separator
    if let Some(m) = ARTIST_SEPARATOR.find(artist_norm) {
        let primary = artist_norm[..m.start()].trim();
        if !primary.is_empty() && primary.len() >= 2 {
            // Re-normalize to handle "the " prefix on primary artist
            let mut result = primary.to_string();
            if result.starts_with("the ") {
                result = result[4..].to_string();
            }
            return Some(result);
        }
    }
    None
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_title_basic() {
        assert_eq!(normalize_title("03 - Song Name"), "song name");
        assert_eq!(normalize_title("Song [Mono]"), "song");
        assert_eq!(normalize_title("Track (2021 Remaster)"), "track");
    }

    #[test]
    fn test_normalize_artist_basic() {
        assert_eq!(normalize_artist("The Beatles"), "beatles");
        assert_eq!(normalize_artist("Band, The"), "band");
        assert_eq!(normalize_artist("Artist feat. Other"), "artist");
    }

    #[test]
    fn test_fold_to_ascii() {
        assert_eq!(fold_to_ascii("Björk"), "bjork");
        assert_eq!(fold_to_ascii("Motörhead"), "motorhead");
        assert_eq!(fold_to_ascii("Beyoncé"), "beyonce");
    }

    #[test]
    fn test_transliteration() {
        assert_eq!(normalize_artist("кино"), "kino");
        assert_eq!(normalize_artist("אייל גולן"), "eyal golan");
    }

    #[test]
    fn test_hebrew_artist_dictionary() {
        // Test Hebrew artists are properly transliterated via dictionary
        assert_eq!(normalize_artist("מוש בן ארי"), "mosh ben ari");
        assert_eq!(normalize_artist("אריק איינשטיין"), "arik einstein");
        assert_eq!(normalize_artist("טיפקס"), "tipex");
        assert_eq!(normalize_artist("הדג נחש"), "hadag nahash");
        assert_eq!(normalize_artist("עומר אדם"), "omer adam");
        assert_eq!(normalize_artist("נעמי שמר"), "naomi shemer");
        assert_eq!(normalize_artist("משה פרץ"), "moshe peretz");
        assert_eq!(normalize_artist("ישי ריבו"), "ishay ribo");
        assert_eq!(normalize_artist("שלום חנוך"), "shalom hanoch");
        assert_eq!(normalize_artist("קפה שחור חזק"), "cafe shahor hazak");
    }

    #[test]
    fn test_extract_primary_artist() {
        // Comma separator
        assert_eq!(extract_primary_artist("mustard, migos"), Some("mustard".to_string()));
        // No separator - returns None
        assert_eq!(extract_primary_artist("beatles"), None);
        // Ampersand separator with "the" prefix stripped
        assert_eq!(extract_primary_artist("the beatles & someone"), Some("beatles".to_string()));
        // Slash separator
        assert_eq!(extract_primary_artist("artist1/artist2"), Some("artist1".to_string()));
        assert_eq!(extract_primary_artist("artist1 / artist2"), Some("artist1".to_string()));
        // "x" separator (common in electronic music)
        assert_eq!(extract_primary_artist("dj snake x lil jon"), Some("dj snake".to_string()));
        // "vs" separator
        assert_eq!(extract_primary_artist("artist1 vs artist2"), Some("artist1".to_string()));
        assert_eq!(extract_primary_artist("artist1 vs. artist2"), Some("artist1".to_string()));
        // "and" separator
        assert_eq!(extract_primary_artist("hall and oates"), Some("hall".to_string()));
        // "feat" / "ft" separator
        assert_eq!(extract_primary_artist("drake feat rihanna"), Some("drake".to_string()));
        assert_eq!(extract_primary_artist("drake ft. rihanna"), Some("drake".to_string()));
        // Multiple separators - should take first
        assert_eq!(extract_primary_artist("artist1, artist2 & artist3"), Some("artist1".to_string()));
        // Plus separator
        assert_eq!(extract_primary_artist("artist1+artist2"), Some("artist1".to_string()));
    }

    #[test]
    fn test_normalize_title_with_artist() {
        assert_eq!(
            normalize_title_with_artist("Type O Negative - Love You To Death", "Type O Negative"),
            "love you to death"
        );
    }

    #[test]
    fn test_normalize_punctuation() {
        assert_eq!(normalize_punctuation("Can't Stop"), "Can't Stop");
        assert_eq!(normalize_punctuation("Can?t Stop"), "Can't Stop");
        assert_eq!(normalize_punctuation("Rock & Roll"), "Rock and Roll");
    }

    #[test]
    fn test_normalize_title_new_patterns() {
        // Track number in brackets
        assert_eq!(normalize_title("[01] Song Name"), "song name");
        assert_eq!(normalize_title("[12] Another Song"), "another song");

        // Digital remaster with year
        assert_eq!(normalize_title("Song - 2001 Digital Remaster"), "song");

        // Disc/CD markers
        assert_eq!(normalize_title("Track (Disc 1)"), "track");
        assert_eq!(normalize_title("Song [CD 2]"), "song");

        // LP/Single version
        assert_eq!(normalize_title("Hit - Single Version"), "hit");
        assert_eq!(normalize_title("Song - LP Version"), "song");

        // Bonus track
        assert_eq!(normalize_title("Hidden (Bonus Track)"), "hidden");

        // From soundtrack
        assert_eq!(normalize_title("Theme (From Movie Soundtrack)"), "theme");

        // UK/US mix
        assert_eq!(normalize_title("Song (UK Mix)"), "song");

        // The prefix stripping
        assert_eq!(normalize_title("The Sound of Silence"), "sound of silence");
        assert_eq!(normalize_title("The Wall"), "wall");
    }

    #[test]
    fn test_normalize_title_track_artist_format() {
        // Track number with dot is stripped, leaving "Artist - Song" which isn't further processed
        // This is expected - the "Artist - Title" embedded case needs normalize_title_with_artist
        assert_eq!(normalize_title("117.Artist Name - Actual Song"), "artist name - actual song");

        // But with artist context, the artist prefix can be stripped
        assert_eq!(
            normalize_title_with_artist("Artist Name - Actual Song", "Artist Name"),
            "actual song"
        );
    }

    #[test]
    fn test_hebrew_collaboration_and_handling() {
        // Hebrew collaborations use "and" which should:
        // 1. Stay intact after normalize_artist (for matching Spotify "Artist1 and Artist2")
        // 2. Be splittable via extract_primary_artist (for fallback matching)

        // Hebrew ו prefix transliterated as "and"
        assert_eq!(normalize_artist("אייל גולן ומשה פרץ"), "eyal golan and moshe peretz");
        assert_eq!(normalize_artist("הדס קליינמן ואביב בכר"), "hadas kleinman and aviv bachar");

        // extract_primary_artist handles "and" for fallback matching
        assert_eq!(
            extract_primary_artist("eyal golan and moshe peretz"),
            Some("eyal golan".to_string())
        );
        assert_eq!(
            extract_primary_artist("hadas kleinman and aviv bachar"),
            Some("hadas kleinman".to_string())
        );

        // Spotify "&" becomes "and" via normalize_punctuation, enabling match
        assert_eq!(normalize_punctuation("Eyal Golan & Moshe Peretz"), "Eyal Golan and Moshe Peretz");
    }
}
