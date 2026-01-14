//! Pre-normalize Spotify database for faster extraction
//! Creates spotify_normalized.sqlite3 with normalized title/artist keys
//!
//! Usage: normalize-spotify [--log-only] <spotify_clean.sqlite3> [output.sqlite3]
//!
//! NOTE: Do not create output files in the project directory.
//! Use a separate location like /Users/hmemcpy/git/music/

use anyhow::Result;
use any_ascii::any_ascii;
use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::Connection;
use rustc_hash::FxHashMap;
use std::time::Instant;
use unicode_normalization::UnicodeNormalization;

// ============================================================================
// NORMALIZATION (same as main.rs)
// ============================================================================

static TRACK_NUMBER_PREFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-–—._]\s*").unwrap()
});

static TRACK_NUMBER_SPACE_PREFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(?:0[1-9]|[1-9]\d?)\s+([A-Z])").unwrap()
});

static BRACKET_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\s*\[[^\]]+\]\s*$").unwrap()
});

static FILE_EXTENSION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\.(flac|mp3|wav|m4a|ogg|aac)$").unwrap()
});

static YEAR_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\s*\(\d{4}\)\s*$").unwrap()
});

static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"[\u{FFFD}]+$").unwrap()
});

static TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s*[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[\(\[].*?(remaster|remix|mix|edit|version|live|acoustic|radio|single|album|deluxe|bonus|instrumental|demo|mono|stereo|extended|original|official|explicit|clean|censored|uncensored).*?[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*-\s*(remaster|remix|remastered|live|acoustic|radio edit|single version|album version|bonus track|instrumental|demo).*$").unwrap(),
        Regex::new(r"(?i)\s*/\s*(remaster|remix|live|acoustic).*$").unwrap(),
    ]
});

static ARTIST_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s*[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]").unwrap(),
        Regex::new(r"(?i),?\s*(feat\.?|ft\.?|featuring)\s+.*$").unwrap(),
        Regex::new(r"(?i)\s*;\s*.*$").unwrap(),
        Regex::new(r"(?i)\s*/\s*.*$").unwrap(),
        Regex::new(r"(?i)\s*&\s*.*$").unwrap(),
    ]
});

/// Artist transliteration map for Hebrew/Cyrillic → Latin.
/// Must match main.rs ARTIST_TRANSLITERATIONS exactly.
static ARTIST_TRANSLITERATIONS: Lazy<FxHashMap<&str, &str>> = Lazy::new(|| {
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
    // Hebrew artists (top from LRCLIB)
    m.insert("אייל גולן", "eyal golan");
    m.insert("אריק איינשטיין", "arik einstein");
    m.insert("חיים משה", "haim moshe");
    m.insert("עפרה חזה", "ofra haza");
    m.insert("דקלון", "daklon");
    m.insert("ישי ריבו", "ishay ribo");
    m.insert("משינה", "mashina");
    m.insert("מתי כספי", "matti caspi");
    m.insert("מאיר אריאל", "meir ariel");
    m.insert("חוה אלברשטיין", "chava alberstein");
    m.insert("חווה אלברשטיין", "chava alberstein");
    m.insert("ישי לוי", "yishai levy");
    m.insert("רמי פורטיס", "rami fortis");
    m.insert("עדן חסון", "eden hason");
    m.insert("ברי סחרוף", "berry sakharof");
    m.insert("קורין אלאל", "korin allal");
    m.insert("הדג נחש", "hadag nahash");
    m.insert("כנסיית השכל", "knesiyat hasechel");
    m.insert("אהוד בנאי", "ehud banai");
    m.insert("שלום חנוך", "shalom hanoch");
    m.insert("ליאור פרחי", "lior farhi");
    m.insert("דני סנדרסון", "danny sanderson");
    m.insert("עידן עמדי", "idan amedi");
    m.insert("ג'ירפות", "girafot");
    m.insert("גלי עטרי", "gali atari");
    m.insert("דודו אהרון", "dudu aharon");
    m.insert("אתניקס", "ethnix");
    m.insert("רוקפור", "rockfour");
    m.insert("שלמה ארצי", "shlomo artzi");
    m.insert("התקווה 6", "hatikva 6");
    m.insert("מוניקה סקס", "monica sex");
    m.insert("טיפקס", "tipex");
    m.insert("הדורבנים", "hadorbanim");
    m.insert("יהורם גאון", "yehoram gaon");
    m.insert("גידי גוב", "gidi gov");
    m.insert("שוטי הנבואה", "shotei hanevuah");
    m.insert("פאר טסי", "peer tasi");
    m.insert("ירדנה ארזי", "yardena arazi");
    m.insert("אסף אמדורסקי", "assaf amdursky");
    m.insert("שלומי שבת", "shlomi shabat");
    m.insert("יהודה פוליקר", "yehuda poliker");
    m.insert("חיים ישראל", "haim israel");
    m.insert("איתי לוי", "itay levy");
    m.insert("תמוז", "tamuz");
    m.insert("נינט טייב", "ninet tayeb");
    m.insert("בעז שרעבי", "boaz sharabi");
    m.insert("עקיבא", "akiva");
    m.insert("נעמי שמר", "naomi shemer");
    m.insert("יואב יצחק", "yoav yitzhak");
    m.insert("דודו טסה", "dudu tasa");
    m.insert("מוש בן ארי", "mosh ben ari");
    m.insert("משה פרץ", "moshe peretz");
    m.insert("יוסי בנאי", "yossi banai");
    m.insert("אריאל זילבר", "ariel zilber");
    m.insert("הפיל הכחול", "hapil hakahol");
    m.insert("אילנית", "ilanit");
    m.insert("זוהר ארגוב", "zohar argov");
    m.insert("אביב גפן", "aviv geffen");
    m.insert("קרן פלס", "keren peles");
    m.insert("אמיר דדון", "amir dadon");
    m.insert("שולי רנד", "shuli rand");
    m.insert("אברהם טל", "avraham tal");
    m.insert("אביתר בנאי", "evyatar banai");
    m.insert("עומר אדם", "omer adam");
    m.insert("שרית חדד", "sarit hadad");
    m.insert("עידן רייכל", "idan raichel");
    m.insert("נועה קירל", "noa kirel");
    m.insert("קאברט", "kaveret");
    m.insert("כוורת", "kaveret");
    m.insert("עברי לידר", "ivri lider");
    m.insert("הראל סקעת", "harel skaat");
    m.insert("היהודים", "hayehudim");
    m.insert("סינרגיה", "synergia");
    m.insert("ריקי גל", "riki gal");
    // More Hebrew artists (from main.rs original list)
    m.insert("בום פאם", "boom pam");
    m.insert("ימן בלוז", "yemen blues");
    m.insert("שבק ס", "shabak samech");
    m.insert("תיסלם", "teapacks");
    m.insert("בנות נחש", "bnot nechash");
    m.insert("מרסדס בנד", "mercedes band");
    m.insert("הפרויקט של עידן רייכל", "idan raichel project");
    m.insert("רמי קלינשטיין", "rami kleinstein");
    m.insert("ריטה", "rita");
    m.insert("רוני דלומי", "ronnie dalumi");
    m.insert("סטטיק ובן אל תבורי", "static and ben el");
    m.insert("סטטיק ובן אל", "static and ben el");
    m.insert("שירי מימון", "shiri maimon");
    m.insert("קובי פרץ", "kobi peretz");
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
    m.insert("static and ben el tavori", "static and ben el");
    // Additional from LRCLIB analysis
    m.insert("גבריאל בלחסן", "gabriel belhasen");
    m.insert("הפרברים", "haprevarim");
    m.insert("הלם תרבות", "halem tarbut");
    m.insert("סגיב כהן", "sagiv cohen");
    m.insert("הגר יפת", "hagar yefet");
    m.insert("טונה", "tuna");
    m.insert("ביני לנדאו", "bini landau");
    m.insert("נורית גלרון", "nurit galron");
    m.insert("נצ'י נצ'", "nechi nech");
    m.insert("מאיר בנאי", "meir banai");
    m.insert("אריק לביא", "arik lavie");
    m.insert("ליעד מאיר", "liad meir");
    m.insert("שחר סאול", "shachar saul");
    m.insert("עלמה גוב", "alma gov");
    m.insert("ששון איפרם שאולוב", "sasson ifram shaulov");
    m.insert("המכשפות", "hamechashefot");
    m.insert("פוצים", "potzim");
    m.insert("פוציםפוצים", "potzim");
    m.insert("למה אני חי?", "lama ani hai");
    m.insert("דודא", "duda");
    m
});

fn is_combining_mark(c: char) -> bool {
    matches!(c, '\u{0300}'..='\u{036F}' | '\u{1AB0}'..='\u{1AFF}' |
             '\u{1DC0}'..='\u{1DFF}' | '\u{20D0}'..='\u{20FF}' |
             '\u{FE20}'..='\u{FE2F}')
}

fn fold_to_ascii(s: &str) -> String {
    // First strip diacritics via NFKD decomposition
    let stripped: String = s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect();
    // Then transliterate any remaining non-ASCII (Cyrillic, Hebrew, CJK, etc.)
    any_ascii(&stripped).to_lowercase()
}

fn normalize_punctuation(s: &str) -> String {
    s.replace(['\u{2018}', '\u{2019}'], "'")
        .replace(['\u{201C}', '\u{201D}'], "\"")
        .replace(['\u{00B4}', '\u{0060}'], "'")
        .replace(" & ", " and ")
        .replace("?t ", "'t ")
        .replace("?s ", "'s ")
        .replace("?ll ", "'ll ")
        .replace("?re ", "'re ")
        .replace("?ve ", "'ve ")
        .replace("?d ", "'d ")
        .replace("?m ", "'m ")
        .replace(" s ", "'s ")
        .replace(" t ", "'t ")
        .replace(" ll ", "'ll ")
        .replace(" re ", "'re ")
        .replace(" ve ", "'ve ")
        .replace(" d ", "'d ")
        .replace(" m ", "'m ")
}

fn normalize_title(title: &str) -> String {
    let mut s = title.to_string();

    // Strip file extensions
    s = FILE_EXTENSION.replace_all(&s, "").to_string();

    // Strip year suffix like (1964)
    s = YEAR_SUFFIX.replace_all(&s, "").to_string();

    // Strip bracket suffix like [Mono], [RM1]
    s = BRACKET_SUFFIX.replace_all(&s, "").to_string();

    // Strip track number prefix with separator
    s = TRACK_NUMBER_PREFIX.replace(&s, "").to_string();

    // Strip track number prefix without separator (e.g., "16 Eleanor Rigby")
    if let Some(caps) = TRACK_NUMBER_SPACE_PREFIX.captures(&s) {
        if let Some(letter) = caps.get(1) {
            s = format!("{}{}", letter.as_str(), &s[caps.get(0).unwrap().end()..]);
        }
    }

    // Strip mojibake
    s = MOJIBAKE_SUFFIX.replace(&s, "").to_string();

    // Normalize punctuation
    s = normalize_punctuation(&s);

    // Fold diacritics
    s = fold_to_ascii(&s);

    // Apply title patterns
    for pattern in TITLE_PATTERNS.iter() {
        s = pattern.replace_all(&s, "").to_string();
    }

    s.to_lowercase().trim().to_string()
}

fn normalize_artist(artist: &str) -> String {
    let mut s = normalize_punctuation(artist);

    for pattern in ARTIST_PATTERNS.iter() {
        s = pattern.replace_all(&s, "").to_string();
    }

    // Check for known transliterations BEFORE ASCII folding (Hebrew/Cyrillic keys)
    let pre_fold_key = s.trim().to_lowercase();
    if let Some(&transliterated) = ARTIST_TRANSLITERATIONS.get(pre_fold_key.as_str()) {
        return transliterated.to_string();
    }

    s = fold_to_ascii(&s);
    let mut normalized = s.to_lowercase().trim().to_string();

    // Strip "the " prefix (e.g., "The Beatles" → "beatles")
    if normalized.starts_with("the ") {
        normalized = normalized[4..].to_string();
    }

    // Strip ", the" suffix (e.g., "Scorpions, The" → "scorpions")
    if normalized.ends_with(", the") {
        normalized = normalized[..normalized.len() - 5].to_string();
    }

    // Also check transliterations AFTER ASCII folding (for Cyrillic that folds to known keys)
    ARTIST_TRANSLITERATIONS
        .get(normalized.as_str())
        .map(|&s| s.to_string())
        .unwrap_or(normalized)
}

/// Execute a batched INSERT statement for better performance
fn execute_batch_insert(
    conn: &Connection,
    batch: &[(String, String, i64)],
) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    // Build multi-value INSERT: INSERT INTO track_norm VALUES (?, ?, ?), (?, ?, ?), ...
    let placeholders: Vec<&str> = (0..batch.len()).map(|_| "(?, ?, ?)").collect();
    let sql = format!(
        "INSERT INTO track_norm (track_rowid, title_norm, artist_norm) VALUES {}",
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare_cached(&sql)?;

    // Flatten batch into parameter list
    let params: Vec<&dyn rusqlite::ToSql> = batch
        .iter()
        .flat_map(|(title, artist, rowid)| {
            vec![
                rowid as &dyn rusqlite::ToSql,
                title as &dyn rusqlite::ToSql,
                artist as &dyn rusqlite::ToSql,
            ]
        })
        .collect();

    stmt.execute(params.as_slice())?;
    Ok(())
}

/// Create a progress bar, optionally hidden for log-only mode
fn create_progress_bar(len: u64, log_only: bool) -> ProgressBar {
    let pb = ProgressBar::new(len);
    if log_only {
        pb.set_draw_target(ProgressDrawTarget::hidden());
    } else {
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec}, ETA: {eta})")
                .unwrap()
                .progress_chars("#>-"),
        );
    }
    pb
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();

    // Parse --log-only flag
    let log_only = args.iter().any(|a| a == "--log-only");
    let args_filtered: Vec<&String> = args.iter().filter(|a| *a != "--log-only").collect();

    if args_filtered.len() < 2 {
        eprintln!("Usage: normalize-spotify [--log-only] <spotify_clean.sqlite3> [spotify_normalized.sqlite3]");
        eprintln!();
        eprintln!("Options:");
        eprintln!("  --log-only  Disable progress bars, use log output only (for background runs)");
        eprintln!();
        eprintln!("Creates a normalized lookup table for faster extraction.");
        eprintln!("The output file will contain track_rowid, title_norm, artist_norm");
        eprintln!("with an index on (title_norm, artist_norm) for O(1) lookups.");
        std::process::exit(1);
    }

    let spotify_db = args_filtered[1];
    let output_db = args_filtered.get(2).map(|s| s.as_str()).unwrap_or("spotify_normalized.sqlite3");

    let start = Instant::now();

    // Remove existing output file to avoid corruption from previous runs
    if std::path::Path::new(output_db).exists() {
        println!("Removing existing output file: {:?}", output_db);
        std::fs::remove_file(output_db)?;
    }

    // Open source database
    println!("Opening Spotify database: {:?}", spotify_db);
    let src_conn = Connection::open(spotify_db)?;

    // Count tracks for progress bar (pop>=1 for fast index, pop=0 handled via fallback)
    let total: u64 = src_conn.query_row(
        "SELECT COUNT(*) FROM tracks t
         JOIN track_artists ta ON ta.track_rowid = t.rowid
         WHERE t.popularity >= 1",
        [],
        |row| row.get(0),
    )?;
    println!("Found {} tracks to normalize", total);

    // Create output database
    println!("Creating output database: {:?}", output_db);
    let mut out_conn = Connection::open(output_db)?;

    // Optimize for bulk insert
    out_conn.execute_batch(
        "PRAGMA journal_mode = OFF;
         PRAGMA synchronous = OFF;
         PRAGMA cache_size = -512000;
         PRAGMA temp_store = MEMORY;",
    )?;

    // Create table
    out_conn.execute(
        "CREATE TABLE IF NOT EXISTS track_norm (
            track_rowid INTEGER NOT NULL,
            title_norm TEXT NOT NULL,
            artist_norm TEXT NOT NULL
        )",
        [],
    )?;

    // Stream and normalize, deduplicating by keeping highest popularity per key
    println!("Phase 1: Normalizing and deduplicating (keeping highest popularity per key)...");
    eprintln!("[PHASE1] Starting normalization of {} tracks...", total);
    let pb = create_progress_bar(total, log_only);

    // Map: (title_norm, artist_norm) -> (track_rowid, popularity)
    let mut dedup_map: FxHashMap<(String, String), (i64, i32)> = FxHashMap::default();

    let mut stmt = src_conn.prepare(
        "SELECT t.rowid, t.name, a.name, t.popularity
         FROM tracks t
         JOIN track_artists ta ON ta.track_rowid = t.rowid
         JOIN artists a ON a.rowid = ta.artist_rowid
         WHERE t.popularity >= 1",
    )?;

    let mut rows = stmt.query([])?;
    let mut count = 0u64;

    while let Some(row) = rows.next()? {
        let track_rowid: i64 = row.get(0)?;
        let title: String = row.get(1)?;
        let artist: String = row.get(2)?;
        let popularity: i32 = row.get(3)?;

        let title_norm = normalize_title(&title);
        let artist_norm = normalize_artist(&artist);
        let key = (title_norm, artist_norm);

        // Keep track with highest popularity
        match dedup_map.get(&key) {
            Some((_, existing_pop)) if *existing_pop >= popularity => {}
            _ => {
                dedup_map.insert(key, (track_rowid, popularity));
            }
        }

        count += 1;
        if count % 100_000 == 0 {
            pb.set_position(count);
        }
        // Tail-friendly logging
        if count % 500_000 == 0 {
            eprintln!("[READ] {}/{} ({:.1}%)", count, total, 100.0 * count as f64 / total as f64);
        }
    }
    pb.set_position(count);
    pb.finish_with_message("done");
    eprintln!("[READ] {}/{} (100.0%)", count, total);

    let unique_keys = dedup_map.len();
    println!("  {} unique keys from {} rows ({:.1}% dedup ratio)",
             unique_keys, count, 100.0 * (1.0 - unique_keys as f64 / count as f64));

    // Write deduplicated entries using batched INSERTs
    const BATCH_SIZE: usize = 1000;
    let total_batches = (unique_keys + BATCH_SIZE - 1) / BATCH_SIZE;
    println!("Phase 2: Writing {} entries in {} batches (batch size: {})...", unique_keys, total_batches, BATCH_SIZE);
    eprintln!("[PHASE2] Starting write of {} entries...", unique_keys);

    let pb2 = create_progress_bar(unique_keys as u64, log_only);

    let tx = out_conn.transaction()?;
    {
        let mut written = 0u64;
        let mut batch: Vec<(String, String, i64)> = Vec::with_capacity(BATCH_SIZE);

        for ((title_norm, artist_norm), (track_rowid, _)) in dedup_map {
            batch.push((title_norm, artist_norm, track_rowid));

            if batch.len() >= BATCH_SIZE {
                execute_batch_insert(&tx, &batch)?;
                written += batch.len() as u64;
                batch.clear();
                pb2.set_position(written);

                // Also log for tail-friendly output
                if written % 500_000 == 0 {
                    eprintln!("[WRITE] {}/{} ({:.1}%)", written, unique_keys, 100.0 * written as f64 / unique_keys as f64);
                }
            }
        }

        // Write remaining entries
        if !batch.is_empty() {
            execute_batch_insert(&tx, &batch)?;
            written += batch.len() as u64;
            pb2.set_position(written);
        }

        eprintln!("[WRITE] {}/{} (100.0%)", written, unique_keys);
    }
    tx.commit()?;
    pb2.finish_with_message("done");

    // Create indexes
    println!("Creating indexes...");
    eprintln!("[INDEX] Creating primary index on (title_norm, artist_norm)...");
    let idx_start = Instant::now();

    out_conn.execute(
        "CREATE INDEX idx_norm_key ON track_norm(title_norm, artist_norm)",
        [],
    )?;
    let idx_elapsed = idx_start.elapsed().as_secs_f64();
    println!("  Primary index created in {:.2}s", idx_elapsed);
    eprintln!("[INDEX] Complete in {:.2}s", idx_elapsed);

    // Optimize
    println!("Optimizing database...");
    eprintln!("[ANALYZE] Running ANALYZE...");
    out_conn.execute("ANALYZE", [])?;
    eprintln!("[ANALYZE] Complete");

    // Get file size
    let metadata = std::fs::metadata(output_db)?;
    let size_mb = metadata.len() as f64 / 1024.0 / 1024.0;

    let elapsed = start.elapsed();
    println!();
    println!("============================================================");
    println!("Normalization complete!");
    println!("  Input rows: {}", total);
    println!("  Unique keys: {}", unique_keys);
    println!("  Output size: {:.2} MB", size_mb);
    println!("  Elapsed: {:.2}s", elapsed.as_secs_f64());
    println!("============================================================");

    Ok(())
}
