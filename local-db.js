/**
 * local-db.js -- Penyimpanan transaksi lokal PERSISTEN (SQLite) untuk shell desktop AIS POS Kasir.
 *
 * <h3>Kenapa SQLite, bukan sekadar IndexedDB (yang sudah dipakai versi browser)</h3>
 * IndexedDB (dipakai {@code ais_pos_offline.js} untuk versi web/browser) cukup baik untuk kasus
 * umum, tapi punya tiga keterbatasan nyata untuk kebutuhan kasir desktop: (1) tidak mudah diperiksa
 * manual oleh admin/IT saat troubleshooting -- isinya blob biner tersembunyi di profil browser,
 * bukan berkas yang bisa dibuka; (2) di beberapa kondisi browser bisa membersihkan storage bila
 * disk penuh/quota terlampaui, kecuali {@code navigator.storage.persist()} diberikan (tidak selalu
 * granted); (3) tidak punya jaminan ACID/write-ahead-log seketat mesin database sungguhan. Karena
 * shell desktop ini punya akses Node.js penuh di proses utama, kita bisa memakai SQLite --
 * {@code better-sqlite3} dengan mode WAL (Write-Ahead Log) -- yang MEMANG dirancang untuk skenario
 * persis diminta: kalau listrik mati di tengah transaksi, baris yang SUDAH commit tetap aman utuh di
 * berkas .db saat komputer menyala lagi, dan baris yang belum sempat commit otomatis hilang bersih
 * (tidak korup setengah-setengah) -- bukan menebak-nebak. Ini pola yang sama dipakai POS sungguhan di
 * lapangan (Square, Lightspeed, Odoo POS semuanya memakai SQLite lokal untuk alasan yang sama).
 *
 * <h3>Prinsip "tulis lokal dulu, backup permanen" (local-first)</h3>
 * SETIAP transaksi -- baik saat online maupun offline -- SELALU ditulis ke tabel ini LEBIH DULU
 * (status {@code PENDING}) sebelum dicoba dikirim ke server. Begitu server mengonfirmasi sukses,
 * barisnya HANYA diubah statusnya menjadi {@code SYNCED} (dicatat {@code disinkron_pada}) --
 * TIDAK PERNAH DIHAPUS. Dengan begitu: (a) transaksi yang baru saja diklik "Bayar" tetap aman di
 * disk walau aplikasi/komputer mati SEBELUM sempat mendapat konfirmasi server, bahkan saat kondisi
 * online sekalipun (jendela race singkat antara klik kasir dan balasan server); (b) seluruh riwayat
 * transaksi -- termasuk yang sudah lama sukses tersinkron -- tetap tersimpan sebagai cadangan lokal
 * yang bisa diperiksa/diaudit/dire-sinkronkan ulang kapan saja tanpa bergantung pada server.
 *
 * <h3>Kenapa SATU tabel besar, bukan tabel baru tiap hari</h3>
 * Godaan umum supaya "tidak berat" adalah membuat tabel terpisah per hari/bulan. Untuk skala
 * transaksi kantin harian (ratusan-ribuan baris/hari), SQLite dengan index yang tepat pada kolom
 * {@code waktu} menangani JUTAAN baris tanpa masalah performa -- memecah jadi tabel per hari justru
 * menambah kerumitan (migrasi skema berulang, query lintas-hari jadi rumit) untuk manfaat performa
 * yang nyaris tidak terasa di skala ini. Sebagai gantinya, disediakan {@link #archiveOlderThan} --
 * pemindahan (BUKAN penghapusan) baris lama yang sudah SYNCED ke berkas arsip terpisah, dipanggil
 * manual/berkala oleh admin bila berkas utama dirasa sudah terlalu besar, tanpa pernah benar-benar
 * kehilangan data.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/** @type {import('better-sqlite3').Database|null} */
let db = null;
/** @type {string|null} folder tempat berkas .db utama & arsip disimpan. */
let dataDir = null;

const SKEMA_TABEL = `
CREATE TABLE IF NOT EXISTS transaksi (
    client_trx_id TEXT PRIMARY KEY,
    toko_id INTEGER,
    kasir TEXT,
    waktu TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    pesan_error TEXT,
    disimpan_pada TEXT NOT NULL,
    disinkron_pada TEXT
);
CREATE INDEX IF NOT EXISTS idx_transaksi_waktu ON transaksi(waktu);
CREATE INDEX IF NOT EXISTS idx_transaksi_status ON transaksi(status);

-- Cache "data referensi terakhir online" (katalog produk+kategori, konfigurasi POS, dst) -- BUKAN
-- transaksi. Dipakai halaman POS lokal (pos.html) supaya tetap bisa menampilkan produk & harga saat
-- offline, memakai salinan paling akhir yang berhasil diambil saat online (lihat JavaDoc
-- simpanCache/bacaCache di bawah). Satu baris per "kunci" (mis. "katalog", "konfigurasi") --
-- SELALU ditimpa (bukan riwayat), karena yang dibutuhkan cuma potret PALING BARU.
CREATE TABLE IF NOT EXISTS cache_referensi (
    kunci TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    disimpan_pada TEXT NOT NULL
);

-- Menu "Log Error" (Desktop) -- SETIAP error/exception yg tertangkap di aplikasi shell ini (proses
-- utama MAUPUN jendela renderer manapun: Kasir/Ringkasan/Pesanan/Anggota/Diskon/Laporan/Riwayat
-- Sinkronisasi) dicatat ke sini, BUKAN cuma ke berkas teks main.log yg sebelumnya cuma bisa dibaca
-- lewat akses filesystem langsung -- kasir/admin toko sehari-hari tidak punya itu. Dipakai utk
-- mendiagnosis kasus "server bilang sukses tapi perilaku tidak berubah" (lihat entri sumber
-- 'renderer:*:anomali-sesi-kas' di pos-renderer.js) selain crash/exception murni.
CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    waktu TEXT NOT NULL,
    sumber TEXT NOT NULL,
    tingkat TEXT NOT NULL DEFAULT 'error',
    pesan TEXT NOT NULL,
    detail TEXT,
    layar TEXT
);
CREATE INDEX IF NOT EXISTS idx_error_log_waktu ON error_log(waktu);
CREATE INDEX IF NOT EXISTS idx_error_log_sumber ON error_log(sumber);

-- "Picker Member Offline" (Kasir Desktop) -- salinan LOKAL seluruh anggota koperasi aktif (lihat
-- JavaDoc server KantinHelper.anggotaSyncList), dipakai layar Kasir supaya pencarian/pemilihan
-- member tetap berfungsi saat offline (server /PosApi tak terjangkau). SELALU ditimpa per baris
-- (bukan riwayat) -- yang dibutuhkan cuma potret PALING BARU per anggota, sama filosofinya dgn
-- cache_referensi. foto_nama/foto_ukuran adalah METADATA dari server (bukan berkasnya sendiri) --
-- dibandingkan dgn nilai TERAKHIR yg berhasil diunduh sebelum memutuskan unduh ulang (lihat
-- main.js#sinkronkanAnggotaLengkap) supaya foto yg belum berubah tidak diunduh berkali-kali.
-- foto_path_lokal berisi path berkas fisik di folder foto-anggota/ (null bila belum pernah
-- disinkron atau anggota memang tak punya foto).
CREATE TABLE IF NOT EXISTS anggota_cache (
    id INTEGER PRIMARY KEY,
    nama TEXT NOT NULL,
    kode TEXT,
    kode_identitas TEXT,
    hp TEXT,
    telp TEXT,
    email TEXT,
    keterangan TEXT,
    jenis_anggota_koperasi_id INTEGER,
    jenis_nama TEXT,
    wajib_pin INTEGER NOT NULL DEFAULT 0,
    foto_nama TEXT,
    foto_ukuran INTEGER,
    foto_path_lokal TEXT,
    diperbarui_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_anggota_cache_nama ON anggota_cache(nama);
CREATE INDEX IF NOT EXISTS idx_anggota_cache_kode ON anggota_cache(kode);

-- "Cache Lokal Katalog Produk" (gap-closure "pastikan produk disimpan di database lokal, jumlah &
-- stok selalu sama dgn server") -- salinan LOKAL seluruh katalog produk toko ini, pola SAMA PERSIS
-- dgn anggota_cache. Ditulis ulang PENUH (upsert per baris) setiap kali "Sinkronkan Sekarang" ditekan
-- ATAU siklus otomatis berkala berjalan (lihat main.js sinkronkanKatalogProdukLengkap). Dipakai SBG
-- FALLBACK saat offline (layar Produk tetap bisa menampilkan jumlah/stok TERAKHIR diketahui walau
-- server tak terjangkau) -- BUKAN sumber kebenaran saat online (katalog live dari server tetap yg
-- utama, cache ini murni jaring pengaman + acuan "kapan terakhir kali cocok dgn server").
CREATE TABLE IF NOT EXISTS produk_cache (
    id INTEGER PRIMARY KEY,
    kode TEXT,
    barcode TEXT,
    nama TEXT NOT NULL,
    kategori_id INTEGER,
    kategori_nama TEXT,
    harga_beli REAL,
    harga_jual REAL,
    stok REAL,
    aktif INTEGER NOT NULL DEFAULT 1,
    izinkan_jual_minus_stok INTEGER NOT NULL DEFAULT 0,
    keterangan TEXT,
    gambar_url TEXT,
    diperbarui_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_produk_cache_nama ON produk_cache(nama);
CREATE INDEX IF NOT EXISTS idx_produk_cache_kode ON produk_cache(kode);

-- "Sesi Kasir offline-first" -- SUMBER KEBENARAN status Buka/Tutup Kas kini LOKAL, BUKAN server
-- (lihat JavaDoc lengkap di dekat fungsi-fungsi sesiKas* di bawah). kode = idempotensi (SAMA dgn
-- kolom baru koperasi.sesi_kas_kasir.kode di server) -- satu-satunya kunci yg dipakai mencocokkan
-- baris lokal ini dgn baris server sesudah sinkron berhasil, jadi retry sinkron TIDAK PERNAH membuat
-- sesi dobel. total_tunai/total_non_tunai/selisih SENGAJA boleh NULL sampai server benar-benar
-- menghitungnya saat sinkron tutup (lihat JavaDoc sesiKasTutupLokal) -- dihitung dari SELURUH riwayat
-- transaksi toko yg tercatat SERVER, bukan tebakan sisi klien yg cuma lihat transaksi lokal.
CREATE TABLE IF NOT EXISTS sesi_kas_lokal (
    kode TEXT PRIMARY KEY,
    toko_id INTEGER,
    toko_nama TEXT,
    oleh TEXT,
    oleh_id TEXT,
    modal_awal REAL NOT NULL DEFAULT 0,
    keterangan_buka TEXT,
    waktu_buka TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'BUKA',
    waktu_tutup TEXT,
    uang_fisik REAL,
    keterangan_tutup TEXT,
    selisih REAL,
    total_tunai REAL,
    total_non_tunai REAL,
    tersinkron_buka INTEGER NOT NULL DEFAULT 0,
    tersinkron_tutup INTEGER NOT NULL DEFAULT 0,
    id_server INTEGER,
    pesan_error_sync TEXT,
    disimpan_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesi_kas_lokal_status ON sesi_kas_lokal(status);
CREATE INDEX IF NOT EXISTS idx_sesi_kas_lokal_oleh ON sesi_kas_lokal(oleh, oleh_id, toko_id);

-- "Impor Katalog Barang offline-first" (layar Produk, tombol Simpan di Tinjau Impor) -- pola SAMA
-- PERSIS dgn tabel transaksi di atas: SELALU ditulis lokal PENDING dulu SEBELUM dicoba dikirim ke
-- server (baik saat online maupun offline), baris TIDAK PERNAH dihapus (cuma statusnya berubah),
-- supaya batch impor (bisa ratusan baris sekaligus) tidak pernah hilang kalau internet putus TEPAT
-- setelah supervisor klik Simpan. payload = seluruh {baris:[...]} yg dikirim ke aksi server
-- produk_impor_excel_komit; hasil = balikan server APA ADANYA setelah berhasil (ringkasan + detail
-- per-baris), dipakai membangun ulang laporan hasil impor kapan saja tanpa perlu simpan file terpisah.
CREATE TABLE IF NOT EXISTS import_katalog_pending (
    id TEXT PRIMARY KEY,
    toko_id INTEGER,
    jumlah_baris INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    pesan_error TEXT,
    hasil TEXT,
    disimpan_pada TEXT NOT NULL,
    disinkron_pada TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_katalog_status ON import_katalog_pending(status);
`;

/**
 * Membuka (atau membuat bila belum ada) berkas database utama {@code transaksi.db} di {@code dir},
 * mengaktifkan mode WAL, dan memastikan skema tabel ada. AMAN dipanggil berkali-kali (idempoten) --
 * dipanggil sekali saat aplikasi mulai ({@code app.whenReady()} di main.js).
 *
 * @param {string} dir folder data pengguna (biasanya {@code app.getPath('userData')}).
 * @return {import('better-sqlite3').Database} koneksi database siap pakai.
 */
function init(dir) {
    if (db) return db;
    dataDir = dir;
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'transaksi.db');
    db = new Database(dbPath);
    // WAL: penulisan dicatat ke log tambahan dulu sebelum digabung ke berkas utama -- inilah yang
    // memberi ketahanan terhadap mati listrik (baris yang sudah ter-commit ke WAL tetap bisa
    // dipulihkan penuh saat database dibuka lagi, walau proses aplikasi berhenti paksa di tengah).
    db.pragma('journal_mode = WAL');
    // synchronous=FULL: SQLite menunggu OS benar-benar menulis ke disk fisik sebelum melanjutkan --
    // sedikit lebih lambat dari mode default (NORMAL) tapi memberi jaminan tertinggi terhadap mati
    // listrik, yang justru menjadi alasan utama migrasi ke SQLite. Volume transaksi kasir per detik
    // jauh di bawah titik di mana perbedaan ini terasa oleh operator.
    db.pragma('synchronous = FULL');
    db.exec(SKEMA_TABEL);
    // Migrasi kecil utk instalasi LAMA yg databasenya sudah ada sebelum kolom ini ditambahkan --
    // ALTER TABLE ADD COLUMN gagal (bukan IF NOT EXISTS di SQLite) kalau kolom sudah ada, jadi
    // dibungkus try/catch dan diabaikan diam-diam pada instalasi yg sudah punya kolomnya. Lihat
    // JavaDoc errorLogBelumSinkron/tandaiErrorLogTersinkron soal gap-closure "sinkron Log Error ke
    // server" -- kolom ini melacak baris mana yg SUDAH terkirim supaya tak dikirim ulang tiap sinkron.
    try { db.exec('ALTER TABLE error_log ADD COLUMN disinkronkan INTEGER DEFAULT 0'); } catch (e) { /* kolom sudah ada */ }
    return db;
}

/** @return {import('better-sqlite3').Database} koneksi aktif; melempar bila {@link #init} belum dipanggil. */
function getDb() {
    if (!db) throw new Error('local-db belum diinisialisasi -- panggil init(dir) dulu saat app.whenReady().');
    return db;
}

/**
 * Menulis SATU transaksi baru ke tabel dengan status {@code PENDING} -- ini SELALU langkah pertama
 * untuk transaksi apa pun, baik nanti berhasil sinkron online seketika maupun harus menunggu offline.
 * Idempoten: memakai {@code INSERT OR IGNORE} berbasis {@code client_trx_id} sebagai primary key --
 * memanggil ulang dengan id yang sama (mis. retry jaringan) tidak menggandakan baris.
 *
 * @param {{clientTrxId:string, tokoId:?number, kasir:?string, waktu:string, total:number, payload:object}} trx
 * @return {boolean} true bila baris baru benar-benar ditulis; false bila id ini sudah ada sebelumnya
 *         (baris lama TIDAK ditimpa -- payload transaksi tidak boleh berubah setelah pertama ditulis).
 */
function simpanBaru(trx) {
    const stmt = getDb().prepare(`
        INSERT OR IGNORE INTO transaksi
            (client_trx_id, toko_id, kasir, waktu, total, payload, status, disimpan_pada)
        VALUES (@clientTrxId, @tokoId, @kasir, @waktu, @total, @payload, 'PENDING', @disimpanPada)
    `);
    const info = stmt.run({
        clientTrxId: trx.clientTrxId,
        tokoId: trx.tokoId != null ? Number(trx.tokoId) : null,
        kasir: trx.kasir || null,
        waktu: trx.waktu,
        total: Number(trx.total) || 0,
        payload: JSON.stringify(trx),
        disimpanPada: new Date().toISOString()
    });
    return info.changes > 0;
}

/**
 * Menandai satu transaksi sebagai berhasil tersinkron ke server. Baris TIDAK dihapus -- hanya
 * status &amp; {@code disinkron_pada} yang diperbarui, sehingga tetap tersedia sebagai riwayat/cadangan
 * permanen (lihat dokumentasi kelas).
 *
 * @param {string} clientTrxId
 */
function tandaiSinkron(clientTrxId) {
    getDb().prepare(`UPDATE transaksi SET status='SYNCED', disinkron_pada=?, pesan_error=NULL WHERE client_trx_id=?`)
        .run(new Date().toISOString(), clientTrxId);
}

/**
 * Menandai satu transaksi gagal sinkron (server menolak/terjadi error saat mengirim) -- status TETAP
 * {@code PENDING} (bukan status akhir baru) supaya percobaan sinkron berikutnya tetap mengambilnya,
 * hanya {@code pesan_error} yang dicatat untuk keperluan diagnosis oleh admin.
 *
 * @param {string} clientTrxId
 * @param {string} pesan pesan error, dipotong 500 karakter agar tidak membengkakkan berkas database.
 */
function tandaiGagal(clientTrxId, pesan) {
    getDb().prepare(`UPDATE transaksi SET pesan_error=? WHERE client_trx_id=?`)
        .run(String(pesan || '').slice(0, 500), clientTrxId);
}

/**
 * @return {Array<object>} seluruh transaksi berstatus {@code PENDING} (belum pernah berhasil
 *         tersinkron), diurutkan dari yang paling lama menunggu -- dipakai mesin auto-sync untuk tahu
 *         apa saja yang perlu dikirim ulang, dan panel "Status Sinkronisasi" di halaman POS untuk
 *         menampilkannya ke kasir.
 */
function listPending() {
    const rows = getDb().prepare(`SELECT * FROM transaksi WHERE status='PENDING' ORDER BY waktu ASC`).all();
    return rows.map(bariskeObjek);
}

/**
 * @param {{status:?string, dariTanggal:?string, sampaiTanggal:?string, limit:?number, offset:?number}} filter
 * @return {{data:Array<object>, total:number}} daftar transaksi sesuai filter (utk riwayat/inspeksi
 *         lokal, mis. audit manual oleh admin toko) beserta total baris yang cocok (untuk paginasi).
 */
function listSemua(filter) {
    filter = filter || {};
    const kondisi = [];
    const params = {};
    if (filter.status) { kondisi.push('status = @status'); params.status = filter.status; }
    if (filter.dariTanggal) { kondisi.push('waktu >= @dari'); params.dari = filter.dariTanggal; }
    if (filter.sampaiTanggal) { kondisi.push('waktu <= @sampai'); params.sampai = filter.sampaiTanggal; }
    const whereClause = kondisi.length ? ('WHERE ' + kondisi.join(' AND ')) : '';
    const limit = Math.max(1, Math.min(500, Number(filter.limit) || 50));
    const offset = Math.max(0, Number(filter.offset) || 0);

    const total = getDb().prepare(`SELECT COUNT(*) AS n FROM transaksi ${whereClause}`).get(params).n;
    const rows = getDb().prepare(`SELECT * FROM transaksi ${whereClause} ORDER BY waktu DESC LIMIT ${limit} OFFSET ${offset}`).all(params);
    return { data: rows.map(bariskeObjek), total: total };
}

/** @return {string|null} waktu ISO transaksi PALING BARU yang berhasil tersinkron, atau null bila belum pernah ada. */
function waktuSinkronTerakhir() {
    const row = getDb().prepare(`SELECT MAX(disinkron_pada) AS t FROM transaksi WHERE status='SYNCED'`).get();
    return row && row.t ? row.t : null;
}

/**
 * Memindahkan (BUKAN menghapus dari eksistensi, hanya dari tabel utama) transaksi ber-status SYNCED
 * yang lebih tua dari {@code hariBatas} hari ke berkas arsip terpisah bernama
 * {@code arsip-<tahun>-<bulan>.db} di folder data yang sama. Dipakai bila admin merasa
 * {@code transaksi.db} sudah terlalu besar -- OPSIONAL &amp; MANUAL (tidak pernah berjalan otomatis
 * tanpa diminta), dipanggil lewat menu "Pengaturan &gt; Arsipkan Transaksi Lama" di aplikasi.
 * Transaksi yang MASIH {@code PENDING} tidak pernah ikut diarsipkan meski sudah tua, supaya tidak ada
 * transaksi yang belum tersinkron hilang dari radar mesin auto-sync.
 *
 * @param {number} hariBatas arsipkan transaksi SYNCED yang disinkron lebih dari sekian hari lalu.
 * @return {{dipindah:number, berkasArsip:string}} jumlah baris yang dipindah dan lokasi berkas arsip.
 */
function arsipkanLama(hariBatas) {
    const batasTanggal = new Date(Date.now() - (Number(hariBatas) || 90) * 86400000).toISOString();
    const baris = getDb().prepare(`SELECT * FROM transaksi WHERE status='SYNCED' AND disinkron_pada < ?`).all(batasTanggal);
    if (!baris.length) return { dipindah: 0, berkasArsip: null };

    const sekarang = new Date();
    const namaArsip = `arsip-${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}.db`;
    const arsipPath = path.join(dataDir, namaArsip);
    const arsipDb = new Database(arsipPath);
    arsipDb.pragma('journal_mode = WAL');
    arsipDb.exec(SKEMA_TABEL);

    const insertArsip = arsipDb.prepare(`
        INSERT OR IGNORE INTO transaksi
            (client_trx_id, toko_id, kasir, waktu, total, payload, status, pesan_error, disimpan_pada, disinkron_pada)
        VALUES (@client_trx_id, @toko_id, @kasir, @waktu, @total, @payload, @status, @pesan_error, @disimpan_pada, @disinkron_pada)
    `);
    const hapusDariUtama = getDb().prepare(`DELETE FROM transaksi WHERE client_trx_id = ?`);

    const transaksiPindah = getDb().transaction((daftar) => {
        for (const r of daftar) {
            insertArsip.run(r);
            hapusDariUtama.run(r.client_trx_id);
        }
    });
    transaksiPindah(baris);
    arsipDb.close();

    return { dipindah: baris.length, berkasArsip: arsipPath };
}

/**
 * Menyimpan (menimpa) potret data referensi terakhir yang berhasil diambil dari server -- dipanggil
 * SETIAP KALI {@code pos:katalog}/{@code pos:konfigurasi} (lihat handler IPC di main.js) berhasil
 * mengambil data LANGSUNG dari {@code /PosApi} (bukan dari cache), sehingga baris ini selalu
 * merepresentasikan kondisi PALING BARU yang pernah diketahui aplikasi saat online.
 *
 * @param {string} kunci pengenal data, mis. {@code "katalog"} atau {@code "konfigurasi"}.
 * @param {object} data data mentah (akan di-serialize JSON apa adanya).
 */
function simpanCache(kunci, data) {
    getDb().prepare(`
        INSERT INTO cache_referensi (kunci, data, disimpan_pada) VALUES (@kunci, @data, @disimpanPada)
        ON CONFLICT(kunci) DO UPDATE SET data = excluded.data, disimpan_pada = excluded.disimpan_pada
    `).run({ kunci: kunci, data: JSON.stringify(data), disimpanPada: new Date().toISOString() });
}

/**
 * Membaca potret data referensi tersimpan terakhir -- dipanggil sebagai FALLBACK ketika permintaan
 * langsung ke {@code /PosApi} gagal (mis. tidak ada internet), supaya kasir tetap melihat katalog
 * produk & harga (walau berpotensi tidak seratus persen terbaru) alih-alih layar kosong/error.
 *
 * @param {string} kunci
 * @return {{data:object, disimpanPada:string}|null} {@code null} bila belum pernah tersimpan sama
 *         sekali (mis. aplikasi belum pernah berhasil online sejak dipasang) -- pemanggil WAJIB
 *         menangani kasus ini secara eksplisit (pesan "belum ada data tersimpan"), bukan diam-diam
 *         menampilkan katalog kosong seolah itu kondisi normal.
 */
function bacaCache(kunci) {
    const row = getDb().prepare(`SELECT data, disimpan_pada FROM cache_referensi WHERE kunci = ?`).get(kunci);
    if (!row) return null;
    try {
        return { data: JSON.parse(row.data), disimpanPada: row.disimpan_pada };
    } catch (e) {
        return null;
    }
}

/**
 * @return {Array<{kunci:string, disimpanPada:string, data:object|null}>} SELURUH baris {@code
 *         cache_referensi} (data "sinkron MASUK" -- salinan terakhir yang berhasil diambil dari
 *         server), diurutkan dari yang paling baru disimpan. Dipakai halaman "Riwayat
 *         Sinkronisasi" utk menampilkan apa saja yang pernah masuk ke perangkat ini beserta
 *         kapan -- BEDA dari {@link #bacaCache} yang cuma baca SATU kunci utk fallback offline.
 *         {@code data} bisa {@code null} bila baris tersimpan rusak/tak bisa di-parse (jangan
 *         sampai satu baris rusak menggagalkan seluruh daftar).
 */
function listCacheSemua() {
    const rows = getDb().prepare(`SELECT kunci, data, disimpan_pada FROM cache_referensi ORDER BY disimpan_pada DESC`).all();
    return rows.map((r) => {
        let data = null;
        try { data = JSON.parse(r.data); } catch (e) { data = null; }
        return { kunci: r.kunci, disimpanPada: r.disimpan_pada, data: data };
    });
}

/** Mengonversi baris mentah SQLite (kolom snake_case + payload berupa string JSON) ke objek JS siap pakai renderer. */
function bariskeObjek(row) {
    let payload = {};
    try { payload = JSON.parse(row.payload); } catch (e) { payload = {}; }
    return Object.assign({}, payload, {
        clientTrxId: row.client_trx_id,
        tokoId: row.toko_id,
        kasir: row.kasir,
        waktu: row.waktu,
        total: row.total,
        status: row.status,
        pesanError: row.pesan_error,
        disimpanPada: row.disimpan_pada,
        disinkronPada: row.disinkron_pada
    });
}

/**
 * Mencatat SATU baris ke {@code error_log} -- dipanggil dari banyak titik berbeda (lihat JavaDoc
 * tabel di atas): {@code process.on('uncaughtException'/'unhandledRejection')} di main.js,
 * {@code panggilPosApi} tiap kali server menolak/gagal dihubungi, dan dari renderer manapun lewat
 * handler IPC {@code pos:error-log-catat} (dipicu {@code error-capture.js} yg dimuat di setiap
 * halaman, atau pengecekan konsistensi manual mis. anomali sesi kas di pos-renderer.js).
 *
 * <p>Tabel di-jaga tetap ringkas (maks {@code BATAS_BARIS} baris terbaru) dengan pemangkasan baris
 * TERLAMA setiap kelipatan 20 baris baru -- bukan setiap insert (mahal utk tabel besar) maupun tanpa
 * batas sama sekali (bisa membengkak tanpa henti bila error berulang cepat, mis. loop retry
 * jaringan).</p>
 *
 * @param {{sumber:string, tingkat:?string, pesan:string, detail:?string, layar:?string}} entry
 */
const BATAS_BARIS_ERROR_LOG = 5000;
function catatErrorLog(entry) {
    entry = entry || {};
    const info = getDb().prepare(`
        INSERT INTO error_log (waktu, sumber, tingkat, pesan, detail, layar)
        VALUES (@waktu, @sumber, @tingkat, @pesan, @detail, @layar)
    `).run({
        waktu: new Date().toISOString(),
        sumber: String(entry.sumber || 'tidak-diketahui').slice(0, 200),
        tingkat: entry.tingkat === 'peringatan' ? 'peringatan' : 'error',
        pesan: String(entry.pesan || '').slice(0, 1000),
        detail: entry.detail != null ? String(entry.detail).slice(0, 4000) : null,
        layar: entry.layar ? String(entry.layar).slice(0, 100) : null
    });
    if (info.lastInsertRowid % 20 === 0) {
        getDb().prepare(`
            DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT ?)
        `).run(BATAS_BARIS_ERROR_LOG);
    }
    return info.lastInsertRowid;
}

/**
 * @param {{sumber:?string, tingkat:?string, keyword:?string, dariTanggal:?string, sampaiTanggal:?string, limit:?number, offset:?number}} filter
 * @return {{data:Array<object>, total:number}} pola SAMA dgn {@link #listSemua} (transaksi) -- dipakai
 *         layar "Log Error" (log-error.html) utk daftar berpaginasi + filter.
 */
function listErrorLog(filter) {
    filter = filter || {};
    const kondisi = [];
    const params = {};
    if (filter.sumber) { kondisi.push('sumber LIKE @sumber'); params.sumber = '%' + filter.sumber + '%'; }
    if (filter.tingkat) { kondisi.push('tingkat = @tingkat'); params.tingkat = filter.tingkat; }
    if (filter.keyword) { kondisi.push('(pesan LIKE @kw OR detail LIKE @kw)'); params.kw = '%' + filter.keyword + '%'; }
    if (filter.dariTanggal) { kondisi.push('waktu >= @dari'); params.dari = filter.dariTanggal; }
    if (filter.sampaiTanggal) { kondisi.push('waktu <= @sampai'); params.sampai = filter.sampaiTanggal; }
    const whereClause = kondisi.length ? ('WHERE ' + kondisi.join(' AND ')) : '';
    const limit = Math.max(1, Math.min(500, Number(filter.limit) || 100));
    const offset = Math.max(0, Number(filter.offset) || 0);

    const total = getDb().prepare(`SELECT COUNT(*) AS n FROM error_log ${whereClause}`).get(params).n;
    const rows = getDb().prepare(`SELECT * FROM error_log ${whereClause} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`).all(params);
    return { data: rows, total: total };
}

/** Menghapus SATU baris log error berdasarkan id. @param {number} id */
function hapusErrorLog(id) {
    getDb().prepare(`DELETE FROM error_log WHERE id = ?`).run(Number(id));
}

/** Menghapus SELURUH baris log error -- dipakai tombol "Bersihkan Semua" di layar Log Error. */
function bersihkanErrorLog() {
    getDb().prepare(`DELETE FROM error_log`).run();
}

/**
 * Fitur "Sinkronkan Log Error ke Server" -- gap-closure keluhan "admin pusat sulit memantau error
 * yang terjadi di mesin POS lapangan tanpa akses fisik ke perangkatnya". {@code disinkronkan}
 * dipakai sbg penanda cursor sederhana (bukan timestamp/id-based, krn baris bisa dihapus manual
 * kapan saja lewat tombol "Hapus"/"Bersihkan Semua") -- diset 1 SETELAH server mengonfirmasi baris
 * itu tersimpan (lihat {@code tandaiErrorLogTersinkron}), TIDAK optimistic sebelum terkirim, supaya
 * baris yg gagal terkirim (offline) tetap ikut di percobaan sinkron BERIKUTNYA.
 *
 * @param {number} [limit] maksimum baris per batch (default 100 -- payload JSON tak membengkak &
 *        percobaan berikutnya otomatis lanjut ambil sisanya bila lebih banyak dari ini).
 * @return {object[]} baris {@code error_log} yg BELUM pernah berhasil disinkron, terlama dulu (FIFO
 *         -- supaya urutan kronologis di server cocok dgn urutan kejadian sungguhan).
 */
function errorLogBelumSinkron(limit) {
    const n = Math.min(500, Math.max(1, Number(limit) || 100));
    return getDb().prepare(`SELECT * FROM error_log WHERE COALESCE(disinkronkan,0) = 0 ORDER BY id ASC LIMIT ?`).all(n);
}

/** @param {number[]} ids id baris {@code error_log} yg BARU SAJA dikonfirmasi tersimpan di server. */
function tandaiErrorLogTersinkron(ids) {
    if (!ids || ids.length === 0) return;
    const stmt = getDb().prepare(`UPDATE error_log SET disinkronkan = 1 WHERE id = ?`);
    const tandaiSemua = getDb().transaction((daftar) => { for (const id of daftar) stmt.run(Number(id)); });
    tandaiSemua(ids);
}

/**
 * Menyimpan/menimpa SEKUMPULAN baris {@code anggota_cache} sekaligus dalam SATU transaksi SQLite --
 * dipanggil per-batch selama tahap "data" {@code sinkronkanAnggotaLengkap} (main.js), BUKAN satu-satu
 * per anggota (ratusan/ribuan `INSERT` terpisah jauh lebih lambat drpd 1 transaksi berisi banyak
 * `INSERT OR REPLACE`, pola sama dgn {@link #arsipkanLama}'s `getDb().transaction(...)`).
 *
 * @param {Array<{id:number, nama:string, kode:?string, kodeIdentitas:?string, hp:?string, telp:?string,
 *   email:?string, keterangan:?string, jenisAnggotaKoperasiId:?number, jenisNama:?string,
 *   wajibPin:boolean, fotoNama:?string, fotoUkuran:?number}>} daftar dari respons server
 *   {@code anggota_sync_list} (field {@code fotoUrl} SENGAJA tidak disimpan ke tabel -- itu bukan
 *   data anggota, cuma alamat sumber unduhan sementara dipakai tahap "foto", lihat main.js).
 */
function upsertAnggotaCache(daftar) {
    if (!daftar || daftar.length === 0) return;
    const stmt = getDb().prepare(`
        INSERT INTO anggota_cache
            (id, nama, kode, kode_identitas, hp, telp, email, keterangan, jenis_anggota_koperasi_id,
             jenis_nama, wajib_pin, foto_nama, foto_ukuran, diperbarui_pada)
        VALUES (@id, @nama, @kode, @kodeIdentitas, @hp, @telp, @email, @keterangan, @jenisAnggotaKoperasiId,
             @jenisNama, @wajibPin, @fotoNama, @fotoUkuran, @diperbaruiPada)
        ON CONFLICT(id) DO UPDATE SET
            nama=excluded.nama, kode=excluded.kode, kode_identitas=excluded.kode_identitas,
            hp=excluded.hp, telp=excluded.telp, email=excluded.email, keterangan=excluded.keterangan,
            jenis_anggota_koperasi_id=excluded.jenis_anggota_koperasi_id, jenis_nama=excluded.jenis_nama,
            wajib_pin=excluded.wajib_pin, foto_nama=excluded.foto_nama, foto_ukuran=excluded.foto_ukuran,
            diperbarui_pada=excluded.diperbarui_pada
    `);
    const sekarang = new Date().toISOString();
    const tulisSemua = getDb().transaction((baris) => {
        for (const a of baris) {
            stmt.run({
                id: Number(a.id),
                nama: a.nama || '',
                kode: a.kode || null,
                kodeIdentitas: a.kodeIdentitas || null,
                hp: a.hp || null,
                telp: a.telp || null,
                email: a.email || null,
                keterangan: a.keterangan || null,
                jenisAnggotaKoperasiId: a.jenisAnggotaKoperasiId != null ? Number(a.jenisAnggotaKoperasiId) : null,
                jenisNama: a.jenisNama || null,
                wajibPin: a.wajibPin ? 1 : 0,
                fotoNama: a.fotoNama || null,
                fotoUkuran: a.fotoUkuran != null ? Number(a.fotoUkuran) : null,
                diperbaruiPada: sekarang
            });
        }
    });
    tulisSemua(daftar);
}

/**
 * Menimpa SELURUH isi {@code produk_cache} dgn katalog TERBARU dari server, dalam SATU transaksi
 * SQLite -- SENGAJA hapus-lalu-tulis-ulang PENUH (bukan upsert per-baris spt anggota_cache) supaya
 * JUMLAH baris cache SELALU persis sama dgn jumlah produk di server saat ini (gap-closure eksplisit
 * "pastikan jumlah dan stok produk selalu sama dgn server") -- produk yg sudah dihapus/nonaktif total
 * di server ikut hilang dari cache, bukan menumpuk selamanya spt yg akan terjadi dgn upsert biasa
 * (katalog satu toko wajar hanya ratusan/ribuan baris, jauh di bawah titik di mana hapus-tulis-ulang
 * terasa lambat dibanding upsert selektif).
 * @param {Array<{id:number, kode:?string, barcode:?string, nama:string, kategoriId:?number,
 *   kategoriNama:?string, hargaBeli:?number, hargaJual:?number, stok:?number, aktif:boolean,
 *   izinkanJualMinusStok:boolean, keterangan:?string, gambarUrl:?string}>} daftar dari respons server aksi {@code katalog}.
 */
function gantiSemuaProdukCache(daftar) {
    daftar = daftar || [];
    const stmt = getDb().prepare(`
        INSERT INTO produk_cache
            (id, kode, barcode, nama, kategori_id, kategori_nama, harga_beli, harga_jual, stok, aktif,
             izinkan_jual_minus_stok, keterangan, gambar_url, diperbarui_pada)
        VALUES (@id, @kode, @barcode, @nama, @kategoriId, @kategoriNama, @hargaBeli, @hargaJual, @stok, @aktif,
             @izinkanJualMinusStok, @keterangan, @gambarUrl, @diperbaruiPada)
    `);
    const sekarang = new Date().toISOString();
    const tulisSemua = getDb().transaction((baris) => {
        getDb().prepare(`DELETE FROM produk_cache`).run();
        for (const p of baris) {
            stmt.run({
                id: Number(p.id),
                kode: p.kode || null,
                barcode: p.barcode || null,
                nama: p.nama || '',
                kategoriId: p.kategoriId != null ? Number(p.kategoriId) : null,
                kategoriNama: p.kategoriNama || null,
                hargaBeli: p.hargaBeli != null ? Number(p.hargaBeli) : null,
                hargaJual: p.hargaJual != null ? Number(p.hargaJual) : null,
                stok: p.stok != null ? Number(p.stok) : null,
                aktif: p.aktif === false ? 0 : 1,
                izinkanJualMinusStok: p.izinkanJualMinusStok ? 1 : 0,
                keterangan: p.keterangan || null,
                gambarUrl: p.gambarUrl || null,
                diperbaruiPada: sekarang
            });
        }
    });
    tulisSemua(daftar);
    return { total: daftar.length, disinkronPada: sekarang };
}

/**
 * Gap-closure "layar Kasir HANYA baca produk_cache lokal (sangat ringan), jangan pernah panggil
 * server utk daftar produk utama" -- BEDA dari {@link #produkCacheSemua} (dipakai layar admin Produk
 * sbg FALLBACK offline saja, katalog live tetap diutamakan di sana): di sini cache LOKAL SELALU jadi
 * satu-satunya sumber, online atau tidak, krn Kasir cuma butuh render cepat, kesegaran data dijamin
 * siklus sinkron berkala terpisah ({@code sinkronkanKatalogProdukLengkap}, jalan sejak app dibuka,
 * TIDAK terikat layar mana yg sedang aktif). Hanya baris {@code aktif=1} -- produk nonaktif tak
 * pernah relevan di layar checkout. Dipetakan balik ke bentuk camelCase SAMA PERSIS dgn respons aksi
 * server {@code katalog} supaya kode render Kasir yg sudah ada tidak perlu tahu bedanya.
 * @return {{produk:object[], kategori:Array<{id:?number,nama:string}>}}
 */
function produkCacheUntukKasir() {
    const baris = getDb().prepare(`SELECT * FROM produk_cache WHERE aktif = 1 ORDER BY nama ASC`).all();
    const produk = baris.map((p) => ({
        id: p.id,
        kode: p.kode || '',
        barcode: p.barcode || '',
        nama: p.nama || '',
        kategoriId: p.kategori_id,
        kategoriNama: p.kategori_nama || '',
        hargaBeli: p.harga_beli || 0,
        hargaJual: p.harga_jual || 0,
        stok: p.stok || 0,
        aktif: true,
        izinkanJualMinusStok: !!p.izinkan_jual_minus_stok,
        keterangan: p.keterangan || '',
        gambarUrl: p.gambar_url || null
    }));
    const petaKategori = new Map();
    produk.forEach((p) => { if (p.kategoriId != null && !petaKategori.has(p.kategoriId)) petaKategori.set(p.kategoriId, p.kategoriNama); });
    const kategori = Array.from(petaKategori.entries())
        .map(([id, nama]) => ({ id, nama }))
        .sort((a, b) => a.nama.localeCompare(b.nama));
    return { produk, kategori };
}

/**
 * SAMA PERSIS pola {@link #produkCacheUntukKasir} tapi TANPA filter {@code aktif=1} -- dipakai layar
 * admin "Katalog Barang" (produk-renderer.js) yg memang perlu melihat produk Non-Aktif juga (checkbox
 * "Hanya Aktif", default tercentang tapi bisa dilepas). Gap-closure "Memuat katalog barang... macet
 * lama saat internet lambat": layar ini SEBELUMNYA selalu menunggu server (bisa sampai 15 detik),
 * padahal baris cache ini SUDAH ada dari sinkron berkala/manual sebelumnya -- dipakai utk tampilan
 * SEKETIKA sementara data live tetap diminta di latar belakang utk memastikan yg terbaru (lihat
 * muatDaftarProduk di produk-renderer.js). CATATAN: kolom {@code satuanNama}/{@code pemasokNama}
 * (dipakai fitur Cetak PDF/Unduh Excel) TIDAK ada di {@code produk_cache} (skema lebih ramping drpd
 * respons server penuh) -- akan kosong sementara sampai data live menggantikannya, bukan bug.
 * @return {{produk:object[], kategori:Array<{id:?number,nama:string}>, disinkronPada:?string}}
 */
function produkCacheSemua() {
    const baris = getDb().prepare(`SELECT * FROM produk_cache ORDER BY nama ASC`).all();
    const produk = baris.map((p) => ({
        id: p.id,
        kode: p.kode || '',
        barcode: p.barcode || '',
        nama: p.nama || '',
        kategoriId: p.kategori_id,
        kategoriNama: p.kategori_nama || '',
        hargaBeli: p.harga_beli || 0,
        hargaJual: p.harga_jual || 0,
        stok: p.stok || 0,
        aktif: !!p.aktif,
        izinkanJualMinusStok: !!p.izinkan_jual_minus_stok,
        keterangan: p.keterangan || '',
        gambarUrl: p.gambar_url || null
    }));
    const petaKategori = new Map();
    produk.forEach((p) => { if (p.kategoriId != null && !petaKategori.has(p.kategoriId)) petaKategori.set(p.kategoriId, p.kategoriNama); });
    const kategori = Array.from(petaKategori.entries())
        .map(([id, nama]) => ({ id, nama }))
        .sort((a, b) => a.nama.localeCompare(b.nama));
    const terbaru = getDb().prepare(`SELECT MAX(diperbarui_pada) AS w FROM produk_cache`).get();
    return { produk, kategori, disinkronPada: terbaru ? terbaru.w : null };
}

/** @return {{total:number, disinkronPada:?string}} jumlah baris cache + waktu sinkron penuh TERAKHIR (dari baris manapun, semua ditulis serentak dlm 1 transaksi jadi nilainya seragam). */
function ringkasanProdukCache() {
    const total = getDb().prepare(`SELECT COUNT(*) AS n FROM produk_cache`).get().n;
    const terbaru = getDb().prepare(`SELECT MAX(diperbarui_pada) AS w FROM produk_cache`).get();
    return { total: total, disinkronPada: terbaru ? terbaru.w : null };
}

/**
 * SELURUH baris {@code anggota_cache}, dipetakan ke bentuk camelCase SAMA PERSIS dgn respons server
 * {@code anggota_list} -- dipakai layar admin Anggota (anggota-renderer.js) utk paint SEKETIKA
 * sebelum panggilan live selesai, pola SAMA PERSIS {@link #produkCacheSemua}/muatDaftarProduk di
 * produk-renderer.js (gap-closure "layar Anggota selalu blank+spinner sampai server merespons").
 * {@code aktif} SELALU {@code true} -- sinkron cache ({@code anggota_sync_list} server) hanya
 * menarik anggota berstatus aktif, jadi TIDAK ADA kolom {@code aktif} di skema cache ini (BUKAN
 * lupa, lihat CREATE TABLE anggota_cache) -- anggota non-aktif tak pernah masuk cache, cocok dgn
 * default ini.
 * @return {Array<object>} urut nama -- pemanggil yg menyaring/memparanmasi sendiri (cache ini murni
 *         salinan PENUH, tidak ada konsep halaman/keyword di level SQLite).
 */
function anggotaCacheSemua() {
    const baris = getDb().prepare(`SELECT * FROM anggota_cache ORDER BY nama ASC`).all();
    return baris.map((a) => ({
        id: a.id,
        nama: a.nama || '',
        kode: a.kode || '',
        kodeIdentitas: a.kode_identitas || '',
        hp: a.hp || '',
        telp: a.telp || '',
        email: a.email || '',
        keterangan: a.keterangan || '',
        jenisAnggotaKoperasiId: a.jenis_anggota_koperasi_id,
        jenisNama: a.jenis_nama || '',
        wajibPin: !!a.wajib_pin,
        aktif: true
    }));
}

/**
 * Pencarian member di cache LOKAL (offline-first) -- dipakai picker member saat server /PosApi tak
 * terjangkau (lihat JavaDoc {@code cariMember} di main.js utk kapan fallback ini dipicu). TIDAK
 * memuat saldo (cache tak pernah menyimpan saldo -- itu data finansial yg WAJIB real-time, bukan
 * sesuatu yg aman disajikan basi; pemanggil harus menandai jelas ke kasir bahwa ini hasil offline).
 *
 * @param {string} keyword dicocokkan ke nama/kode/kode_identitas (LIKE, case-insensitive default SQLite).
 * @param {number} [limit=30]
 * @return {Array<object>} baris cocok, urut nama.
 */
function cariAnggotaCache(keyword, limit) {
    const kw = '%' + String(keyword || '').trim() + '%';
    const lim = Math.max(1, Math.min(100, Number(limit) || 30));
    return getDb().prepare(`
        SELECT * FROM anggota_cache
        WHERE nama LIKE @kw OR kode LIKE @kw OR kode_identitas LIKE @kw
        ORDER BY nama ASC LIMIT ${lim}
    `).all({ kw: kw });
}

/** @param {number} id @return {object|undefined} SATU baris cache (kolom snake_case mentah) atau undefined bila belum pernah disinkron -- dipakai memperkaya hasil pencarian ONLINE dgn foto lokal (lihat handler {@code pos:cari-member} di main.js), lookup by primary key jadi cepat/tepat (BEDA dari {@link #cariAnggotaCache} yg berbasis LIKE nama/kode). */
function anggotaCacheById(id) {
    return getDb().prepare(`SELECT * FROM anggota_cache WHERE id = ?`).get(Number(id));
}

/** @return {number} id TERTINGGI yang tersimpan di cache -- cursor lanjutan {@code sejak_id} utk batch sinkron berikutnya (0 bila cache kosong/belum pernah sinkron). */
function anggotaCacheMaxId() {
    const row = getDb().prepare(`SELECT MAX(id) AS m FROM anggota_cache`).get();
    return row && row.m ? row.m : 0;
}

/** @return {number} jumlah baris di cache -- ditampilkan di UI picker ("X member tersimpan offline"). */
function hitungAnggotaCache() {
    return getDb().prepare(`SELECT COUNT(*) AS n FROM anggota_cache`).get().n;
}

/** @return {?string} waktu sinkron TERAKHIR (ISO, dari kolom {@code diperbarui_pada}) -- null bila cache kosong. Dipakai layar admin Anggota menampilkan "terakhir disinkron ...", pola sama produk_cache. */
function waktuTerakhirSyncAnggota() {
    const row = getDb().prepare(`SELECT MAX(diperbarui_pada) AS m FROM anggota_cache`).get();
    return row && row.m ? row.m : null;
}

/**
 * Mencatat berkas foto yang BARU SAJA berhasil diunduh ke disk utk satu anggota -- dipanggil tahap
 * "foto" {@code sinkronkanAnggotaLengkap} SETELAH file benar-benar tertulis, supaya {@code
 * foto_nama}/{@code foto_ukuran} lokal (dipakai perbandingan delta-sync berikutnya) selalu
 * mencerminkan berkas yg SUNGGUH ada di {@code foto_path_lokal}, bukan sekadar apa yg tercatat di
 * respons server (kalau tulis-ke-disk gagal di tengah jalan, jangan sampai kolom ini terlanjur
 * ter-update seakan-akan sudah sinkron).
 *
 * @param {number} id
 * @param {string} pathLokal path absolut berkas di folder foto-anggota/.
 * @param {string} namaBerkas nama berkas dari server (dicatat ulang di sini supaya konsisten dgn kolom yg dibaca upsertAnggotaCache).
 * @param {number} ukuranByte ukuran berkas SEBENARNYA di disk (bukan yg dilaporkan server) -- sumber kebenaran utk delta-sync berikutnya.
 */
function updateFotoLokalAnggota(id, pathLokal, namaBerkas, ukuranByte) {
    getDb().prepare(`
        UPDATE anggota_cache SET foto_path_lokal=@path, foto_nama=@nama, foto_ukuran=@ukuran WHERE id=@id
    `).run({ id: Number(id), path: pathLokal, nama: namaBerkas || null, ukuran: ukuranByte != null ? Number(ukuranByte) : null });
}

/**
 * ==== "Sesi Kasir offline-first" ====
 *
 * <p>SUMBER KEBENARAN status Buka/Tutup Kas kini {@code sesi_kas_lokal} (tabel LOKAL), BUKAN lagi
 * server -- dibangun setelah bug lapangan berkepanjangan: layar "Kas Belum Dibuka" macet walau server
 * SUDAH mencatat sesi sukses (root cause akhirnya ditemukan di sisi server -- interceptor audit
 * menimpa identitas kasir -- tapi gejalanya membuktikan SATU hal jelas: kasir tidak boleh bergantung
 * pada round-trip server utk tahu status kasnya sendiri). Sekarang: {@code sesiKasBukaLokal}/{@code
 * sesiKasTutupLokal} SELALU menulis ke sini DULU dan kasir langsung bisa lanjut jualan seketika (tak
 * ada tunggu jaringan sama sekali) -- sinkron ke server ({@code koperasi.sesi_kas_kasir}, idempoten
 * lewat kolom {@code kode} yg sama, lihat javadoc server {@code KantinHelper.sesiKasBuka}) berjalan
 * di LATAR (lihat {@code sinkronkanSesiKasPending} di main.js), kapan pun berhasil -- termasuk kalau
 * kasir sempat offline berjam-jam. Server tetap sumber CATATAN PERMANEN/AUDIT (dan penghitung
 * tunai/non-tunai/selisih yg AKURAT lintas semua transaksi toko, bukan cuma yg terlihat di perangkat
 * ini) -- makanya {@code selisih}/{@code total_tunai}/{@code total_non_tunai} SENGAJA kosong sampai
 * sinkron tutup benar-benar berhasil (lihat {@link #tandaiSinkronTutupSesiKas}).</p>
 */

/**
 * Sesi kas TERBUKA (status='BUKA') milik TOKO ini, kalau ada -- inilah SATU-SATUNYA sumber yg dipakai
 * menjawab "apakah kas sedang terbuka" (tanpa round-trip server sama sekali). Ambil baris TERBARU
 * (seharusnya cuma ada nol atau satu -- gerbang "sudah ada sesi terbuka" dicek LOKAL juga, lihat
 * {@link #sesiKasBukaLokal}).
 *
 * <p>SENGAJA hanya filter {@code toko_id} (bukan juga oleh/olehId spt query serupa di server) --
 * server derive identitas kasir dari TOKEN terautentikasi, BUKAN dari payload klien (lihat
 * {@code identitasKasir(Tbmuser)} di {@code KantinHelper.java}), jadi klien tak pernah benar-benar
 * "tahu" oleh/olehId-nya sendiri secara independen. Dalam praktiknya ini juga sudah cukup: SATU shell
 * Desktop = SATU kasir login aktif dalam satu waktu, jadi tak mungkin ada &gt;1 sesi lokal
 * "milik kasir lain" yang perlu dibedakan di perangkat yang sama.</p>
 */
function sesiKasAktifLokal(tokoId) {
    return getDb().prepare(`
        SELECT * FROM sesi_kas_lokal
        WHERE status = 'BUKA' AND ((@tokoId IS NULL AND toko_id IS NULL) OR toko_id = @tokoId)
        ORDER BY waktu_buka DESC LIMIT 1
    `).get({ tokoId: tokoId != null ? Number(tokoId) : null });
}

/** @param {string} kode @return {object|undefined} SATU baris sesi lokal (kolom snake_case mentah) atau undefined. Dipakai proses sinkron di main.js utk membaca status tersinkron-buka/tutup terkini sebelum memutuskan apa yg perlu dikirim ke server. */
function sesiKasByKode(kode) {
    return getDb().prepare(`SELECT * FROM sesi_kas_lokal WHERE kode = ?`).get(kode);
}

/**
 * Menulis sesi kas BARU ke tabel lokal, status {@code BUKA} -- langkah PERTAMA &amp; SATU-SATUNYA yg
 * ditunggu kasir (sinkron ke server terjadi belakangan, di latar, lihat JavaDoc grup fungsi ini).
 * Idempoten via {@code kode} (primary key) spt {@link #simpanBaru}.
 *
 * @param {{kode:string, tokoId:?number, tokoNama:?string, oleh:string, olehId:string, modalAwal:number, keterangan:?string, waktuBuka:string}} sesi
 * @return {boolean} true bila baris baru benar-benar ditulis.
 */
function sesiKasBukaLokal(sesi) {
    const info = getDb().prepare(`
        INSERT OR IGNORE INTO sesi_kas_lokal
            (kode, toko_id, toko_nama, oleh, oleh_id, modal_awal, keterangan_buka, waktu_buka, status, disimpan_pada)
        VALUES (@kode, @tokoId, @tokoNama, @oleh, @olehId, @modalAwal, @keterangan, @waktuBuka, 'BUKA', @disimpanPada)
    `).run({
        kode: sesi.kode,
        tokoId: sesi.tokoId != null ? Number(sesi.tokoId) : null,
        tokoNama: sesi.tokoNama || null,
        oleh: sesi.oleh || '',
        olehId: sesi.olehId || '',
        modalAwal: Number(sesi.modalAwal) || 0,
        keterangan: sesi.keterangan || null,
        waktuBuka: sesi.waktuBuka,
        disimpanPada: new Date().toISOString()
    });
    return info.changes > 0;
}

/** Menandai sesi (by kode) berhasil tersinkron BUKA-nya ke server -- {@code idServer} dicatat utk referensi/debug, TIDAK dipakai query lain (semua pencarian tetap lewat {@code kode}). */
function tandaiSinkronBukaSesiKas(kode, idServer) {
    getDb().prepare(`UPDATE sesi_kas_lokal SET tersinkron_buka=1, id_server=?, pesan_error_sync=NULL WHERE kode=?`)
        .run(idServer != null ? Number(idServer) : null, kode);
}

/**
 * Menutup sesi (by kode) LOKAL -- status jadi {@code TUTUP} seketika (kasir tak perlu tunggu
 * jaringan), TAPI {@code selisih}/{@code total_tunai}/{@code total_non_tunai} SENGAJA dibiarkan NULL
 * sampai sinkron tutup ke server sukses (lihat {@link #tandaiSinkronTutupSesiKas}) -- server yg
 * menghitungnya scr akurat dari SELURUH transaksi toko selama sesi ini, bukan tebakan sisi klien.
 *
 * @param {string} kode
 * @param {{uangFisik:number, keterangan:?string, waktuTutup:string}} data
 */
function sesiKasTutupLokal(kode, data) {
    getDb().prepare(`
        UPDATE sesi_kas_lokal
        SET status='TUTUP', waktu_tutup=@waktuTutup, uang_fisik=@uangFisik, keterangan_tutup=@keterangan
        WHERE kode=@kode
    `).run({
        kode: kode,
        waktuTutup: data.waktuTutup,
        uangFisik: Number(data.uangFisik) || 0,
        keterangan: data.keterangan || null
    });
}

/** Menandai sesi (by kode) berhasil tersinkron TUTUP-nya ke server, DITAMBAH hasil hitungan AKURAT dari server (selisih/total tunai/non-tunai) -- lihat JavaDoc grup fungsi ini kenapa nilai ini tak pernah dihitung sendiri di klien. */
function tandaiSinkronTutupSesiKas(kode, hasilServer) {
    getDb().prepare(`
        UPDATE sesi_kas_lokal
        SET tersinkron_tutup=1, selisih=@selisih, total_tunai=@totalTunai, total_non_tunai=@totalNonTunai, pesan_error_sync=NULL
        WHERE kode=@kode
    `).run({
        kode: kode,
        selisih: hasilServer && hasilServer.selisih != null ? Number(hasilServer.selisih) : null,
        totalTunai: hasilServer && hasilServer.totalTunai != null ? Number(hasilServer.totalTunai) : null,
        totalNonTunai: hasilServer && hasilServer.totalNonTunai != null ? Number(hasilServer.totalNonTunai) : null
    });
}

/** Mencatat pesan kegagalan sinkron TERAKHIR (buka maupun tutup) -- murni informatif utk kasir/Log Error, tidak menghentikan retry berikutnya. */
function tandaiGagalSinkronSesiKas(kode, pesan) {
    getDb().prepare(`UPDATE sesi_kas_lokal SET pesan_error_sync=? WHERE kode=?`)
        .run(String(pesan || '').slice(0, 500), kode);
}

/** @return {Array<object>} seluruh sesi yg BELUM tuntas tersinkron (buka belum sinkron, ATAU sudah tutup tapi tutup-nya belum sinkron) -- diproses berurutan (waktu_buka ASC) oleh {@code sinkronkanSesiKasPending} di main.js. */
function sesiKasBelumSinkron() {
    return getDb().prepare(`
        SELECT * FROM sesi_kas_lokal
        WHERE tersinkron_buka = 0 OR (status = 'TUTUP' AND tersinkron_tutup = 0)
        ORDER BY waktu_buka ASC
    `).all();
}

/**
 * Menulis SATU batch impor katalog baru ke tabel dgn status {@code PENDING} -- SELALU langkah
 * pertama sebelum mencoba kirim ke server sama sekali, sama filosofinya dgn {@link #simpanBaru}
 * utk transaksi. Idempoten via {@code id} (PK) -- id dibangkitkan proses utama (bukan renderer)
 * saat handler {@code pos:produk-komit-excel} dipanggil.
 *
 * @param {{id:string, tokoId:?number, baris:Array<object>, nonaktifkanTakDitemukan:?boolean}} batch
 */
function simpanImporKatalogBaru(batch) {
    const stmt = getDb().prepare(`
        INSERT OR IGNORE INTO import_katalog_pending
            (id, toko_id, jumlah_baris, payload, status, disimpan_pada)
        VALUES (@id, @tokoId, @jumlahBaris, @payload, 'PENDING', @disimpanPada)
    `);
    stmt.run({
        id: batch.id,
        tokoId: batch.tokoId != null ? Number(batch.tokoId) : null,
        jumlahBaris: (batch.baris || []).length,
        // nonaktifkanTakDitemukan disisipkan ke JSON payload yg sama (bukan kolom baru) -- checkbox
        // "Nonaktifkan produk yang tidak ada di file ini" perlu IKUT tersimpan supaya batch yg tadinya
        // offline (disinkron nanti oleh sinkronkanImporKatalogPending) tetap menjalankan langkah
        // nonaktifkan itu setelah benar2 tersinkron, bukan cuma saat dikirim langsung.
        payload: JSON.stringify({ toko_id: batch.tokoId, baris: batch.baris || [], nonaktifkanTakDitemukan: !!batch.nonaktifkanTakDitemukan }),
        disimpanPada: new Date().toISOString()
    });
}

/** Menandai satu batch impor katalog berhasil tersinkron -- {@code hasil} (balikan server APA ADANYA) disimpan supaya laporan bisa dibangun ulang kapan saja tanpa perlu file terpisah. Baris TIDAK dihapus (riwayat permanen, sama filosofinya dgn tabel transaksi). */
function tandaiImporKatalogSinkron(id, hasil) {
    getDb().prepare(`UPDATE import_katalog_pending SET status='SYNCED', hasil=?, disinkron_pada=?, pesan_error=NULL WHERE id=?`)
        .run(JSON.stringify(hasil || {}), new Date().toISOString(), id);
}

/** Menandai satu batch impor katalog gagal sinkron -- status TETAP {@code PENDING} (bukan status akhir baru, sama pola dgn {@link #tandaiGagal}) supaya percobaan berkala berikutnya tetap mengambilnya. */
function tandaiImporKatalogGagal(id, pesan) {
    getDb().prepare(`UPDATE import_katalog_pending SET pesan_error=? WHERE id=?`)
        .run(String(pesan || '').slice(0, 500), id);
}

/** @return {Array<object>} seluruh batch impor katalog berstatus {@code PENDING}, diurutkan dari yg paling lama menunggu -- dipakai mesin auto-sync berkala. */
function listImporKatalogPending() {
    const rows = getDb().prepare(`SELECT * FROM import_katalog_pending WHERE status='PENDING' ORDER BY disimpan_pada ASC`).all();
    return rows.map(barisImporKeObjek);
}

/** @param {string} id @return {object|undefined} satu batch impor katalog (PENDING maupun SYNCED) -- dipakai renderer memuat ulang laporan hasil impor kapan saja, termasuk setelah aplikasi ditutup-buka lagi. */
function ambilImporKatalog(id) {
    const row = getDb().prepare(`SELECT * FROM import_katalog_pending WHERE id=?`).get(id);
    return row ? barisImporKeObjek(row) : undefined;
}

function barisImporKeObjek(row) {
    let baris = [];
    let tokoIdPayload = null;
    let nonaktifkanTakDitemukan = false;
    try {
        const p = JSON.parse(row.payload);
        baris = p.baris || []; tokoIdPayload = p.toko_id; nonaktifkanTakDitemukan = !!p.nonaktifkanTakDitemukan;
    } catch (e) { /* payload korup -- abaikan, laporan tetap tampil tanpa detail baris asal */ }
    let hasil = null;
    if (row.hasil) { try { hasil = JSON.parse(row.hasil); } catch (e) { /* abaikan */ } }
    return {
        id: row.id, tokoId: row.toko_id != null ? row.toko_id : tokoIdPayload, jumlahBaris: row.jumlah_baris,
        baris: baris, nonaktifkanTakDitemukan: nonaktifkanTakDitemukan, status: row.status, pesanError: row.pesan_error, hasil: hasil,
        disimpanPada: row.disimpan_pada, disinkronPada: row.disinkron_pada
    };
}

module.exports = {
    init,
    simpanBaru,
    tandaiSinkron,
    tandaiGagal,
    listPending,
    listSemua,
    simpanImporKatalogBaru,
    tandaiImporKatalogSinkron,
    tandaiImporKatalogGagal,
    listImporKatalogPending,
    ambilImporKatalog,
    waktuSinkronTerakhir,
    arsipkanLama,
    simpanCache,
    bacaCache,
    listCacheSemua,
    catatErrorLog,
    listErrorLog,
    hapusErrorLog,
    bersihkanErrorLog,
    errorLogBelumSinkron,
    tandaiErrorLogTersinkron,
    gantiSemuaProdukCache,
    produkCacheSemua,
    produkCacheUntukKasir,
    ringkasanProdukCache,
    upsertAnggotaCache,
    cariAnggotaCache,
    anggotaCacheSemua,
    anggotaCacheById,
    anggotaCacheMaxId,
    hitungAnggotaCache,
    waktuTerakhirSyncAnggota,
    updateFotoLokalAnggota,
    sesiKasAktifLokal,
    sesiKasByKode,
    sesiKasBukaLokal,
    tandaiSinkronBukaSesiKas,
    sesiKasTutupLokal,
    tandaiSinkronTutupSesiKas,
    tandaiGagalSinkronSesiKas,
    sesiKasBelumSinkron
};
