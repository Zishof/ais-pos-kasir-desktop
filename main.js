/**
 * main.js -- Proses utama (main process) shell desktop AIS POS Kasir.
 *
 * Aplikasi ini BUKAN aplikasi POS baru -- ia adalah "jendela pembungkus" (shell) native Windows di
 * atas aplikasi web AIS yang sudah ada (JSP+ZK+Hibernate, lihat pos.jsp/_pos.jsp di server). Seluruh
 * logika kasir, offline-first (IndexedDB), dan sinkronisasi TETAP berjalan di dalam halaman web yang
 * dimuat -- Chromium bawaan Electron mendukung IndexedDB dan BroadcastChannel secara native, sehingga
 * fitur-fitur itu langsung berfungsi tanpa perubahan kode tambahan di sisi web.
 *
 * Yang BENAR-BENAR baru di lapisan shell ini (tidak bisa dilakukan browser biasa):
 *  1. Wizard pengaturan alamat server (host/contextpath/HTTPS-HTTP) yang WAJIB diisi sebelum aplikasi
 *     bisa dipakai -- disimpan lokal ke berkas config.json di folder data pengguna, dibaca ulang tiap
 *     aplikasi dibuka (lihat readConfig/writeConfig).
 *  2. Layar Pelanggan sebagai BrowserWindow NATIVE yang otomatis diposisikan ke monitor KEDUA bila
 *     perangkat memang punya dua layar (lihat openCustomerWindow) -- bukan sekadar popup browser biasa
 *     yang harus digeser manual oleh kasir.
 *  3. Jembatan IPC (lihat preload.js) supaya halaman POS di dalam jendela utama bisa memerintahkan
 *     "buka/tutup Layar Pelanggan" ke proses native ini lewat window.electronAPI, dipakai tombol
 *     "Layar Pelanggan" yang SUDAH ADA di _pos.jsp (lihat bukaLayarPelanggan() di sana -- method itu
 *     sudah diperbarui untuk lebih memilih window.electronAPI ketika tersedia, jatuh ke window.open()
 *     biasa bila dijalankan di browser biasa).
 *
 * DESAIN: setup-saat-pertama-dibuka, BUKAN halaman kustom di dalam installer NSIS. Pendekatan ini
 * dipilih sengaja karena jauh lebih aman/teruji dibanding menulis skrip NSIS kustom yang sulit
 * diverifikasi tanpa lingkungan Windows nyata -- dari sudut pandang pengguna awam, wizard ini tetap
 * terasa sebagai "bagian dari memasang aplikasi" karena muncul otomatis tepat setelah instalasi
 * selesai dan aplikasi dijalankan pertama kali, dan TIDAK BISA DILEWATI (aplikasi tidak akan membuka
 * jendela POS sebelum alamat server tersimpan).
 *
 *  4. Penyimpanan transaksi lokal PERSISTEN via SQLite ({@link ./local-db.js}, bukan IndexedDB) --
 *     tahan mati listrik (mode WAL), tidak pernah dihapus meski sudah tersinkron (jadi juga berfungsi
 *     sebagai cadangan/arsip), dan diakses halaman POS lewat window.electronAPI.localDb (lihat
 *     handler IPC "local-db:*" di bawah). Ini KHUSUS shell desktop -- versi browser biasa (tanpa
 *     Electron) tetap memakai IndexedDB seperti sebelumnya lewat ais_pos_offline.js.
 *  5. Layar login LOKAL (login.html, lihat openLoginWindow) menggantikan halaman login2.jsp bawaan
 *     server sebagai layar PERTAMA yang dibuka setelah alamat server tersimpan -- render-nya instan
 *     (tanpa menunggu unduh CSS tema institusi/CDN Bootstrap/gambar latar dari server) karena murni
 *     berkas lokal. Otentikasi TETAP memakai endpoint server yang SAMA PERSIS dengan yang dipakai
 *     login2.jsp ({@code POST <root>/login?action=ajax_login}, lihat Login.java), hanya saja
 *     permintaannya dijalankan di proses UTAMA (lihat {@link #prosesLoginServer}) alih-alih fetch()
 *     di halaman yang dimuat dari domain server -- setelah sukses, cookie sesi yang didapat dari
 *     server DITERAPKAN LANGSUNG ke {@code session.defaultSession} sebelum jendela kasir utama
 *     memuat halaman /main, sehingga pengguna tidak pernah melihat halaman login2.jsp aslinya sama
 *     sekali. Lihat JavaDoc {@link #prosesLoginServer} untuk alasan lengkap pendekatan ini.
 */
const { app, BrowserWindow, ipcMain, screen, Menu, dialog, session, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const localDb = require('./local-db.js');
const { autoUpdater } = require('electron-updater');
const { execFile } = require('child_process');

/** Lokasi berkas konfigurasi tersimpan (per akun Windows, aman lintas-update aplikasi). */
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
/** Lokasi berkas log error (dibaca manual bila pengguna melapor "aplikasi tiba-tiba tertutup/error"). */
const LOG_PATH = path.join(app.getPath('userData'), 'error.log');
/**
 * Fitur "Konfigurasi" (Kasir Desktop) -- tampilan aplikasi LOKAL (judul + logo), SENGAJA di berkas
 * TERPISAH dari {@link CONFIG_PATH} (bukan digabung ke sana) supaya menyimpan branding TIDAK PERNAH
 * bisa merusak/menimpa konfigurasi server (host/contextPath/https) yang jauh lebih kritikal --
 * {@link readConfig} secara ketat mensyaratkan {@code cfg.host} utk dianggap valid, jadi objek yang
 * salah bentuk yg ditulis dari alur branding bisa berakibat wizard pengaturan server terpicu ulang
 * tanpa sengaja. Murni kosmetik (judul jendela + logo sidebar) -- TIDAK dikirim ke server sama sekali.
 */
const BRANDING_PATH = path.join(app.getPath('userData'), 'branding.json');

/**
 * Preferensi "Update Otomatis" (mirip Windows Update) -- berkas TERPISAH dari {@link CONFIG_PATH}
 * dengan alasan sama seperti {@link BRANDING_PATH}: preferensi ini murni pilihan kasir/kios, tidak
 * boleh berisiko merusak/menimpa konfigurasi server (host/contextPath/https) yang jauh lebih
 * kritikal bila suatu saat digabung ke berkas yang sama.
 */
const UPDATE_PREF_PATH = path.join(app.getPath('userData'), 'update-preferensi.json');

/**
 * Fitur "Identitas Mesin POS" -- gap-closure "toko dgn banyak mesin POS, transaksi harus bisa
 * dibedakan mesin asalnya". Berkas TERPISAH (pola sama dgn {@link BRANDING_PATH}/
 * {@link UPDATE_PREF_PATH}) supaya identitas mesin tak pernah berisiko merusak konfigurasi server.
 * {@code idMesin} di-generate SEKALI (UUID v4) saat pertama dibaca dan tak pernah berubah -- itu
 * yang membedakan mesin secara pasti (dua mesin bisa saja diberi nama sama oleh admin yg lupa, ID
 * tetap unik). {@code namaMesin} diisi admin lewat layar Konfigurasi, boleh kosong (fallback ke
 * potongan {@code idMesin} saat ditampilkan bila belum diisi).
 */
const MESIN_PATH = path.join(app.getPath('userData'), 'identitas-mesin.json');

/** @return {{idMesin:string, namaMesin:string}} identitas mesin ini -- idMesin di-generate+disimpan otomatis bila belum ada. */
function bacaIdentitasMesin() {
    try {
        const raw = fs.readFileSync(MESIN_PATH, 'utf8');
        const m = JSON.parse(raw);
        if (m && m.idMesin) return { idMesin: String(m.idMesin), namaMesin: String(m.namaMesin || '') };
    } catch (e) { /* belum pernah dibuat / rusak -- generate baru di bawah */ }
    const baru = { idMesin: crypto.randomUUID(), namaMesin: '' };
    try {
        fs.mkdirSync(path.dirname(MESIN_PATH), { recursive: true });
        fs.writeFileSync(MESIN_PATH, JSON.stringify(baru, null, 2), 'utf8');
    } catch (e) { /* gagal tulis -- tetap kembalikan ID in-memory supaya checkout tak diblokir */ }
    return baru;
}

/** @param {string} namaMesin @return {{idMesin:string, namaMesin:string}} identitas mesin setelah nama diperbarui (idMesin tidak pernah berubah). */
function simpanNamaMesin(namaMesin) {
    const skrg = bacaIdentitasMesin();
    const baru = { idMesin: skrg.idMesin, namaMesin: String(namaMesin || '').trim() };
    fs.mkdirSync(path.dirname(MESIN_PATH), { recursive: true });
    fs.writeFileSync(MESIN_PATH, JSON.stringify(baru, null, 2), 'utf8');
    return baru;
}

/** @return {{otomatis:boolean}} preferensi update tersimpan, default {otomatis:false} bila belum pernah diatur/berkas rusak. */
function bacaPreferensiUpdate() {
    try {
        const raw = fs.readFileSync(UPDATE_PREF_PATH, 'utf8');
        const p = JSON.parse(raw);
        return { otomatis: !!(p && p.otomatis) };
    } catch (e) {
        return { otomatis: false };
    }
}

/** @param {boolean} otomatis */
function simpanPreferensiUpdate(otomatis) {
    fs.mkdirSync(path.dirname(UPDATE_PREF_PATH), { recursive: true });
    fs.writeFileSync(UPDATE_PREF_PATH, JSON.stringify({ otomatis: !!otomatis }, null, 2), 'utf8');
    return { otomatis: !!otomatis };
}

/**
 * Menulis satu baris log bertimestamp ke {@link LOG_PATH} -- dipanggil dari
 * {@code process.on('uncaughtException'/'unhandledRejection')} di bawah DAN dari titik-titik
 * {@code app.quit()} yg dipicu penutupan jendela (lihat {@link #catatKeluarJikaJendelaTerakhir}),
 * supaya baik crash tak terduga MAUPUN keluar-tiba-tiba yg ternyata cuma alur normal (bukan crash)
 * sama-sama meninggalkan jejak yg bisa dibedakan dan diperiksa nanti -- daripada aplikasi diam-diam
 * tertutup tanpa penjelasan sama sekali.
 * @param {string} label
 * @param {*} err
 */
function tulisLog(label, err) {
    try {
        const baris = '[' + new Date().toISOString() + '] ' + label + ': '
            + (err && err.stack ? err.stack : String(err)) + '\n';
        fs.appendFileSync(LOG_PATH, baris, 'utf8');
    } catch (e) { /* logging gagal tak boleh ikut menjatuhkan aplikasi */ }
}

/**
 * Menu "Log Error" (Desktop) -- pembungkus AMAN {@code localDb.catatErrorLog} (lihat JavaDoc tabel
 * {@code error_log} di local-db.js) dipakai di SELURUH titik penangkap error proses utama:
 * {@code uncaughtException}/{@code unhandledRejection} global di bawah, dan {@code panggilPosApi}
 * setiap kali server menolak/tak terjangkau. "Aman" berarti TIDAK PERNAH melempar -- dipanggil dari
 * dalam error-handler itu sendiri, jadi kegagalan menulis log (mis. local-db belum sempat
 * {@code init()} saat startup sangat awal) tidak boleh menimbulkan error baru yg menutupi error asli.
 *
 * @param {{sumber:string, tingkat:?string, pesan:string, detail:?string, layar:?string}} entry
 */
function catatErrorLogAman(entry) {
    try {
        const id = localDb.catatErrorLog(entry);
        kirimSatuErrorLogSegera(id, entry);
    } catch (e) { /* local-db belum siap atau gagal tulis -- diamkan, tulisLog(file teks) tetap jalan sbg cadangan */ }
}

/**
 * Kirim SATU baris error log SEGERA ke server (gap-closure "begitu terjadi", bukan cuma nunggu batch
 * 60 detik di {@link #sinkronkanErrorLogPending}) -- fire-and-forget lewat {@link #requestHttp}
 * LANGSUNG, SENGAJA BUKAN lewat {@link #panggilPosApi}: panggilPosApi memanggil catatErrorLogAman lagi
 * saat gagal, yang disini akan memicu kirimSatuErrorLogSegera lagi -> REKURSI TANPA AKHIR persis pada
 * skenario paling mungkin (server tak terjangkau = PENYEBAB error asli DAN penyebab kirim-segera ini
 * gagal juga). Kegagalan di sini karena itu HARUS diam total (tidak pernah memanggil catatErrorLogAman)
 * -- baris tetap tersimpan lokal (sudah ditulis SEBELUM fungsi ini dipanggil) & diambil siklus batch
 * 60 detik berikutnya sbg jaring pengaman kalau percobaan segera ini gagal/offline.
 * @param {number} id baris {@code error_log} lokal yg baru ditulis.
 * @param {{sumber:string, tingkat:?string, pesan:string, detail:?string, layar:?string}} entry
 */
function kirimSatuErrorLogSegera(id, entry) {
    try {
        if (modeOffline) return;
        const cfg = readConfig();
        if (!cfg || !posApiToken) return; // belum ada sesi -- biar batch 60 detik nanti yg coba
        const m = bacaIdentitasMesin();
        const namaMesinKirim = m.namaMesin && m.namaMesin.trim() ? m.namaMesin.trim() : ('Mesin-' + m.idMesin.slice(0, 8));
        const body = JSON.stringify({
            action: 'error_log_kirim',
            platform: 'Desktop',
            nama_mesin: namaMesinKirim,
            baris: [{
                waktu: new Date().toISOString(), sumber: entry.sumber,
                tingkat: entry.tingkat === 'peringatan' ? 'peringatan' : 'error',
                pesan: entry.pesan, detail: entry.detail, layar: entry.layar
            }]
        });
        requestHttp(buildBaseUrl(cfg) + 'PosApi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(body), 'Authorization': 'Bearer ' + posApiToken },
            body: body,
            timeout: 5000
        }).then((hasil) => {
            try {
                const json = JSON.parse(hasil.body);
                if (json && json.status === 'success' && id) localDb.tandaiErrorLogTersinkron([id]);
            } catch (e) { /* diam -- batch 60 detik akan coba lagi */ }
        }).catch(() => { /* diam -- batch 60 detik akan coba lagi */ });
    } catch (e) { /* diam total -- JANGAN PERNAH panggil catatErrorLogAman dari sini */ }
}

/**
 * Menyamarkan field bernuansa kata sandi (mis. {@code password}, {@code password_lama},
 * {@code password_baru}, {@code pass}) sebelum sebuah payload permintaan API ditulis ke
 * {@code error_log} -- {@code catatErrorLogAman} dipanggil dari {@code panggilPosApi} yg generik utk
 * SEMUA aksi termasuk {@code akun_ganti_password}/{@code akun_tambah}, jadi payload mentahnya BISA
 * memuat kata sandi asli; log error tidak boleh jadi kebocoran kredensial.
 *
 * @param {object} payload
 * @return {string} JSON string aman utk disimpan sbg {@code detail}.
 */
function payloadUntukLogAman(action, payload) {
    try {
        const disamarkan = {};
        const sumber = payload || {};
        for (const k in sumber) {
            if (!Object.prototype.hasOwnProperty.call(sumber, k)) continue;
            disamarkan[k] = /pass/i.test(k) ? '(disamarkan)' : sumber[k];
        }
        return JSON.stringify({ action: action, payload: disamarkan });
    } catch (e) {
        return '(gagal serialisasi payload)';
    }
}

/**
 * Dipanggil dari handler {@code 'closed'} jendela wizard/login sebelum memutuskan
 * {@code app.quit()} -- MENCATAT ke {@link LOG_PATH} kapan pun keputusan itu diambil. Ini BUKAN
 * fungsi pencegah quit (perilaku "keluar kalau tak ada jendela kasir lain" tetap sengaja/normal utk
 * penutupan manual oleh pengguna) -- tapi kalau baris ini muncul di log TEPAT setelah login/tes
 * koneksi sukses, itu pertanda kuat bug urutan buka/tutup jendela sudah kembali (regresi dari bug
 * yg pernah terjadi: {@code loginWindow.destroy()} dipanggil sebelum {@code openMainWindow()} sempat
 * mengisi variabel {@code mainWindow}, membuat pengecekan {@code !mainWindow} keliru menganggap tak
 * ada jendela lain yg akan dibuka).
 * @param {string} labelJendela nama jendela yg baru saja tertutup, mis. {@code "wizard pengaturan"}.
 */
function catatKeluarJikaJendelaTerakhir(labelJendela) {
    tulisLog('app.quit', 'Jendela "' + labelJendela + '" ditutup tanpa jendela kasir utama aktif -- aplikasi keluar. '
        + 'Ini NORMAL bila pengguna menutup jendela secara manual (klik X). Bila ini terjadi tepat setelah '
        + 'login/tes koneksi sukses, laporkan sebagai bug.');
}

/** Lokasi kredensial "Ingat Saya" tersimpan (username + kata sandi terenkripsi, lihat {@link #simpanKredensialDiingat}). */
const REMEMBER_PATH = path.join(app.getPath('userData'), 'remember.json');

/**
 * Menyimpan kredensial "Ingat Saya" ke disk, kata sandi DIENKRIPSI lewat {@code safeStorage} Electron
 * (di Windows terikat DPAPI akun Windows yg sedang login -- berkasnya tak bisa didekripsi kalau
 * disalin ke perangkat/akun lain). Dipanggil dari handler {@code login:submit} setelah login manual
 * sukses DAN checkbox "Ingat akun saya" dicentang.
 * @param {string} username
 * @param {string} password
 */
function simpanKredensialDiingat(username, password) {
    try {
        if (!safeStorage.isEncryptionAvailable()) {
            tulisLog('simpanKredensialDiingat', 'safeStorage tidak tersedia di perangkat ini -- kredensial "Ingat Saya" TIDAK disimpan (fitur nonaktif, bukan error fatal).');
            return;
        }
        const terenkripsi = safeStorage.encryptString(password).toString('base64');
        fs.writeFileSync(REMEMBER_PATH, JSON.stringify({ username: username, password: terenkripsi }), 'utf8');
    } catch (e) { tulisLog('simpanKredensialDiingat', e); }
}

/**
 * Membaca+mendekripsi kredensial "Ingat Saya" tersimpan. Dipanggil dari handler {@code login:coba-auto}
 * begitu layar login dibuka, SEBELUM menampilkan form login manual -- lihat JavaDoc handler tsb.
 * @return {{username:string, password:string}|null} {@code null} bila belum pernah disimpan, berkas
 *         rusak, atau {@code safeStorage} tak tersedia (semua diperlakukan sbg "tidak ada yg diingat",
 *         bukan error -- jatuh ke form login manual seperti biasa).
 */
function bacaKredensialDiingat() {
    try {
        if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(REMEMBER_PATH)) return null;
        const raw = JSON.parse(fs.readFileSync(REMEMBER_PATH, 'utf8'));
        if (!raw || !raw.username || !raw.password) return null;
        const password = safeStorage.decryptString(Buffer.from(raw.password, 'base64'));
        return { username: raw.username, password: password };
    } catch (e) {
        tulisLog('bacaKredensialDiingat', e);
        return null;
    }
}

/**
 * Menghapus kredensial "Ingat Saya" tersimpan (bila ada) -- dipanggil saat: (1) login manual sukses
 * TAPI checkbox "Ingat akun saya" TIDAK dicentang (permintaan eksplisit tidak mau diingat lagi),
 * (2) auto-login diam-diam GAGAL (kredensial tersimpan sudah usang -- akun nonaktif/kata sandi
 * berubah/dst, tak ada gunanya dipertahankan), (3) alamat server diganti (kredensial lama tak relevan
 * lagi utk server baru), (4) tombol "Keluar Akun (Logout)" ditekan dari menu.
 */
function hapusKredensialDiingat() {
    try { if (fs.existsSync(REMEMBER_PATH)) fs.unlinkSync(REMEMBER_PATH); } catch (e) { tulisLog('hapusKredensialDiingat', e); }
}

/**
 * Lokasi hash verifikasi "Login Mode Offline" (lihat {@link #simpanHashOfflineLogin}). Berkas
 * TERPISAH dari {@link #REMEMBER_PATH} secara sengaja -- ini bukan salinan kedua dari kata sandi
 * (hash satu-arah, tidak bisa didekripsi balik jadi kata sandi asli), murni alat verifikasi lokal.
 */
const OFFLINE_LOGIN_PATH = path.join(app.getPath('userData'), 'offline-login.json');

/**
 * Menyimpan hash (satu-arah, {@code scrypt} + salt acak per akun -- modul builtin Node {@code crypto},
 * TANPA dependency baru) dari kata sandi akun yang BARU SAJA berhasil login online DENGAN checkbox
 * "Ingat akun saya" dicentang. Dipanggil dari handler {@code login:submit} tepat setelah
 * {@link #simpanKredensialDiingat}.
 *
 * <p>Kenapa disimpan HANYA saat {@code rememberMe} true: kemampuan "Masuk Mode Offline" (lihat handler
 * {@code login:coba-offline}) sengaja dibatasi utk akun yang sudah dipercayakan pengguna ke perangkat
 * ini lewat "Ingat akun saya" -- tidak menambah permukaan risiko baru di luar apa yang pengguna sendiri
 * sudah setujui tersimpan di perangkat (yang hari ini pun sudah berupa kata sandi ter-enkripsi-reversibel
 * lewat {@code safeStorage}, lihat {@link #simpanKredensialDiingat}).</p>
 *
 * <p>Kenapa {@code scrypt} bukan sekadar {@code sha256}: scrypt sengaja lambat/berat-memori sehingga
 * jauh lebih tahan brute-force seandainya berkas ini bocor -- meski risikonya sudah rendah krn hanya
 * dipakai utk VERIFIKASI lokal (bukan lintas-jaringan) dan perangkat yang sama sudah menyimpan kata
 * sandi ter-enkripsi-reversibel di {@link #REMEMBER_PATH}.</p>
 *
 * @param {string} username
 * @param {string} password
 */
function simpanHashOfflineLogin(username, password) {
    try {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');
        fs.writeFileSync(OFFLINE_LOGIN_PATH, JSON.stringify({ username: username, salt: salt, hash: hash }), 'utf8');
    } catch (e) { tulisLog('simpanHashOfflineLogin', e); }
}

/**
 * Memeriksa apakah ada hash "Login Mode Offline" tersimpan UNTUK username tertentu (dipakai
 * {@code login:coba-auto} utk menentukan apakah tombol "Masuk Mode Offline" perlu ditawarkan saat
 * server tak terjangkau).
 * @param {string} username
 * @return {boolean}
 */
function adaHashOfflineLogin(username) {
    try {
        if (!fs.existsSync(OFFLINE_LOGIN_PATH)) return false;
        const raw = JSON.parse(fs.readFileSync(OFFLINE_LOGIN_PATH, 'utf8'));
        return !!(raw && raw.username === username && raw.salt && raw.hash);
    } catch (e) { return false; }
}

/**
 * Memverifikasi kata sandi yang diketik ulang kasir terhadap hash "Login Mode Offline" tersimpan --
 * dipanggil dari handler {@code login:coba-offline}. Perbandingan hash memakai
 * {@code crypto.timingSafeEqual} (bukan {@code ===}) supaya waktu eksekusi tidak membocorkan info
 * soal seberapa banyak byte yang cocok (mitigasi timing attack standar utk perbandingan hash rahasia).
 * @param {string} username
 * @param {string} password
 * @return {boolean} {@code true} bila username+password cocok dgn hash tersimpan.
 */
function verifikasiHashOfflineLogin(username, password) {
    try {
        if (!fs.existsSync(OFFLINE_LOGIN_PATH)) return false;
        const raw = JSON.parse(fs.readFileSync(OFFLINE_LOGIN_PATH, 'utf8'));
        if (!raw || raw.username !== username || !raw.salt || !raw.hash) return false;
        const hashDicoba = crypto.scryptSync(password, raw.salt, 64);
        const hashTersimpan = Buffer.from(raw.hash, 'hex');
        if (hashDicoba.length !== hashTersimpan.length) return false;
        return crypto.timingSafeEqual(hashDicoba, hashTersimpan);
    } catch (e) {
        tulisLog('verifikasiHashOfflineLogin', e);
        return false;
    }
}

/**
 * Menghapus hash "Login Mode Offline" tersimpan -- dipanggil bersamaan dgn
 * {@link #hapusKredensialDiingat} tiap kali kredensial "Ingat Saya" dihapus (checkbox tak dicentang,
 * server benar-benar menolak kredensial, ganti alamat server, atau logout), supaya hash offline yg
 * sudah usang tidak tertinggal dan tetap bisa dipakai masuk offline walau kredensial online-nya sendiri
 * sudah tidak berlaku lagi.
 */
function hapusHashOfflineLogin() {
    try { if (fs.existsSync(OFFLINE_LOGIN_PATH)) fs.unlinkSync(OFFLINE_LOGIN_PATH); } catch (e) { tulisLog('hapusHashOfflineLogin', e); }
}

/**
 * {@code true} bila jendela kasir sedang berjalan dalam Login Mode Offline (lihat handler
 * {@code login:coba-offline}) -- TIDAK ada {@link #posApiToken} valid sama sekali dalam mode ini,
 * seluruh pemanggilan PosApi harus jatuh ke cache lokal ({@code local-db.js}) sampai kasir login ulang
 * secara online. Direset {@code false} setiap kali login ONLINE berhasil (manual maupun auto).
 * @type {boolean}
 */
let modeOffline = false;

/** @type {boolean} true selagi {@link #sinkronkanAnggotaLengkap} berjalan -- mencegah 2 sinkron tumpang tindih (mis. kasir klik tombol Sinkronkan dua kali cepat). */
let sinkronAnggotaSedangBerjalan = false;

/** @type {BrowserWindow|null} Jendela kasir utama (memuat halaman POS web, SETELAH login berhasil). */
let mainWindow = null;
/** @type {BrowserWindow|null} Wizard pengaturan alamat server (hanya ada saat belum dikonfigurasi/dibuka manual). */
let setupWindow = null;
/** @type {BrowserWindow|null} Layar login LOKAL (dibuka sebelum jendela kasir utama, lihat openLoginWindow). */
let loginWindow = null;
/** @type {BrowserWindow|null} Layar Pelanggan REMOTE (dibuka oleh _pos.jsp lewat window.electronAPI.openCustomerScreen, memuat URL server). */
let customerWindow = null;

/**
 * @type {BrowserWindow|null} Layar Pelanggan LOKAL (customer.html, dibuka dari pos.html lewat
 * window.electronAPI.posAPI.layarPelanggan.*, lihat JavaDoc {@link #bukaLayarPelangganLokal}) --
 * SENGAJA jendela+state TERPISAH dari {@link #customerWindow} (remote) walau tujuannya serupa,
 * krn cara memuat kontennya beda total (loadFile lokal vs loadURL server) dan siklus hidupnya
 * independen (kasir bisa pindah antara pos.html lokal <-> aplikasi lengkap online kapan saja).
 */
let layarPelangganWindow = null;

/**
 * Pesan {@code {tipe:'keranjang',...}} TERAKHIR yang dikirim kasir ke Layar Pelanggan lokal --
 * di-cache di proses utama (BUKAN di renderer manapun) supaya begitu jendela Layar Pelanggan baru
 * dibuka/reconnect di tengah transaksi, ia langsung menerima tampilan terkini TANPA perlu jendela
 * Kasir mengirim ulang secara eksplisit (beda dari versi JSP/BroadcastChannel yang butuh ronde
 * "minta_status" krn tak ada pemegang state terpusat) -- lihat push otomatis di {@code did-finish-load}.
 * Direset ke null saat kasir mengirim {tipe:'reset'} (transaksi baru/selesai).
 * @type {object|null}
 */
let layarPelangganStateTerakhir = null;

/**
 * Token API POS lokal saat ini (lihat JavaDoc {@code ais.action.servlet.PosApi}/{@code PosDeviceAuthApi}
 * di server) -- HANYA ada di memori proses ini, TIDAK PERNAH ditulis ke disk. Aman: token selalu
 * diminta ULANG setiap aplikasi dibuka (baik lewat login manual maupun auto-login "Ingat Saya", lihat
 * {@link #prosesLoginServer}), jadi tidak ada kebutuhan mempertahankannya lintas-restart aplikasi.
 * @type {string|null}
 */
let posApiToken = null;
let posTokoAktifId = null;

const HALAMAN_POS_BY_AKSES = [
    { file: 'pos.html', akses: 'kasir' },
    { file: 'ringkasan.html', akses: 'ringkasan' },
    { file: 'pesanan.html', akses: 'pesanan' },
    { file: 'anggota.html', akses: 'anggota' },
    { file: 'produk.html', akses: 'produk' },
    { file: 'stokopname.html', akses: 'stokopname' },
    { file: 'kulakan.html', akses: 'kulakan' },
    { file: 'diskon.html', akses: 'diskon' },
    { file: 'retur-penjualan.html', akses: 'returpenjualan' },
    { file: 'riwayat-penjualan.html', akses: 'riwayatpenjualan' },
    { file: 'laporan-transaksi.html', akses: 'laporantransaksi' },
    { file: 'laporan.html', akses: 'laporan' },
    { file: 'riwayat-sinkronisasi.html', akses: 'riwayatsinkronisasi' },
    { file: 'log-error.html', akses: 'logerror' },
    { file: 'konfigurasi.html', akses: 'konfigurasi' }
];

async function muatHalamanAwalPos(win, cfg) {
    let halaman = 'pos.html';
    try {
        const hasil = await panggilPosApi(cfg, 'konfigurasi', {});
        const aksesMenu = hasil && hasil.ok && hasil.data ? hasil.data.aksesMenu : null;
        const pilihan = aksesMenu ? HALAMAN_POS_BY_AKSES.find((p) => aksesMenu[p.akses] !== false) : null;
        if (pilihan && pilihan.file) halaman = pilihan.file;
    } catch (e) {
        halaman = 'pos.html';
    }
    if (win && !win.isDestroyed()) win.loadFile(halaman);
}

/**
 * URL "aplikasi lengkap" (dashboard/menu server penuh) hasil redirect login terakhir -- disimpan
 * supaya menu "Buka Aplikasi Lengkap (Online)" bisa langsung mengarah ke sana tanpa perlu login ulang
 * (cookie sesi HTTP tetap berlaku, lihat {@link #terapkanCookieKeSession}) untuk bagian yang belum
 * dikonversi ke layar lokal (mis. Ringkasan/Pesanan, lihat catatan cakupan di JavaDoc {@link #openMainWindow}).
 * @type {string|null}
 */
let urlAplikasiLengkap = null;

/**
 * Membaca konfigurasi tersimpan (host/contextPath/https) dari {@link CONFIG_PATH}.
 *
 * @return {{host:string, contextPath:string, https:boolean}|null} konfigurasi tersimpan, atau
 *         {@code null} bila belum pernah disimpan / berkas rusak (gagal-aman: dianggap belum
 *         dikonfigurasi, bukan error fatal -- akan memicu wizard pengaturan terbuka lagi).
 */
function readConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const cfg = JSON.parse(raw);
        return (cfg && cfg.host) ? cfg : null;
    } catch (e) {
        return null;
    }
}

/**
 * Menyimpan konfigurasi ke {@link CONFIG_PATH}, membuat foldernya dulu bila belum ada.
 * @param {{host:string, contextPath:string, https:boolean}} cfg konfigurasi yang divalidasi pemanggil.
 */
function writeConfig(cfg) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

/** @return {{judulAplikasi:string, logoLokalPath:string|null}} branding tersimpan, atau default (judul standar, tanpa logo) bila belum pernah diatur/berkas rusak. Lihat JavaDoc {@link BRANDING_PATH}. */
function bacaBranding() {
    try {
        const raw = fs.readFileSync(BRANDING_PATH, 'utf8');
        const b = JSON.parse(raw);
        return { judulAplikasi: (b && b.judulAplikasi) || 'POS Kasir', logoLokalPath: (b && b.logoLokalPath) || null };
    } catch (e) {
        return { judulAplikasi: 'POS Kasir', logoLokalPath: null };
    }
}

/** @param {{judulAplikasi?:string, logoLokalPath?:string|null}} perubahan digabung dgn branding tersimpan sebelumnya (partial update). */
function simpanBranding(perubahan) {
    const gabungan = Object.assign({}, bacaBranding(), perubahan || {});
    fs.mkdirSync(path.dirname(BRANDING_PATH), { recursive: true });
    fs.writeFileSync(BRANDING_PATH, JSON.stringify(gabungan, null, 2), 'utf8');
    return gabungan;
}

/**
 * Menyusun URL dasar aplikasi AIS dari konfigurasi tersimpan: {@code <skema>://<host>/<contextPath>/}.
 * Slash ganda/hilang dibersihkan supaya hasilnya selalu rapi terlepas dari bagaimana pengguna mengetik
 * host/contextPath di wizard (mis. menyertakan atau tidak menyertakan garis miring di awal/akhir).
 *
 * @param {{host:string, contextPath:string, https:boolean}} cfg
 * @return {string} URL dasar siap dipakai {@code loadURL}.
 */
function buildBaseUrl(cfg) {
    const scheme = cfg.https === false ? 'http' : 'https';
    const host = (cfg.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const ctx = (cfg.contextPath || '').trim().replace(/^\/+|\/+$/g, '');
    return scheme + '://' + host + (ctx ? '/' + ctx : '') + '/';
}

/**
 * Menyusun URL ASAL server (skema+host, TANPA context path/slash akhir) -- dipakai menggabungkan
 * dengan path {@code redirect} yang dikirim balik server setelah login sukses (mis.
 * {@code "/ecampus/main"}, sudah menyertakan context path-nya sendiri, lihat {@code Login.java}
 * baris {@code jsonResponse.put("redirect", Common.ROOT + "/main")}) -- BEDA dari {@link #buildBaseUrl}
 * yang menyertakan context path plus slash akhir dan salah bila digabung langsung dengan path yang
 * sudah membawa context path-nya sendiri (hasilnya bisa dobel, mis. "/ecampus/ecampus/main").
 *
 * @param {{host:string, https:boolean}} cfg
 * @return {string} mis. {@code "https://demo.ecampus.id"}.
 */
function buildOriginUrl(cfg) {
    const scheme = cfg.https === false ? 'http' : 'https';
    const host = (cfg.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return scheme + '://' + host;
}

/** Membuka wizard pengaturan alamat server. Bila dipanggil ulang saat sudah terbuka, cukup fokuskan. */
function openSetupWindow() {
    if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.focus(); return; }
    setupWindow = new BrowserWindow({
        width: 560,
        height: 860,
        resizable: false,
        minimizable: true,
        maximizable: false,
        title: 'Pengaturan Server - POS Kasir',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload-setup.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    setupWindow.setMenuBarVisibility(false);
    setupWindow.loadFile('setup.html');
    setupWindow.on('closed', () => {
        setupWindow = null;
        // Bila ditutup TANPA menyimpan (mis. pengguna klik X) dan belum pernah ada jendela utama
        // yang jalan sama sekali, aplikasi tidak punya alasan untuk tetap hidup -- keluar bersih.
        if (!mainWindow) { catatKeluarJikaJendelaTerakhir('wizard pengaturan'); app.quit(); }
    });
}

/**
 * Membuka layar login LOKAL (login.html) -- jendela PERTAMA yang dibuka setelah alamat server
 * tersimpan, MENGGANTIKAN halaman login2.jsp bawaan server. Lihat JavaDoc berkas ini poin 5 dan
 * {@link #prosesLoginServer} untuk penjelasan lengkap alurnya.
 *
 * @param {{host:string, contextPath:string, https:boolean}} cfg
 */
function openLoginWindow(cfg) {
    if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }
    loginWindow = new BrowserWindow({
        width: 460,
        height: 620,
        resizable: false,
        minimizable: true,
        maximizable: false,
        title: 'Masuk - POS Kasir',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload-login.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    loginWindow.setMenuBarVisibility(false);
    loginWindow.loadFile('login.html');
    loginWindow.on('closed', () => {
        loginWindow = null;
        // Ditutup TANPA berhasil login (mis. klik X) dan belum pernah ada jendela kasir utama sama
        // sekali -> aplikasi tidak punya alasan tetap hidup, sama seperti pola openSetupWindow().
        if (!mainWindow) { catatKeluarJikaJendelaTerakhir('login'); app.quit(); }
    });
}

/**
 * Membuka jendela kasir utama SETELAH login sukses (lewat {@link #prosesLoginServer}). Sejak
 * fitur "POS lokal + API" (lihat JavaDoc {@code ais.action.servlet.PosApi} di server), jendela ini
 * memuat {@code pos.html} LOKAL (berkas, bukan {@code loadURL} ke server) sebagai tampilan DEFAULT --
 * seluruh data (katalog/konfigurasi/checkout) diambil lewat {@code window.electronAPI.posAPI.*}
 * (proxy IPC ke {@code /PosApi} bertoken, lihat handler {@code pos:*} di berkas ini), BUKAN dengan
 * menavigasi halaman ke domain server seperti sebelumnya.
 *
 * <p><b>Cakupan saat ini HANYA layar Kasir (POS)</b> -- Ringkasan &amp; Pesanan (menu lain di sidebar
 * aplikasi web) BELUM dikonversi ke jalur token/API, jadi tetap memerlukan sesi cookie lama.
 * Cookie itu TETAP diterapkan saat login (lihat {@link #terapkanCookieKeSession}, tidak dihapus
 * hanya karena tampilan default berubah) supaya menu "Buka Aplikasi Lengkap (Online)" (lihat
 * {@link #setupAppMenu}/{@link #bukaAplikasiLengkap}) tetap bisa menavigasi jendela YANG SAMA ke
 * {@link #urlAplikasiLengkap} tanpa perlu login ulang.</p>
 *
 * <p>Popup yang diminta halaman web (cetak struk, dsb.) tetap diizinkan terbuka sebagai child window
 * biasa; kegagalan memuat URL remote (dipicu HANYA saat menavigasi ke aplikasi lengkap, bukan saat
 * memuat {@code pos.html} lokal) dialihkan ke error.html.</p>
 *
 * @param {{host:string, contextPath:string, https:boolean}} cfg
 */
function openMainWindow(cfg) {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 860,
        title: 'POS Kasir',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.setMenuBarVisibility(false);
    setupAppMenu();

    // Izinkan halaman web membuka jendela baru (mis. popup cetak struk via window.open()) sebagai
    // BrowserWindow child biasa -- tanpa ini Electron akan menolak window.open() secara default.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        return { action: 'allow' };
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return; // abaikan kegagalan sub-resource (gambar/iframe), hanya frame utama yang relevan
        if (errorCode === -3) return; // ERR_ABORTED: navigasi dibatalkan sendiri (mis. reload cepat), bukan kegagalan sungguhan
        if (!/^https?:\/\//i.test(validatedURL || '')) return; // pos.html lokal (file://) gagal muat = bug paket instalasi, BUKAN "server tak terjangkau" -- jangan alihkan ke error.html yg pesannya menyesatkan utk kasus ini.
        loadErrorPage(mainWindow, cfg, errorDescription);
    });

    // Gap-closure keluhan lapangan "transaksi tak selesai, aplikasi kasir tiba-tiba tertutup sendiri"
    // -- akar masalah SEBENARNYA bukan exception JS biasa (itu sudah ditangkap window.onerror di
    // renderer + uncaughtException di proses utama, lihat javadoc masing-masing), melainkan proses
    // RENDERER MATI SECARA NATIF (crash/OOM/GPU) -- kegagalan level OS yang TIDAK PERNAH lewat jalur
    // penangkap exception JS mana pun. TANPA handler ini, Electron membiarkan jendela begitu saja
    // (tampak "diam"/putih) atau -- bila ini satu-satunya jendela terbuka -- event 'window-all-closed'
    // di bawah lantas menutup SELURUH APLIKASI, PERSIS gejala yang dilaporkan. Dicatat detail teknis
    // lengkap (reason/exitCode) ke Log Error (disinkron ke server, lihat catatErrorLogAman) SUPAYA
    // admin pusat bisa mendiagnosis dari jauh, lalu jendela dimuat ulang OTOMATIS (bukan dibiarkan
    // mati) supaya kasir bisa lanjut kerja tanpa perlu membuka ulang aplikasi secara manual.
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        const pesan = 'Tampilan Kasir berhenti tak terduga (reason=' + details.reason + ', exitCode=' + details.exitCode + ') -- dimuat ulang otomatis.';
        tulisLog('render-process-gone', new Error(pesan));
        catatErrorLogAman({ sumber: 'main:render-process-gone', pesan: pesan, detail: JSON.stringify(details), layar: 'pos.html (Kasir)' });
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.reload();
            }
        } catch (e) { /* penanganan crash sendiri tidak boleh ikut melempar */ }
    });
    mainWindow.on('unresponsive', () => {
        catatErrorLogAman({ sumber: 'main:unresponsive', pesan: 'Tampilan Kasir sempat tidak merespons (macet), bukan tertutup -- dibiarkan Electron pulih sendiri.', layar: 'pos.html (Kasir)' });
    });

    muatHalamanAwalPos(mainWindow, cfg);
    mulaiAutoCekUpdate();
    mulaiSinkronSesiKasBerkala();
    sinkronkanSesiKasPending(readConfig()).catch(() => {}); // langsung coba sekali saat jendela dibuka -- jangan tunggu 30 detik pertama kalau kebetulan ada sesi tertunda dari sesi aplikasi sebelumnya
    mulaiSinkronImporKatalogBerkala();
    mulaiSinkronErrorLogBerkala();
    sinkronkanErrorLogPending(readConfig()).catch(() => {});
    mulaiSinkronProdukCacheBerkala();
    sinkronkanKatalogProdukLengkap(readConfig()).catch(() => {});
    sinkronkanImporKatalogPending(readConfig()).catch(() => {}); // sama alasannya dgn sesi kas di atas -- langsung coba sekali, jangan tunggu 30 detik pertama

    mainWindow.on('closed', () => {
        mainWindow = null;
        berhentiAutoCekUpdate();
        berhentiSinkronSesiKasBerkala();
        berhentiSinkronImporKatalogBerkala();
        berhentiSinkronErrorLogBerkala();
        berhentiSinkronProdukCacheBerkala();
        if (customerWindow && !customerWindow.isDestroyed()) { customerWindow.close(); }
        customerWindow = null;
    });
}

/**
 * Menavigasi jendela kasir yang SUDAH TERBUKA ke aplikasi web lengkap di server (Ringkasan, Pesanan,
 * dan bagian lain yang belum dikonversi ke {@code pos.html} lokal) -- dipanggil dari menu
 * "Buka Aplikasi Lengkap (Online)". Memakai sesi cookie yang sudah diterapkan saat login (lihat
 * JavaDoc {@link #openMainWindow}), jadi TIDAK perlu login ulang selama sesi itu belum kedaluwarsa.
 */
function bukaAplikasiLengkap() {
    if (!mainWindow || mainWindow.isDestroyed() || !urlAplikasiLengkap) return;
    mainWindow.loadURL(urlAplikasiLengkap);
}

/** Menavigasi jendela kasir kembali ke {@code pos.html} lokal -- kebalikan {@link #bukaAplikasiLengkap}. */
function kembaliKeKasirLokal() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadFile('pos.html');
}

/**
 * Menerjemahkan error koneksi Node ({@code ENOTFOUND}/{@code ECONNREFUSED}/dst, atau error TLS) jadi
 * pesan Bahasa Indonesia yang awam -- dipakai bersama oleh {@link #tesKoneksiServer} (tombol Tes
 * Koneksi di wizard) dan {@link #prosesLoginServer} (layar login) supaya pemetaan pesan error di
 * kedua tempat konsisten dan tidak ditulis dua kali.
 * @param {Error} e
 * @return {string}
 */
function pesanDariErrorKoneksi(e) {
    if (!e) return 'Terjadi kesalahan tak dikenal.';
    if (e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') {
        return 'Alamat host tidak ditemukan -- periksa kembali ejaan alamat host di Pengaturan Server.';
    }
    if (e.code === 'ECONNREFUSED') {
        return 'Koneksi ditolak server -- periksa pilihan protokol HTTPS/HTTP atau context path di Pengaturan Server.';
    }
    if (e.code === 'ECONNRESET') {
        return 'Koneksi terputus di tengah jalan oleh server/jaringan. Coba lagi sesaat.';
    }
    if (/certificate|SSL|TLS|CERT_/i.test(String(e.code || e.message))) {
        return 'Sertifikat SSL server tidak valid/tidak terpercaya. Hubungi admin sistem, atau nonaktifkan HTTPS bila memang server internal tanpa SSL.';
    }
    if (e.kodeAisTimeout) {
        return 'Waktu tunggu habis -- server tidak merespons. Periksa alamat host atau koneksi internet Anda.';
    }
    return 'Gagal terhubung: ' + e.message;
}

// ==== Update aplikasi (electron-updater) ====
//
// Tombol "Update Sistem" di pos.html memeriksa/mengunduh/memasang versi baru aplikasi desktop ini
// SENDIRI (BUKAN update data/katalog -- itu tombol "Sinkronkan" yang sudah ada) -- versi installer
// (.exe) baru. Memakai library `electron-updater` (paket resmi tim electron-builder) drpd menulis
// logic unduh-lalu-jalankan installer sendiri -- library itu SUDAH menangani verifikasi checksum,
// perbandingan versi semver, dan menjalankan NSIS installer dgn benar (termasuk menutup aplikasi
// lama dgn aman sebelum installer baru jalan) -- menulis ulang itu sendiri rawan bug halus (mis.
// proses lama masih mengunci file .exe saat installer baru mencoba menimpanya).
//
// **Provider "github"** (BUKAN server AIS -- percobaan awal pakai folder statis di server AIS
// sendiri, diganti provider ini atas permintaan eksplisit user setelah opsi Google Drive dinilai
// tidak layak/rapuh, lihat riwayat percakapan): repo publik `Zishof/ais-pos-kasir-desktop`, HANYA
// dipakai utk hosting rilis (tab "Releases"), TIDAK ada hubungannya dgn source code AIS yg sesungguhnya
// (repo boleh isinya cuma README, atau source `desktop-pos-electron/` ini -- keduanya sama saja
// fungsinya bagi electron-updater, yg cuma peduli aset di tab Releases). Konfigurasi provider
// (`owner`/`repo`) SUDAH dibakukan saat build lewat `build.publish` di `package.json` -> ditulis
// otomatis oleh electron-builder ke berkas `app-update.yml` yg ikut dibundel ke aplikasi terpasang
// -- KARENA ITU autoUpdater di sini TIDAK PERLU `setFeedURL()` runtime sama sekali (beda dari
// percobaan provider "generic" sebelumnya yg feed URL-nya per-instalasi/dinamis ikut server AIS
// yg dikonfigurasi kasir -- provider GitHub ini SAMA utk semua instalasi di mana pun, krn repo
// rilisnya tunggal).
//
// KONSEKUENSI OPERASIONAL (WAJIB dilakukan admin/IT, BUKAN sesuatu yg otomatis tersedia hanya
// krn kode ini ada): setiap kali merilis versi baru (`npm run dist`), admin harus (1) menaikkan
// `"version"` di `package.json` (electron-updater membandingkan versi semver -- rilis dgn nomor versi
// SAMA/lebih rendah dari yg terpasang TIDAK akan pernah terdeteksi sbg pembaruan), (2) buat GitHub
// Release BARU di repo itu (tab Releases -> "Draft a new release"), tag PERSIS `v` + versi di
// package.json (mis. `v1.0.1` -- awalan "v" WAJIB, itu konvensi default electron-builder), (3)
// unggah SEMUA isi folder `release/` sbg aset rilis: installer `.exe`, `latest.yml`, DAN
// `.exe.blockmap` (blockmap opsional tapi disertakan electron-builder scr default -- tanpanya
// electron-updater tetap jalan, cuma tanpa differential-download). Tanpa langkah manual itu, tombol
// "Update Sistem" akan selalu bilang "sudah versi terbaru" -- KODE INI SENDIRI TIDAK MENERBITKAN
// APA-APA, ia hanya MEMERIKSA rilis yg sudah ada di tab Releases repo itu.
autoUpdater.autoDownload = false; // unduhan BARU mulai setelah kasir menekan tombol konfirmasi eksplisit di UI, bukan otomatis di latar belakang -- mesin POS dipakai jam sibuk, jangan sedot bandwidth tanpa sepengetahuan operator.
autoUpdater.autoInstallOnAppQuit = false; // instalasi juga WAJIB dikonfirmasi eksplisit (quitAndInstall dipanggil manual dari IPC) -- jangan pernah memaksa restart aplikasi kasir yg sedang dipakai melayani pelanggan.
autoUpdater.logger = { info: (m) => tulisLog('autoUpdater.info', m), warn: (m) => tulisLog('autoUpdater.warn', m), error: (m) => tulisLog('autoUpdater.error', m) };

/**
 * Menerjemahkan error dari electron-updater ke pesan awam. KASUS PALING SERING (belum pernah ada
 * rilis dipublikasikan di repo GitHub, lihat catatan operasional di atas) TIDAK dianggap error oleh
 * electron-updater sendiri (ia memicu event {@code update-not-available}, bukan {@code error}) --
 * jadi cabang ini menangani kegagalan yg SUNGGUHAN: repo/rilis tak ditemukan (owner/repo salah ketik
 * di `package.json`, atau repo sempat dihapus/diprivatkan), batas laju API publik GitHub terlampaui
 * (jarang -- kuota anonim GitHub per-jam cukup tinggi utk pemakaian wajar), jaringan, atau berkas
 * rusak/gagal verifikasi checksum.
 */
function pesanDariErrorUpdate(e) {
    const pesan = (e && e.message) ? e.message : String(e || '');
    if (/404/.test(pesan) || /HttpError: 404|Not Found/i.test(pesan)) {
        return 'Repo GitHub tempat rilis aplikasi ini disimpan tidak ditemukan (owner/repo salah, atau repo sudah dihapus/diprivatkan). Hubungi admin/IT.';
    }
    if (/403/.test(pesan) || /rate limit/i.test(pesan)) {
        return 'Terlalu sering memeriksa pembaruan dalam waktu singkat (batas GitHub tercapai) -- coba lagi beberapa menit lagi.';
    }
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(pesan)) {
        return 'Tidak bisa menghubungi GitHub untuk memeriksa pembaruan -- periksa koneksi internet perangkat ini.';
    }
    if (/signature|checksum|sha512|integrity/i.test(pesan)) {
        return 'Berkas pembaruan yang diunduh rusak/tidak lolos verifikasi keamanan -- JANGAN dipasang. Hubungi admin/IT -- kemungkinan rilis di GitHub belum lengkap/salah unggah (mis. lupa sertakan latest.yml yg sesuai).';
    }
    return pesan;
}

/** Meneruskan status pembaruan ke jendela Kasir (satu-satunya jendela yg py tombol "Update Sistem"). */
function kirimStatusUpdate(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pos:update-status', payload);
}

/** Pola SAMA dgn {@link #kirimStatusUpdate} (fitur "Update Sistem"), channel terpisah -- dipakai progress bar sinkron picker member. Lihat JavaDoc {@link #sinkronkanAnggotaLengkap}. */
function kirimStatusAnggotaSync(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pos:anggota-sync-status', payload);
}

/** Pola SAMA dgn {@link #kirimStatusUpdate}, dipakai progress bar "Simpan" di layar Tinjau Impor Katalog. Lihat JavaDoc {@code pos:produk-komit-excel}. */
function kirimStatusImporKatalog(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pos:import-katalog-progress', payload);
}

/** Pola SAMA dgn {@link #kirimStatusUpdate}, dipakai progress bar layar muat awal (katalog+gambar produk). Lihat JavaDoc {@link #unduhCacheGambarProduk}. */
function kirimStatusKatalog(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pos:katalog-status', payload);
}

autoUpdater.on('checking-for-update', () => kirimStatusUpdate({ tipe: 'memeriksa' }));
autoUpdater.on('update-available', (info) => kirimStatusUpdate({ tipe: 'tersedia', versiBaru: info.version, catatan: info.releaseNotes || '' }));
autoUpdater.on('update-not-available', (info) => kirimStatusUpdate({ tipe: 'terkini', versi: info.version }));
autoUpdater.on('error', (err) => kirimStatusUpdate({ tipe: 'error', pesan: pesanDariErrorUpdate(err) }));
autoUpdater.on('download-progress', (p) => kirimStatusUpdate({
    tipe: 'unduh', persen: Math.round(p.percent || 0),
    ditransferMb: Math.round((p.transferred || 0) / 1048576),
    totalMb: Math.round((p.total || 0) / 1048576)
}));
autoUpdater.on('update-downloaded', (info) => kirimStatusUpdate({ tipe: 'siap', versiBaru: info.version }));

/** @type {NodeJS.Timeout|null} timer pemeriksaan berkala -- lihat {@link #mulaiAutoCekUpdate}. */
let intervalAutoCekUpdate = null;

/**
 * Memulai pemeriksaan pembaruan OTOMATIS berkala selama jendela Kasir terbuka -- supaya SEMUA kasir
 * yang aplikasinya sedang berjalan otomatis diberi tahu begitu ada rilis baru di GitHub, TANPA perlu
 * ingat membuka menu "Update Sistem" dan menekan "Cek Pembaruan" sendiri (per permintaan eksplisit:
 * "tiap ada rilis terbaru, buat informasi ke semua kasir agar segera update"). Hasil cek tetap
 * melalui event {@code update-available}/{@code update-not-available} yg SUDAH direlay ke renderer
 * (lihat {@link #kirimStatusUpdate}) -- pos-renderer.js yg memutuskan menampilkan badge+notifikasi.
 *
 * <p>SENGAJA HANYA memeriksa (checkForUpdates), TIDAK mengunduh/memasang otomatis -- {@code
 * autoDownload}/{@code autoInstallOnAppQuit} tetap {@code false} spt sedia kala (lihat catatan di
 * atas): keputusan unduh & pasang TETAP di tangan kasir, cuma pemeriksaannya yg kini proaktif.</p>
 *
 * <p>Jeda 3 jam dipilih sbg keseimbangan: cukup jarang utk tak membebani API publik GitHub (kuota
 * anonim 60 req/jam PER ALAMAT IP -- banyak kasir di sekolah yg sama biasanya berbagi 1 IP publik
 * lewat NAT), cukup sering utk rilis baru "terasa" sampai di hari yg sama tanpa perlu restart
 * aplikasi. Dipanggil SEKALI per sesi login (dari {@link #openMainWindow}) -- guard {@code
 * intervalAutoCekUpdate} mencegah timer dobel bila fungsi ini terpanggil ulang.</p>
 */
function mulaiAutoCekUpdate() {
    if (intervalAutoCekUpdate) return;
    const jalankanCek = () => { autoUpdater.checkForUpdates().catch((e) => tulisLog('autoCekUpdate', e)); };
    setTimeout(jalankanCek, 8000); // tunda dari startup -- jangan berebut bandwidth dgn muat katalog+gambar produk awal
    intervalAutoCekUpdate = setInterval(jalankanCek, 3 * 60 * 60 * 1000);
}

/** Menghentikan timer {@link #mulaiAutoCekUpdate} -- dipanggil saat jendela Kasir tertutup/logout supaya tak ada timer "hantu" berjalan tanpa jendela utk menerima hasilnya, dan supaya sesi login berikutnya mulai dari jeda 8 detik yg sama (bukan lanjut interval lama). */
function berhentiAutoCekUpdate() {
    if (intervalAutoCekUpdate) { clearInterval(intervalAutoCekUpdate); intervalAutoCekUpdate = null; }
}

/**
 * Menguji apakah konfigurasi server (host/contextPath/https) yang sedang diketik di wizard
 * benar-benar bisa dihubungi -- dipanggil dari tombol "Tes Koneksi" di setup.html SEBELUM
 * pengguna menekan "Simpan & Buka Aplikasi", supaya kesalahan ketik alamat host/context path
 * ketahuan sejak awal alih-alih baru muncul sebagai error.html yang membingungkan setelah
 * jendela utama terlanjur dibuka.
 *
 * <p>Sengaja dijalankan di proses UTAMA (bukan {@code fetch()} di renderer wizard) dengan dua
 * alasan: (1) modul {@code http}/{@code https} bawaan Node tidak terikat Content-Security-Policy
 * halaman seperti {@code fetch()} renderer, jadi tidak perlu melonggarkan CSP {@code connect-src}
 * hanya demi fitur ini; (2) konsisten dengan pola IPC lain di berkas ini -- renderer wizard hanya
 * boleh memicu aksi lewat {@code window.setupAPI}, tidak pernah melakukan I/O jaringan sendiri.</p>
 *
 * <p>"Berhasil" di sini berarti server MERESPONS (status HTTP apa pun, termasuk 302/401/404) --
 * bukan berarti kredensial/login benar. Ini cukup untuk memvalidasi bahwa host, context path, dan
 * pilihan protokol HTTP/HTTPS sudah mengarah ke server yang benar; validasi kredensial tetap terjadi
 * di layar login setelah wizard ditutup.</p>
 *
 * @param {{host:string, contextPath:string, https:boolean}} cfg konfigurasi yang sedang diuji pengguna.
 * @return {Promise<{ok:boolean, status?:number, durasiMs?:number, url:string, pesan?:string}>}
 */
function tesKoneksiServer(cfg) {
    return new Promise((resolve) => {
        const target = buildBaseUrl(cfg);
        const host = (cfg && cfg.host || '').trim();
        if (!host) { resolve({ ok: false, pesan: 'Alamat host belum diisi.', url: target }); return; }

        const modul = cfg.https === false ? http : https;
        const mulai = Date.now();
        let selesai = false;

        const req = modul.get(target, { timeout: 8000 }, (res) => {
            selesai = true;
            res.resume(); // buang isi respons -- cukup tahu server membalas, tak perlu kontennya
            resolve({ ok: true, status: res.statusCode, durasiMs: Date.now() - mulai, url: target });
        });

        req.on('timeout', () => {
            if (selesai) return;
            selesai = true;
            req.destroy();
            resolve({ ok: false, pesan: 'Waktu tunggu habis (8 detik) -- server tidak merespons. Periksa alamat host atau koneksi internet Anda.', url: target });
        });

        req.on('error', (e) => {
            if (selesai) return;
            selesai = true;
            resolve({ ok: false, pesan: pesanDariErrorKoneksi(e), url: target });
        });
    });
}

/**
 * Melakukan satu permintaan HTTP(S) generik dengan Promise, dipakai {@link #prosesLoginServer}.
 * Berbeda dari {@link #tesKoneksiServer} yang cuma butuh GET sekali, di sini perlu POST dengan
 * body+header custom (form-urlencoded login) dan akses ke header respons mentah (termasuk
 * {@code set-cookie}) -- karena itu ditulis sebagai helper terpisah, bukan reuse langsung.
 *
 * @param {string} urlString URL lengkap (termasuk skema+query).
 * @param {{method?:string, headers?:object, body?:string}} opts
 * @return {Promise<{statusCode:number, headers:object, body:string}>}
 */
function requestHttp(urlString, opts) {
    return new Promise((resolve, reject) => {
        let u;
        try {
            u = new URL(urlString);
        } catch (e) {
            reject(new Error('Alamat server tidak valid: ' + urlString));
            return;
        }
        const modul = u.protocol === 'http:' ? http : https;
        const req = modul.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'http:' ? 80 : 443),
            path: u.pathname + u.search,
            method: (opts && opts.method) || 'GET',
            headers: (opts && opts.headers) || {},
            timeout: (opts && opts.timeout) || 15000
        }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('timeout', () => {
            req.destroy();
            reject(Object.assign(new Error('timeout'), { kodeAisTimeout: true }));
        });
        req.on('error', reject);
        if (opts && opts.body) req.write(opts.body);
        req.end();
    });
}

/** Folder tempat cache gambar produk lokal (satu file per produk) -- dibuat sekali saat dibutuhkan. */
function folderCacheGambarProduk() {
    const dir = path.join(app.getPath('userData'), 'product-images');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Folder tempat cache foto member lokal (satu file per anggota) -- pola SAMA dgn {@link #folderCacheGambarProduk}. Dipakai fitur "Picker Member Offline", lihat JavaDoc {@link #sinkronkanAnggotaLengkap}. */
function folderCacheFotoAnggota() {
    const dir = path.join(app.getPath('userData'), 'foto-anggota');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Mengunduh SATU URL sbg data BINER (bukan teks -- {@link #requestHttp} memakai
 * {@code setEncoding('utf8')} yg akan MERUSAK data gambar). Dipakai HANYA oleh
 * {@link #unduhCacheGambarProduk} -- helper terpisah drpd memperluas {@link #requestHttp} supaya
 * jalur teks (login/API JSON) yg jauh lebih sering dipakai tetap sederhana.
 * @return {Promise<Buffer>}
 */
function unduhBiner(urlString) {
    return new Promise((resolve, reject) => {
        let u;
        try {
            u = new URL(urlString);
        } catch (e) {
            reject(new Error('URL gambar tidak valid: ' + urlString));
            return;
        }
        const modul = u.protocol === 'http:' ? http : https;
        const req = modul.get({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'http:' ? 80 : 443),
            path: u.pathname + u.search,
            timeout: 15000
        }, (res) => {
            if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Waktu tunggu habis mengunduh gambar.')); });
        req.on('error', reject);
    });
}

/**
 * Mengunduh (bila belum ada cache lokal) gambar tiap produk yg punya {@code gambarUrl} dari server
 * (endpoint publik {@code /AmbilMediaProduk}, lihat JavaDoc {@code PosApi.prosesKatalog} di server --
 * TIDAK butuh token), lalu MENGGANTI field {@code gambarUrl} produk ITU SENDIRI (mutasi array yg
 * diberikan) jadi path lokal {@code file://...} -- inilah "sinkron gambar produk ke lokal" yg
 * membuat gambar tetap tampil walau nanti offline (dibaca balik dari {@link localDb.bacaCache}).
 *
 * <p>Produk yg TIDAK punya {@code gambarUrl} (server sengaja tak mengisinya bila
 * {@code Produk.adaFileGambar} false, lihat server) dilewati sama sekali -- klien menampilkan avatar
 * warna+inisial sbg gantinya (lihat {@code pos-renderer.js}), tak ada yg diunduh.</p>
 *
 * <p>Concurrency dibatasi ({@link #BATAS_UNDUH_BERSAMAAN}) supaya katalog besar (ratusan produk)
 * tidak membuka ratusan koneksi HTTP sekaligus -- proses berjalan per-batch sekuensial-paralel
 * sederhana, BUKAN worker pool canggih (skala katalog kantin tidak butuh itu).</p>
 *
 * @param {Array<object>} produkList hasil {@code hasil.data.produk} dari {@code /PosApi katalog} --
 *        DIMUTASI LANGSUNG (field {@code gambarUrl} tiap elemen ditimpa bila berhasil diunduh/dicache).
 * @return {Promise<void>} selesai setelah SEMUA percobaan unduh (berhasil atau gagal) tuntas --
 *         kegagalan mengunduh SATU gambar tidak pernah melempar/menggagalkan produk lain (gambar
 *         yg gagal diunduh dibiarkan apa adanya dgn URL remote asli, klien akan fallback ke avatar
 *         lewat {@code onerror} bila URL remote itu nanti tak terjangkau saat offline).
 *
 * <p><b>Progress</b>: mengirim {@code pos:katalog-status} (lihat {@link #kirimStatusKatalog}) SEBELUM
 * mulai (berisi jumlah gambar yg SUDAH di-cache vs yg PERLU diunduh -- inilah jawaban "apakah sedang
 * ambil dari lokal" yg ditanyakan kasir) dan sesudah tiap batch unduh (progress bertahap). Bila SEMUA
 * gambar sudah tercache (kasus paling umum, hanya katalog awal/gambar baru yg pernah butuh unduh),
 * tidak ada event batch sama sekali -- overlay pemanggil akan langsung terlihat cepat/instan.</p>
 */
async function unduhCacheGambarProduk(produkList) {
    if (!Array.isArray(produkList) || produkList.length === 0) { kirimStatusKatalog({ tipe: 'gambar-mulai', totalPerluUnduh: 0 }); return; }
    const dir = folderCacheGambarProduk();
    const BATAS_UNDUH_BERSAMAAN = 6;

    const kandidat = produkList.filter((p) => p && typeof p.gambarUrl === 'string' && /^https?:\/\//i.test(p.gambarUrl));
    const antrean = kandidat.filter((p) => !fs.existsSync(path.join(dir, String(p.id) + '.jpg')));
    const sudahTercache = kandidat.length - antrean.length;

    kirimStatusKatalog({ tipe: 'gambar-mulai', totalPerluUnduh: antrean.length, sudahTercache: sudahTercache });

    // Produk yg gambarnya SUDAH tercache tetap perlu path file:// diisi (bukan cuma yg baru diunduh).
    kandidat.filter((p) => !antrean.includes(p)).forEach((p) => {
        p.gambarUrl = 'file://' + path.join(dir, String(p.id) + '.jpg').replace(/\\/g, '/');
    });

    async function prosesSatu(p) {
        const filePath = path.join(dir, String(p.id) + '.jpg');
        try {
            const data = await unduhBiner(p.gambarUrl);
            fs.writeFileSync(filePath, data);
            // file:// butuh forward-slash konsisten lintas OS (Windows pakai backslash secara default).
            p.gambarUrl = 'file://' + filePath.replace(/\\/g, '/');
        } catch (e) {
            // Gagal unduh SATU gambar (mis. jaringan putus di tengah) -- biarkan gambarUrl remote apa
            // adanya, JANGAN menggagalkan produk lain. Tidak perlu dicatat ke error.log -- ini murni
            // kosmetik (gambar produk), bukan kegagalan fungsional.
        }
    }

    let selesai = 0;
    for (let i = 0; i < antrean.length; i += BATAS_UNDUH_BERSAMAAN) {
        const batch = antrean.slice(i, i + BATAS_UNDUH_BERSAMAAN);
        await Promise.all(batch.map(prosesSatu));
        selesai += batch.length;
        kirimStatusKatalog({ tipe: 'gambar-progres', selesai: selesai, total: antrean.length });
    }
    kirimStatusKatalog({ tipe: 'gambar-selesai' });
}

/**
 * Fitur "Picker Member Offline" (Kasir Desktop) -- sinkron LENGKAP data+foto anggota koperasi ke
 * cache SQLite lokal ({@code anggota_cache}), dipicu HANYA lewat tombol "Sinkronkan" manual di modal
 * picker member (SENGAJA tidak otomatis di background -- foto ribuan member bisa berat, kasir yang
 * memutuskan kapan, dikonfirmasi user). Dua tahap berurutan, progres tiap tahap dikirim ke renderer
 * lewat {@link #kirimStatusAnggotaSync} (channel {@code pos:anggota-sync-status}, pola SAMA persis
 * dgn {@code pos:update-status} milik fitur "Update Sistem"):
 *
 * <p><b>Tahap 1 -- Data</b>: memanggil aksi server {@code anggota_sync_list} (lihat JavaDoc server
 * {@code KantinHelper.anggotaSyncList}) berulang dgn cursor {@code sejak_id} sampai server bilang
 * {@code adaLagi=false} -- data TEKS (nama/kode/dst) selalu ditimpa penuh tiap batch (murah, mirip
 * katalog produk), TIDAK ada logika delta di tahap ini. Page size SENGAJA lebih kecil (200, bukan
 * 500) + timeout HTTP kustom lebih longgar (60 detik, bukan default 15 detik {@link #panggilPosApi})
 * -- laporan lapangan: batch 500 anggota bisa lebih lambat drpd 15 detik krn server melakukan
 * pencarian foto PER-ANGGOTA ({@code ProfileImageUtil.cariFileFotoLain}, N+1 query), jadi timeout
 * default terlalu ketat utk sinkron pertama kali pada basis 1.000-10.000 anggota.</p>
 *
 * <p><b>Tahap 2 -- Foto</b>: HANYA member yg server laporkan punya {@code fotoUrl} diproses. Deteksi
 * perubahan dilakukan LANGSUNG lewat filesystem (bukan bandingkan kolom database lama vs baru --
 * lebih sederhana &amp; tak mungkin basi): nama berkas lokal SENGAJA menyertakan {@code fotoNama} dari
 * server ({@code <id>_<fotoNama>}), jadi kalau foto member diganti (nama berkas baru dari server
 * beda), otomatis dianggap berkas BEDA dan diunduh ulang; kalau nama SAMA, ukuran berkas lokal masih
 * dibandingkan ke {@code fotoUkuran} server sbg lapis kedua (menangkap kasus jarang: server mengganti
 * isi foto tapi mempertahankan nama berkas yg sama) -- keduanya cocok -&gt; TIDAK diunduh ulang.
 * Reuse {@link #unduhBiner} (fungsi yg sama dipakai cache gambar produk) dgn batas konkurensi yg
 * sama pola-nya ({@link #BATAS_UNDUH_BERSAMAAN} produk vs konstanta lokal di sini utk foto).</p>
 *
 * @param {object} cfg konfigurasi server tersimpan (lihat {@link #readConfig}).
 * @return {Promise<{ok:boolean, pesan?:string, totalAnggota?:number, totalFoto?:number, fotoDiperbarui?:number}>}
 */
async function sinkronkanAnggotaLengkap(cfg) {
    if (sinkronAnggotaSedangBerjalan) {
        return { ok: false, pesan: 'Sinkronisasi data anggota sedang berjalan -- tunggu sampai selesai.' };
    }
    sinkronAnggotaSedangBerjalan = true;
    try {
        kirimStatusAnggotaSync({ tipe: 'mulai' });

        let sejakId = 0;
        let totalAnggota = 0;
        const perluFoto = [];
        for (;;) {
            const hasil = await panggilPosApi(cfg, 'anggota_sync_list', { sejak_id: sejakId, page_size: 200 }, 60000);
            if (!hasil.ok) {
                kirimStatusAnggotaSync({ tipe: 'error', tahap: 'data', pesan: hasil.pesan || 'Gagal mengambil data anggota dari server.' });
                return { ok: false, pesan: hasil.pesan || 'Gagal sinkron data anggota.' };
            }
            const data = (hasil.data && hasil.data.data) || [];
            if (data.length === 0) break;
            localDb.upsertAnggotaCache(data);
            totalAnggota += data.length;
            data.forEach((a) => { if (a.fotoUrl && a.fotoNama) perluFoto.push(a); });
            kirimStatusAnggotaSync({ tipe: 'data', totalSejauhIni: totalAnggota });

            const maksId = hasil.data && hasil.data.maksId;
            const adaLagi = hasil.data && hasil.data.adaLagi;
            if (!adaLagi || maksId == null) break;
            sejakId = maksId;
        }

        const dir = folderCacheFotoAnggota();
        const BATAS_UNDUH_BERSAMAAN_FOTO = 6;
        let terproses = 0;
        let diperbarui = 0;
        let terakhirLapor = Date.now();

        async function prosesSatuFoto(a) {
            const namaBerkasAman = String(a.fotoNama).replace(/[\\/:*?"<>|]/g, '_');
            const filePath = path.join(dir, String(a.id) + '_' + namaBerkasAman);
            let perluUnduh = true;
            try {
                if (fs.existsSync(filePath)) {
                    const st = fs.statSync(filePath);
                    if (a.fotoUkuran != null && st.size === Number(a.fotoUkuran)) perluUnduh = false;
                }
            } catch (e) { /* gagal cek berkas lokal -- anggap perlu unduh ulang, aman */ }

            if (perluUnduh) {
                try {
                    const bin = await unduhBiner(a.fotoUrl);
                    fs.writeFileSync(filePath, bin);
                    diperbarui++;
                } catch (e) {
                    // Gagal unduh SATU foto (mis. jaringan putus di tengah) -- lanjut ke anggota lain,
                    // JANGAN gagalkan seluruh sinkron. Anggota ini tetap punya data teks tersinkron,
                    // cuma foto lokalnya belum ter-update kali ini (akan dicoba lagi sinkron berikutnya).
                    terproses++;
                    return;
                }
            }
            localDb.updateFotoLokalAnggota(a.id, 'file://' + filePath.replace(/\\/g, '/'), a.fotoNama, a.fotoUkuran);
            terproses++;
            if (Date.now() - terakhirLapor > 700 || terproses === perluFoto.length) {
                kirimStatusAnggotaSync({ tipe: 'foto', terproses: terproses, totalFoto: perluFoto.length, diperbarui: diperbarui });
                terakhirLapor = Date.now();
            }
        }

        for (let i = 0; i < perluFoto.length; i += BATAS_UNDUH_BERSAMAAN_FOTO) {
            const batch = perluFoto.slice(i, i + BATAS_UNDUH_BERSAMAAN_FOTO);
            await Promise.all(batch.map(prosesSatuFoto));
        }

        kirimStatusAnggotaSync({ tipe: 'selesai', totalAnggota: totalAnggota, totalFoto: perluFoto.length, fotoDiperbarui: diperbarui });
        return { ok: true, totalAnggota: totalAnggota, totalFoto: perluFoto.length, fotoDiperbarui: diperbarui };
    } catch (e) {
        kirimStatusAnggotaSync({ tipe: 'error', tahap: 'umum', pesan: e && e.message ? e.message : String(e) });
        return { ok: false, pesan: 'Sinkronisasi anggota gagal: ' + (e && e.message ? e.message : e) };
    } finally {
        sinkronAnggotaSedangBerjalan = false;
    }
}

/**
 * Mem-parse SATU string header {@code Set-Cookie} (mis. {@code "JSESSIONID=abc; Path=/ecampus/; HttpOnly"})
 * jadi objek {name,value,path,maxAge,httpOnly}. Parser sengaja sederhana (bukan library eksternal) --
 * cuma perlu menangkap atribut yang benar-benar dipakai {@link #terapkanCookieKeSession}
 * ({@code Path}/{@code Max-Age}/{@code HttpOnly}); atribut lain (Domain/SameSite/dst) diabaikan.
 * @param {string} raw
 * @return {{name:string,value:string,path?:string,maxAge?:number,httpOnly:boolean}|null}
 */
function parseSetCookie(raw) {
    if (!raw) return null;
    const parts = raw.split(';').map((s) => s.trim());
    const first = parts.shift();
    const eq = first.indexOf('=');
    if (eq < 0) return null;
    const cookie = { name: first.substring(0, eq).trim(), value: first.substring(eq + 1).trim(), httpOnly: false };
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const lower = p.toLowerCase();
        if (lower.indexOf('path=') === 0) cookie.path = p.substring(5);
        else if (lower.indexOf('max-age=') === 0) {
            const n = parseInt(p.substring(8), 10);
            if (!isNaN(n)) cookie.maxAge = n;
        } else if (lower === 'httponly') cookie.httpOnly = true;
    }
    return cookie;
}

/**
 * Menggabungkan cookie jar (map nama-&gt;objek cookie) dengan array header {@code Set-Cookie} baru,
 * cookie bernama sama menimpa yang lama -- meniru perilaku cookie jar browser sungguhan across
 * beberapa permintaan berurutan pada "sesi" login yang sama (GET awal lalu POST ajax_login).
 * @param {object} jarLama
 * @param {string[]|string|undefined} setCookieHeaders
 * @return {object} jar baru (tidak memodifikasi jarLama).
 */
function gabungkanCookie(jarLama, setCookieHeaders) {
    const jar = Object.assign({}, jarLama);
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : (setCookieHeaders ? [setCookieHeaders] : []);
    for (let i = 0; i < list.length; i++) {
        const c = parseSetCookie(list[i]);
        if (c) jar[c.name] = c;
    }
    return jar;
}

/** Menyusun jar cookie jadi header {@code Cookie:} tunggal, mis. {@code "JSESSIONID=abc; lang=id"}. */
function serialisasiCookie(jar) {
    return Object.keys(jar).map((k) => k + '=' + jar[k].value).join('; ');
}

/**
 * Menerapkan seluruh cookie hasil login (jar) ke {@code session.defaultSession} milik Electron --
 * langkah TERAKHIR sebelum jendela kasir utama dibuka, supaya saat {@code mainWindow.loadURL(...)}
 * dipanggil, Chromium sudah membawa cookie sesi yang sama seperti kalau pengguna login lewat
 * login2.jsp langsung di jendela itu. Kegagalan menerapkan SATU cookie tidak boleh menggagalkan
 * seluruh proses login (mis. cookie remember-me opsional) -- karena itu setiap panggilan dibungkus
 * try/catch individual, bukan satu try/catch besar yang membatalkan semuanya.
 *
 * @param {object} jar hasil {@link #gabungkanCookie} dari seluruh permintaan login.
 * @param {{host:string, https:boolean}} cfg
 * @param {{cookie_val?:string}} jsonHasilLogin isi JSON respons {@code ajax_login} (dipakai utk cookie remember-me).
 * @param {boolean} rememberMe
 * @param {string} username
 */
async function terapkanCookieKeSession(jar, cfg, jsonHasilLogin, rememberMe, username) {
    const target = buildBaseUrl(cfg);
    const namaCookie = Object.keys(jar);
    for (let i = 0; i < namaCookie.length; i++) {
        const c = jar[namaCookie[i]];
        try {
            await session.defaultSession.cookies.set({
                url: target,
                name: c.name,
                value: c.value,
                path: c.path || '/',
                httpOnly: !!c.httpOnly,
                secure: cfg.https !== false,
                expirationDate: c.maxAge != null ? (Date.now() / 1000 + c.maxAge) : undefined
            });
        } catch (e) { abaikanKegagalanCookie(e); }
    }

    // Cookie remember-me: DI VERSI WEB (login2.jsp) ini di-set lewat document.cookie di renderer
    // SETELAH fetch() sukses -- di sini disamakan lewat session.cookies.set karena tidak ada
    // renderer yang berjalan di origin server (login.html adalah berkas lokal, bukan halaman server).
    if (rememberMe && jsonHasilLogin && jsonHasilLogin.cookie_val) {
        const maxAge = 15552000; // 180 hari, sama seperti nilai di login2.jsp
        try {
            await session.defaultSession.cookies.set({ url: target, name: 'userinfo', value: String(jsonHasilLogin.cookie_val), path: '/', expirationDate: Date.now() / 1000 + maxAge });
            await session.defaultSession.cookies.set({ url: target, name: 'userid', value: String(username || ''), path: '/', expirationDate: Date.now() / 1000 + maxAge });
        } catch (e) { abaikanKegagalanCookie(e); }
    }
}

/** No-op bertanda -- dipanggil dari katch cookie individual di {@link #terapkanCookieKeSession} supaya niat "sengaja diabaikan" eksplisit di kode, bukan catch kosong tanpa penjelasan. */
function abaikanKegagalanCookie(e) { /* satu cookie gagal diterapkan tidak boleh menggagalkan login -- lihat JavaDoc pemanggil. */ }

/**
 * Mengotentikasi pengguna ke server AIS memakai endpoint AJAX yang SAMA PERSIS dengan yang dipakai
 * form login di {@code login2.jsp} ({@code POST <root>/login?action=ajax_login}, lihat
 * {@code Login.java}) -- dipanggil dari layar login LOKAL (login.html) lewat handler IPC
 * {@code login:submit}.
 *
 * <p><b>Kenapa dijalankan di proses utama, bukan {@code fetch()} di renderer login.html:</b>
 * login.html dimuat sebagai berkas LOKAL ({@code file://}), sedangkan endpoint login ada di domain
 * server ({@code https://host/...}) -- permintaan lintas-origin semacam itu dari renderer akan kena
 * CORS (server tidak mengirim header {@code Access-Control-Allow-Origin} utk permintaan dari
 * {@code file://}, dan memang tidak semestinya diubah hanya demi fitur ini). Permintaan HTTP dari
 * proses utama (Node {@code http}/{@code https}) TIDAK tunduk pada CORS sama sekali karena CORS
 * murni aturan yang ditegakkan browser terhadap konteks halaman, bukan aturan protokol HTTP itu
 * sendiri -- jadi pendekatan ini menghindari kebutuhan mengubah apa pun di sisi server.</p>
 *
 * <p><b>Kenapa GET dulu sebelum POST</b> (bukan langsung POST tanpa cookie sama sekali): meniru
 * persis apa yang terjadi saat pengguna membuka login2.jsp lewat browser biasa -- memuat halaman
 * dulu (yang oleh container servlet biasanya sudah membuat {@code HttpSession}+cookie
 * {@code JSESSIONID}), BARU kemudian AJAX POST login dikirim membawa cookie sesi itu. Langsung POST
 * tanpa GET awal berisiko diperlakukan server sebagai permintaan "sesi kosong" yang perilakunya belum
 * tentu sama dengan alur yang sudah terbukti jalan di login2.jsp.</p>
 *
 * @param {{host:string, contextPath:string, https:boolean}} cfg
 * @param {string} username
 * @param {string} password
 * @param {boolean} rememberMe
 * @return {Promise<{ok:boolean, redirect?:string, pesan?:string}>}
 */
async function prosesLoginServer(cfg, username, password, rememberMe) {
    const target = buildBaseUrl(cfg);
    try {
        const awal = await requestHttp(target, { method: 'GET' });
        let jar = gabungkanCookie({}, awal.headers['set-cookie']);

        const bodyParts = ['username=' + encodeURIComponent(username), 'password=' + encodeURIComponent(password)];
        if (rememberMe) bodyParts.push('rememberMe=true');
        const body = bodyParts.join('&');

        const hasilLogin = await requestHttp(target + 'login?action=ajax_login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(body),
                'Cookie': serialisasiCookie(jar)
            },
            body: body
        });
        jar = gabungkanCookie(jar, hasilLogin.headers['set-cookie']);

        let json;
        try {
            json = JSON.parse(hasilLogin.body);
        } catch (e) {
            return { ok: false, pesan: 'Server memberi respons tak terduga (bukan JSON). Coba lagi atau hubungi admin sistem.' };
        }

        if (json.status !== 'success') {
            return { ok: false, pesan: json.message || 'Nama pengguna atau kata sandi tidak valid. Silakan periksa kembali.' };
        }

        await terapkanCookieKeSession(jar, cfg, json, rememberMe, username);

        // Token API POS lokal (BARU, lihat JavaDoc PosApi/PosDeviceAuthApi di server) -- WAJIB
        // berhasil supaya layar Kasir lokal bisa dipakai; kalau gagal, seluruh login dianggap gagal
        // (bukan "login sukses tapi Kasir tidak bisa dipakai" yg membingungkan) supaya pesan error-nya
        // eksplisit menunjuk akar masalah (mis. migrasi tabel pos_device_token belum dijalankan).
        const hasilToken = await mintaTokenPosApi(target, username, password);
        if (!hasilToken.ok) {
            return { ok: false, pesan: 'Berhasil memverifikasi akun, tetapi gagal menyiapkan sesi Kasir: ' + hasilToken.pesan };
        }

        return { ok: true, redirect: json.redirect || '/main', posToken: hasilToken.token };
    } catch (e) {
        // offline:true (BEDA dari penolakan server di baris 964-966 di atas, yg TIDAK menyertakan
        // flag ini) -- exception di sini berarti server TAK TERJANGKAU (timeout/DNS/dst), bukan
        // kredensial ditolak. Pembeda ini dipakai handler login:coba-auto utk memutuskan apakah
        // kredensial "Ingat Saya" boleh dipertahankan + tombol "Masuk Mode Offline" ditawarkan
        // (lihat JavaDoc handler tsb).
        return { ok: false, offline: true, pesan: pesanDariErrorKoneksi(e) };
    }
}

/**
 * Meminta token API POS lokal ke {@code /PosApi} (aksi {@code login}) -- dipanggil dari
 * {@link #prosesLoginServer} SETELAH login cookie sukses, memakai username/password yang SAMA
 * (divalidasi ULANG di server lewat jalur {@code SecurityFilter.doAutoLogin} yang sama persis,
 * lihat JavaDoc {@code PosDeviceAuthApi.terbitkanToken}).
 *
 * @param {string} target hasil {@link #buildBaseUrl}(cfg).
 * @param {string} username
 * @param {string} password
 * @return {Promise<{ok:boolean, token?:string, expiresAt?:number, pesan?:string}>}
 */
async function mintaTokenPosApi(target, username, password) {
    try {
        const body = JSON.stringify({ action: 'login', username: username, password: password, labelPerangkat: 'Kasir Desktop' });
        const hasil = await requestHttp(target + 'PosApi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(body) },
            body: body
        });
        let json;
        try {
            json = JSON.parse(hasil.body);
        } catch (e) {
            return { ok: false, pesan: 'Server memberi respons tak terduga dari /PosApi.' };
        }
        if (json.status !== 'success') {
            return { ok: false, pesan: json.message || 'Gagal memperoleh token API.' };
        }
        return { ok: true, token: json.token, expiresAt: json.expiresAt };
    } catch (e) {
        return { ok: false, pesan: pesanDariErrorKoneksi(e) };
    }
}

/**
 * Memanggil satu aksi {@code /PosApi} yang SUDAH memerlukan token (semua aksi selain {@code login}),
 * membawa header {@code Authorization: Bearer <posApiToken>}. Dipakai SELURUH handler IPC
 * {@code pos:*} di bawah -- satu titik pemanggilan supaya penanganan token-hilang/kedaluwarsa (401)
 * konsisten di semua aksi, bukan ditulis ulang per handler.
 *
 * @param {{host:string, contextPath:string, https:boolean}} cfg
 * @param {string} action mis. {@code "katalog"}, {@code "bayar"}, dst.
 * @param {object} payload field tambahan sesuai aksi (digabung dgn {@code action}).
 * @param {number} [timeoutMs] batas waktu tunggu kustom (mis. dipakai {@code anggota_sync_list} yg
 *                 tiap batch-nya bisa lambat di server -- lihat JavaDoc {@link #sinkronkanAnggotaLengkap}).
 *                 Default 15 detik (sama seperti sebelumnya) bila tidak diisi.
 * @return {Promise<{ok:boolean, data?:object, pesan?:string, butuhLoginUlang?:boolean}>}
 */
async function panggilPosApi(cfg, action, payload, timeoutMs) {
    if (!posApiToken) {
        // Login Mode Offline (lihat handler login:coba-offline) SENGAJA tak pernah punya token --
        // ini BUKAN sesi hilang/kedaluwarsa, jadi jangan diperlakukan sbg butuhLoginUlang (yg akan
        // memaksa kasir kembali ke layar login secara tak semestinya). Balas offline:true supaya
        // SELURUH pemanggil (pos:katalog/pos:konfigurasi/prosesTransaksiPosOfflineFirst dst) jatuh ke
        // jalur fallback-cache/antrean-lokal yg SUDAH ADA, tanpa perlu logika baru di tiap handler.
        if (modeOffline) {
            return { ok: false, offline: true, pesan: 'Mode Offline -- tidak ada koneksi ke server.' };
        }
        return { ok: false, pesan: 'Belum ada sesi Kasir aktif. Silakan masuk kembali.', butuhLoginUlang: true };
    }
    try {
        const payloadKirim = Object.assign({}, payload || {});
        if (posTokoAktifId != null
                && payloadKirim.tokoId == null && payloadKirim.id_toko == null
                && payloadKirim.idToko == null && payloadKirim.toko_id == null) {
            payloadKirim.tokoId = posTokoAktifId;
        }
        const body = JSON.stringify(Object.assign({}, payloadKirim, { action: action }));
        const hasil = await requestHttp(buildBaseUrl(cfg) + 'PosApi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Content-Length': Buffer.byteLength(body),
                'Authorization': 'Bearer ' + posApiToken
            },
            body: body,
            timeout: timeoutMs || 15000
        });
        let json;
        try {
            json = JSON.parse(hasil.body);
        } catch (e) {
            // Kegagalan aksi 'error_log_kirim' SENGAJA TIDAK dicatat lewat catatErrorLogAman di SELURUH
            // fungsi ini (4 titik, lihat jg 2 titik di bawah) -- payloadUntukLogAman akan menyertakan
            // `payload.baris` (baris2 log yg SEDANG dikirim, bisa sampai 100 baris), jadi mencatatnya sbg
            // baris error BARU membuat baris itu tersertakan lagi di siklus kirim BERIKUTNYA, bertumpuk
            // makin dalam & besar tanpa batas tiap kali server tak terjangkau (persis skenario yg justru
            // sedang coba dilaporkan). Kegagalan sinkron sudah ditangani diam2 di
            // {@link #sinkronkanErrorLogPending} (dicoba lagi siklus 60 detik berikutnya) & konektivitas
            // yg sama tetap tercatat lewat aksi2 LAIN yg gagal di siklus yg sama.
            if (action !== 'error_log_kirim') {
                catatErrorLogAman({ sumber: 'main:api:' + action, tingkat: 'error', pesan: 'Server memberi respons tak terduga (bukan JSON valid) dari /PosApi.', detail: payloadUntukLogAman(action, payload) + '\n\nRaw (dipotong): ' + String(hasil.body).slice(0, 500), layar: 'main-process' });
            }
            return { ok: false, pesan: 'Server memberi respons tak terduga dari /PosApi.' };
        }
        if (hasil.statusCode === 401) {
            posApiToken = null;
            posTokoAktifId = null;
            if (action !== 'error_log_kirim') {
                catatErrorLogAman({ sumber: 'main:api:' + action, tingkat: 'peringatan', pesan: 'Sesi Kasir kedaluwarsa (401) saat aksi "' + action + '".', detail: payloadUntukLogAman(action, payload), layar: 'main-process' });
            }
            return { ok: false, pesan: json.message || 'Sesi Kasir kedaluwarsa. Silakan masuk kembali.', butuhLoginUlang: true };
        }
        if (json.status !== 'success') {
            // "peringatan" (bukan "error") -- ini penolakan BISNIS normal dari server (mis. validasi
            // input, saldo tidak cukup), bukan crash/bug. Tetap dicatat (menu Log Error diminta
            // menampilkan SEMUA error/exception) supaya pola penolakan berulang tetap terlihat, tapi
            // ditingkat lebih rendah drpd kegagalan jaringan/parse di atas & bawah.
            if (action !== 'error_log_kirim') {
                catatErrorLogAman({ sumber: 'main:api:' + action, tingkat: 'peringatan', pesan: json.message || ('Permintaan "' + action + '" ditolak server.'), detail: payloadUntukLogAman(action, payload), layar: 'main-process' });
            }
            return { ok: false, pesan: json.message || 'Permintaan ditolak server.' };
        }
        return { ok: true, data: json };
    } catch (e) {
        // Kegagalan JARINGAN (offline) -- BEDA dari penolakan server (di atas). Pemanggil (handler
        // pos:katalog/pos:konfigurasi/pos:bayar) yang memutuskan fallback ke cache lokal, bukan di
        // sini -- fungsi ini murni "coba panggil API", tidak tahu apa yg tersedia sbg cadangan.
        if (action !== 'error_log_kirim') {
            catatErrorLogAman({ sumber: 'main:api:' + action, tingkat: 'error', pesan: pesanDariErrorKoneksi(e), detail: payloadUntukLogAman(action, payload) + '\n\n' + (e && e.stack ? e.stack : String(e)), layar: 'main-process' });
        }
        return { ok: false, offline: true, pesan: pesanDariErrorKoneksi(e) };
    }
}

/** Menampilkan error.html (fallback ramah) di {@code win} ketika URL server gagal dimuat. */
function loadErrorPage(win, cfg, errorDescription) {
    if (!win || win.isDestroyed()) return;
    const target = buildBaseUrl(cfg);
    win.loadFile('error.html', { query: { url: target, pesan: errorDescription || '' } });
}

/**
 * Menentukan posisi/ukuran jendela Layar Pelanggan (dipakai KEDUA versi -- remote {@link #openCustomerWindow}
 * dan lokal {@link #bukaLayarPelangganLokal}): bila sistem punya lebih dari satu monitor, kembalikan
 * bounds monitor KEDUA (bukan monitor utama tempat kasir bekerja) supaya jendela itu bisa diposisikan
 * PERSIS memenuhi layar itu dan fullscreen di sana -- meniru pengalaman mesin EDC/kasir kios sungguhan.
 * Bila hanya ada satu monitor, kembalikan bounds jendela biasa (tidak fullscreen) supaya operator tetap
 * bisa melihat/menutupnya dengan mudah saat menguji tanpa monitor kedua.
 * @return {{secondary: object|null, bounds: {x:number,y:number,width:number,height:number}}}
 */
function hitungBoundsMonitorKedua() {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const secondary = displays.find(d => d.id !== primary.id) || null;
    const bounds = secondary ? secondary.bounds : { x: 100, y: 100, width: 1280, height: 800 };
    return { secondary, bounds };
}

/**
 * Membuka (atau memfokuskan bila sudah terbuka) jendela Layar Pelanggan REMOTE (memuat URL server,
 * dipanggil dari halaman web lengkap lewat window.electronAPI.openCustomerScreen -- lihat
 * JavaDoc {@link #bukaLayarPelangganLokal} utk versi LOKAL yang dipakai pos.html).
 *
 * @param {string} url URL halaman layar_pelanggan.jsp lengkap dengan parameter channel/toko.
 */
function openCustomerWindow(url) {
    if (customerWindow && !customerWindow.isDestroyed()) { customerWindow.loadURL(url); customerWindow.focus(); return; }

    const { secondary, bounds } = hitungBoundsMonitorKedua();

    customerWindow = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        title: 'Layar Pelanggan',
        autoHideMenuBar: true,
        frame: !secondary, // di monitor kedua: tanpa frame/kiosk-style; di monitor tunggal (mode uji): pakai frame biasa spy mudah ditutup
        webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    customerWindow.setMenuBarVisibility(false);
    if (secondary) customerWindow.setFullScreen(true);
    customerWindow.loadURL(url);
    customerWindow.on('closed', () => { customerWindow = null; });
}

/** Menutup jendela Layar Pelanggan bila sedang terbuka. Aman dipanggil walau sudah tertutup. */
function closeCustomerWindow() {
    if (customerWindow && !customerWindow.isDestroyed()) customerWindow.close();
    customerWindow = null;
}

/**
 * Membuka (atau memfokuskan bila sudah terbuka) jendela Layar Pelanggan LOKAL (customer.html) --
 * dipanggil dari pos.html lewat handler {@code pos:layar-pelanggan-buka}. Posisi/ukuran memakai
 * {@link #hitungBoundsMonitorKedua}, pola SAMA PERSIS dgn {@link #openCustomerWindow} (remote), hanya
 * beda {@code loadFile} drpd {@code loadURL} dan preload KHUSUS ({@code preload-customer.js}, TIDAK
 * berbagi {@code preload.js} milik jendela Kasir -- prinsip akses sekecil mungkin per jendela).
 *
 * <p>Begitu halaman selesai dimuat ({@code did-finish-load}), bila ada {@link #layarPelangganStateTerakhir}
 * tersimpan (transaksi sedang berjalan saat jendela ini dibuka/reconnect), langsung dikirim supaya
 * pembeli tidak melihat layar kosong di tengah transaksi -- lihat JavaDoc field itu.</p>
 *
 * @return {{ok:boolean, adaMonitorKedua:boolean}}
 */
function bukaLayarPelangganLokal() {
    const { secondary, bounds } = hitungBoundsMonitorKedua();

    if (layarPelangganWindow && !layarPelangganWindow.isDestroyed()) {
        layarPelangganWindow.focus();
        return { ok: true, adaMonitorKedua: !!secondary };
    }

    layarPelangganWindow = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        title: 'Layar Pelanggan',
        autoHideMenuBar: true,
        frame: !secondary,
        webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload-customer.js') }
    });
    layarPelangganWindow.setMenuBarVisibility(false);
    if (secondary) layarPelangganWindow.setFullScreen(true);
    layarPelangganWindow.loadFile('customer.html');
    layarPelangganWindow.webContents.on('did-finish-load', () => {
        if (layarPelangganStateTerakhir && layarPelangganWindow && !layarPelangganWindow.isDestroyed()) {
            layarPelangganWindow.webContents.send('pos:layar-pelanggan-pesan', layarPelangganStateTerakhir);
        }
    });
    layarPelangganWindow.on('closed', () => { layarPelangganWindow = null; });

    return { ok: true, adaMonitorKedua: !!secondary };
}

/** Menutup jendela Layar Pelanggan LOKAL bila sedang terbuka. Aman dipanggil walau sudah tertutup. */
function tutupLayarPelangganLokal() {
    if (layarPelangganWindow && !layarPelangganWindow.isDestroyed()) layarPelangganWindow.close();
    layarPelangganWindow = null;
}

/**
 * Menu bar minimal (disembunyikan secara default via autoHideMenuBar, muncul saat pengguna menekan
 * Alt) -- HANYA berisi cara untuk kembali ke wizard pengaturan bila alamat server perlu diubah
 * (mis. berpindah dari server demo ke server produksi) tanpa harus menghapus config.json manual.
 */
function setupAppMenu() {
    const template = [
        {
            label: 'Pengaturan',
            submenu: [
                {
                    label: 'Ubah Alamat Server...',
                    click: () => openSetupWindow()
                },
                {
                    label: 'Muat Ulang',
                    accelerator: 'F5',
                    click: () => { if (mainWindow) mainWindow.reload(); }
                },
                { type: 'separator' },
                {
                    label: 'Buka Aplikasi Lengkap (Online)...',
                    click: () => bukaAplikasiLengkap()
                },
                {
                    label: 'Kembali ke Kasir (Lokal)',
                    click: () => kembaliKeKasirLokal()
                },
                { type: 'separator' },
                {
                    label: 'Arsipkan Transaksi Lama...',
                    click: () => arsipkanTransaksiLamaDenganKonfirmasi()
                },
                { type: 'separator' },
                {
                    label: 'Keluar Akun (Logout)...',
                    click: () => logoutDariAplikasi()
                },
                { type: 'separator' },
                {
                    label: 'Keluar',
                    click: () => app.quit()
                }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Alur "Arsipkan Transaksi Lama" dari menu: konfirmasi dulu ke kasir/admin (operasi ini memindahkan
 * banyak baris sekaligus, walau tidak menghapus data secara permanen -- tetap layak dikonfirmasi
 * supaya tidak terpicu tidak sengaja), jalankan {@link localDb.arsipkanLama}, lalu tampilkan
 * ringkasan hasilnya. Transaksi yang masih PENDING tidak pernah ikut terpengaruh (lihat JavaDoc
 * {@code arsipkanLama} di local-db.js) -- aman dijalankan kapan saja tanpa risiko kehilangan
 * transaksi yang belum tersinkron.
 */
async function arsipkanTransaksiLamaDenganKonfirmasi() {
    if (!mainWindow) return;
    const konfirmasi = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Batal', 'Arsipkan Sekarang'],
        defaultId: 1,
        cancelId: 0,
        title: 'Arsipkan Transaksi Lama',
        message: 'Pindahkan transaksi yang sudah tersinkron lebih dari 90 hari ke berkas arsip terpisah?',
        detail: 'Data TIDAK dihapus -- hanya dipindah ke berkas arsip bulanan terpisah supaya database utama tetap ringan. Transaksi yang belum tersinkron tidak akan terpengaruh.'
    });
    if (konfirmasi.response !== 1) return;

    try {
        const hasil = localDb.arsipkanLama(90);
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Arsip Selesai',
            message: hasil.dipindah > 0
                ? (hasil.dipindah + ' transaksi dipindahkan ke:\n' + hasil.berkasArsip)
                : 'Tidak ada transaksi yang cukup lama untuk diarsipkan saat ini.'
        });
    } catch (e) {
        dialog.showMessageBox(mainWindow, { type: 'error', title: 'Gagal Mengarsipkan', message: String(e && e.message ? e.message : e) });
    }
}

/**
 * Alur "Keluar Akun (Logout)" dari menu -- SATU-SATUNYA cara kredensial "Ingat Saya" dihapus SELAIN
 * secara otomatis saat auto-login ternyata gagal (lihat JavaDoc handler {@code login:coba-auto}).
 * Konfirmasi dulu (operasi ini mengeluarkan kasir yg sedang aktif, layak dikonfirmasi spy tak
 * terpicu tak sengaja), lalu hapus kredensial tersimpan dan kembali ke layar login.
 */
async function logoutDariAplikasi() {
    if (!mainWindow) return;
    const konfirmasi = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Batal', 'Keluar Akun'],
        defaultId: 1,
        cancelId: 0,
        title: 'Keluar Akun',
        message: 'Keluar dari akun ini dan lupakan info "Ingat Saya" di perangkat ini?',
        detail: 'Anda akan kembali ke layar login. Kasir lain bisa masuk dengan akun mereka sendiri setelah ini.'
    });
    if (konfirmasi.response !== 1) return;

    hapusKredensialDiingat();
    hapusHashOfflineLogin();
    modeOffline = false;
    // Cabut token API POS di server (best-effort -- kegagalan di sini TIDAK menghentikan alur logout;
    // token yg gagal dicabut toh sudah tak dipakai lagi begitu posApiToken=null di bawah, dan akan
    // kedaluwarsa sendiri sesuai masa berlakunya di PosDeviceAuthApi).
    const cfg = readConfig();
    if (cfg && posApiToken) { panggilPosApi(cfg, 'logout', {}).catch(() => {}); }
    posApiToken = null;
    posTokoAktifId = null;
    urlAplikasiLengkap = null;
    tutupLayarPelangganLokal();
    layarPelangganStateTerakhir = null;

    // Urutan sengaja: buka login DULU baru tutup jendela kasir -- alasan sama spt 'setup:save'/'error-page:retry'.
    if (cfg) openLoginWindow(cfg);
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.close(); mainWindow = null; }
}

/**
 * Fitur "Tombol Logout" di sidebar SEMUA 13 layar (gap-closure Toko Al-Bahjah -- kasir non-teknis
 * jarang menyadari menu native "Keluar Akun (Logout)..." di menu bar aplikasi). Tombol ini MURNI
 * pemicu -- meneruskan ke {@link #logoutDariAplikasi} yg SUDAH ADA (SATU-SATUNYA tempat logika
 * konfirmasi + hapus kredensial "Ingat Saya"/hash offline + cabut token ditulis), supaya tak ada 2
 * implementasi logout yg bisa diam-diam berbeda perilaku.
 */
ipcMain.handle('pos:logout-akun', async () => {
    await logoutDariAplikasi();
    return { ok: true };
});

// ==== IPC: dipanggil dari renderer (setup.html lewat preload-setup.js) ====
ipcMain.handle('setup:get-current', () => readConfig());
ipcMain.handle('setup:test-connection', (event, cfg) => tesKoneksiServer(cfg));
/** Fitur "Alih Bahasa" -- padanan {@code login:i18n-kamus} utk layar Pengaturan Server. */
ipcMain.handle('setup:i18n-kamus', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    try {
        const body = JSON.stringify(Object.assign({}, payload || {}, { action: 'i18n_kamus' }));
        const hasil = await requestHttp(buildBaseUrl(cfg) + 'PosApi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(body) },
            body: body
        });
        const json = JSON.parse(hasil.body);
        if (json.status !== 'success') return { ok: false, pesan: json.message || 'Permintaan ditolak server.' };
        return { ok: true, data: json };
    } catch (e) {
        return { ok: false, offline: true, pesan: pesanDariErrorKoneksi(e) };
    }
});
ipcMain.on('setup:save', (event, cfg) => {
    writeConfig(cfg);
    // Kredensial "Ingat Saya" lama (bila ada) dibuat utk server SEBELUMNYA -- berisiko dipakai
    // auto-login ke server BARU yg belum tentu punya akun yg sama, jadi dihapus sekalian (termasuk
    // hash "Login Mode Offline" turunannya -- sama-sama terikat ke server lama).
    hapusKredensialDiingat();
    hapusHashOfflineLogin();

    // Urutan SENGAJA -- buka login DULU, baru tutup setupWindow/mainWindow LAMA:
    // setupWindow PUNYA handler 'closed' sendiri yg mengecek "if (!mainWindow) app.quit()" (lihat
    // openSetupWindow) -- pada instalasi PERTAMA (skenario PERSIS yg dilaporkan: isi alamat, Tes
    // Koneksi, Simpan & Buka Aplikasi) mainWindow memang belum pernah ada sama sekali, jadi kalau
    // setupWindow.destroy() dipanggil SEBELUM openLoginWindow() sempat jalan, pengecekan itu salah
    // mengira tak ada jendela lain yg akan dibuka dan APLIKASI LANGSUNG KELUAR tanpa apa pun muncul
    // -- bug nyata yg dilaporkan pengguna, sama persis polanya dgn yg sudah diperbaiki di
    // 'login:submit'/'error-page:retry' TAPI KELEWATAN di sini karena setupWindow adalah jendela
    // KETIGA yg juga punya pengecekan app.quit() sendiri, bukan cuma mainWindow/loginWindow berdua.
    openLoginWindow(cfg);
    if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.destroy(); setupWindow = null; }
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.close(); mainWindow = null; }
});

// ==== IPC: dipanggil dari renderer layar login (login.html lewat preload-login.js) ====
ipcMain.handle('login:get-context', () => {
    const cfg = readConfig();
    return cfg ? { host: cfg.host } : null;
});

/**
 * Fitur "Alih Bahasa" -- KHUSUS layar Login (belum punya token sama sekali, {@link #panggilPosApi}
 * SELALU menolak sebelum token ada). Memanggil {@code PosApi} action {@code i18n_kamus} LANGSUNG
 * (bukan lewat {@code panggilPosApi}) karena server SUDAH mengecualikan aksi ini dari gerbang token
 * (lihat JavaDoc {@code PosApi.proses} di server) -- kamus terjemahan bukan data sensitif, aman
 * diminta tanpa otentikasi.
 */
ipcMain.handle('login:i18n-kamus', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    try {
        const body = JSON.stringify(Object.assign({}, payload || {}, { action: 'i18n_kamus' }));
        const hasil = await requestHttp(buildBaseUrl(cfg) + 'PosApi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(body) },
            body: body
        });
        const json = JSON.parse(hasil.body);
        if (json.status !== 'success') return { ok: false, pesan: json.message || 'Permintaan ditolak server.' };
        return { ok: true, data: json };
    } catch (e) {
        return { ok: false, offline: true, pesan: pesanDariErrorKoneksi(e) };
    }
});
/**
 * Menyimpan token API POS + URL aplikasi lengkap hasil login SUKSES ke state proses utama --
 * dipisah dari {@link #bukaAplikasiSetelahLoginSukses} (yang membuka/menutup jendela) supaya
 * login.html punya JEDA setelah login sukses tapi SEBELUM masuk ke jendela kasir, dipakai
 * menampilkan langkah "Sinkronkan Data" (lihat handler {@code login:sinkron-data}/{@code login:selesai}
 * di bawah) -- token sudah tersedia begitu fungsi ini dipanggil, tanpa perlu jendela kasir terbuka
 * dulu.
 * @param {{host:string, https:boolean}} cfg
 * @param {{redirect?:string, posToken?:string}} hasilLogin hasil sukses dari {@link #prosesLoginServer}.
 */
function simpanStatePascaLogin(cfg, hasilLogin) {
    urlAplikasiLengkap = buildOriginUrl(cfg) + (hasilLogin.redirect || '/main');
    if (hasilLogin.posToken) posApiToken = hasilLogin.posToken;
    posTokoAktifId = null;
}

/**
 * Membuka jendela kasir utama (memakai token/URL yang SUDAH tersimpan lewat
 * {@link #simpanStatePascaLogin}), lalu menutup layar login -- dipanggil dari handler
 * {@code login:selesai} SETELAH langkah "Sinkronkan Data" selesai/dilewati oleh pengguna.
 * @param {{host:string, contextPath:string, https:boolean}} cfg
 */
function bukaAplikasiSetelahLoginSukses(cfg) {
    // Urutan SENGAJA: buka jendela kasir DULU, baru tutup layar login. loginWindow.destroy()
    // memicu event 'closed' SECARA SINKRON, dan handler 'closed'-nya mengecek
    // "if (!mainWindow) app.quit()" -- kalau destroy() dipanggil DULU sebelum openMainWindow()
    // sempat mengisi variabel mainWindow, pengecekan itu masih melihat mainWindow == null dan
    // APLIKASI LANGSUNG KELUAR tepat setelah login sukses (bug nyata yg pernah terjadi dan
    // dilaporkan pengguna -- lihat pola sama yg diperbaiki di 'setup:save' dan 'error-page:retry').
    openMainWindow(cfg);
    if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.destroy(); loginWindow = null; }
}

ipcMain.handle('login:submit', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur. Tutup jendela ini dan atur ulang lewat wizard pengaturan.' };

    const username = (payload && payload.username || '').trim();
    const password = (payload && payload.password) || '';
    const rememberMe = !!(payload && payload.rememberMe);
    if (!username || !password) {
        return { ok: false, pesan: 'Nama pengguna dan kata sandi tidak boleh kosong.' };
    }

    const hasil = await prosesLoginServer(cfg, username, password, rememberMe);
    if (!hasil.ok) return hasil;

    // Simpan/hapus kredensial "Ingat Saya" SESUAI checkbox -- termasuk kasus checkbox DIURUNGKAN
    // (sebelumnya pernah dicentang, sekarang tidak): permintaan eksplisit "jangan diingat lagi" harus
    // dihormati, bukan diam-diam membiarkan kredensial lama tetap tersimpan. Hash "Login Mode Offline"
    // (lihat JavaDoc simpanHashOfflineLogin) mengikuti keputusan yg sama -- hanya ada utk akun yg
    // eksplisit dipercayakan ke perangkat ini.
    if (rememberMe) { simpanKredensialDiingat(username, password); simpanHashOfflineLogin(username, password); }
    else { hapusKredensialDiingat(); hapusHashOfflineLogin(); }

    // Login manual ONLINE barusan sukses -- pastikan sesi TIDAK lagi ditandai Mode Offline dari
    // percobaan sebelumnya (mis. kasir sempat masuk offline, lalu koneksi pulih dan login ulang manual).
    modeOffline = false;

    // TIDAK langsung buka jendela kasir di sini -- login.html menampilkan langkah "Sinkronkan Data"
    // dulu (lihat login:sinkron-data/login:selesai), token sudah siap dipakai sejak baris ini.
    simpanStatePascaLogin(cfg, hasil);
    return { ok: true };
});

/**
 * Dipanggil OTOMATIS oleh login-renderer.js begitu layar login selesai dimuat (SEBELUM pengguna
 * sempat mengetik apa pun) -- mencoba login DIAM-DIAM memakai kredensial "Ingat Saya" tersimpan
 * (lihat {@link #bacaKredensialDiingat}), supaya pengguna yg sudah mencentang "Ingat akun saya"
 * benar-benar langsung masuk tanpa mengulang login, PERSIS seperti yg diminta pengguna ("harusnya
 * jika diingat, harus langsung masuk").
 *
 * <p>Kalau tidak ada kredensial tersimpan sama sekali, langsung kembalikan {@code {tried:false}}
 * TANPA menyentuh jaringan -- form login manual tampil seperti biasa, tak ada jeda tambahan.</p>
 *
 * <p>Kalau kredensial tersimpan ternyata SUDAH TIDAK VALID (kata sandi diganti admin, akun
 * dinonaktifkan, dst), kredensial itu DIHAPUS otomatis (lihat {@link #hapusKredensialDiingat}) --
 * tak ada gunanya terus mencoba kredensial yg terbukti salah tiap kali app dibuka -- dan
 * dikembalikan {@code username}-nya saja (BUKAN pesan errornya mentah-mentah, supaya tak terkesan
 * kredensial pengguna "diserang"/salah ketik -- cukup diprefill username-nya, kata sandi diketik
 * ulang oleh pengguna).</p>
 *
 * <p><b>Kalau server TAK TERJANGKAU</b> (flag {@code offline:true} dari {@link #prosesLoginServer},
 * BEDA dari penolakan kredensial di atas): kredensial "Ingat Saya" TIDAK dihapus (masih valid, cuma
 * jaringan yg bermasalah) -- dikembalikan {@code offline:true} + {@code bisaOfflineLogin} (apakah ada
 * hash "Login Mode Offline" tersimpan utk akun ini, lihat {@link #adaHashOfflineLogin}) supaya
 * login-renderer.js bisa menawarkan tombol "Masuk Mode Offline" (lihat handler
 * {@code login:coba-offline}) alih-alih form login manual yg toh juga akan gagal krn jaringan sama.</p>
 *
 * @return {Promise<{tried:boolean, ok?:boolean, offline?:boolean, bisaOfflineLogin?:boolean, pesan?:string, username?:string}>}
 */
ipcMain.handle('login:coba-auto', async () => {
    const cfg = readConfig();
    if (!cfg) return { tried: false };

    const kredensial = bacaKredensialDiingat();
    if (!kredensial) return { tried: false };

    const hasil = await prosesLoginServer(cfg, kredensial.username, kredensial.password, true);
    if (hasil.ok) {
        // Sama seperti login manual: TIDAK langsung buka jendela kasir -- login.html tetap
        // menampilkan langkah "Sinkronkan Data" dulu meski login-nya otomatis (konsisten, kasir
        // selalu tahu kondisi data lokal terbaru tiap app dibuka, bukan cuma saat login manual).
        modeOffline = false;
        simpanStatePascaLogin(cfg, hasil);
        return { tried: true, ok: true };
    }

    if (hasil.offline) {
        return {
            tried: true, ok: false, offline: true,
            bisaOfflineLogin: adaHashOfflineLogin(kredensial.username),
            pesan: hasil.pesan, username: kredensial.username
        };
    }

    hapusKredensialDiingat();
    hapusHashOfflineLogin();
    return { tried: true, ok: false, pesan: hasil.pesan, username: kredensial.username };
});

/**
 * Handler "Masuk Mode Offline" -- dipanggil dari login-renderer.js saat {@code login:coba-auto}
 * melaporkan server tak terjangkau ({@code offline:true}) TAPI ada hash lokal tersimpan
 * ({@code bisaOfflineLogin:true}, lihat JavaDoc handler tsb). Kata sandi diketik ULANG oleh kasir dan
 * diverifikasi LOKAL (lihat {@link #verifikasiHashOfflineLogin}) -- TIDAK ada permintaan jaringan sama
 * sekali di jalur ini, konsisten dgn premis "server tak terjangkau".
 *
 * <p>Sukses berarti masuk TANPA {@link #posApiToken} (tetap {@code null}) -- flag {@link #modeOffline}
 * diset {@code true} sebagai gantinya, dibaca {@code login:selesai} sbg syarat alternatif pembuka
 * jendela kasir, dan dibaca layar Kasir (lewat IPC {@code pos:mode-offline}) utk menampilkan banner
 * serta menyembunyikan aksi yg mutlak butuh server. Langkah "Sinkronkan Data" DILEWATI sepenuhnya --
 * tak ada jaringan utk disinkronkan; layar Kasir akan memakai cache katalog/konfigurasi lokal yg sudah
 * ada dari sinkronisasi online sebelumnya.</p>
 *
 * @param {{username:string, password:string}} payload
 * @return {Promise<{ok:boolean, pesan?:string}>}
 */
ipcMain.handle('login:coba-offline', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };

    const username = (payload && payload.username || '').trim();
    const password = (payload && payload.password) || '';
    if (!username || !password) return { ok: false, pesan: 'Nama pengguna dan kata sandi tidak boleh kosong.' };

    if (!verifikasiHashOfflineLogin(username, password)) {
        return { ok: false, pesan: 'Kata sandi salah.' };
    }

    modeOffline = true;
    posApiToken = null;
    posTokoAktifId = null;
    bukaAplikasiSetelahLoginSukses(cfg);
    return { ok: true };
});

/**
 * Mengunduh katalog produk+kategori dan konfigurasi POS terbaru lalu menyimpannya ke cache SQLite
 * lokal ({@link localDb.simpanCache}) -- ini "proses migrasi data ke database lokal" yang dipicu
 * tombol "Sinkronkan Data" di login.html, tampil SETELAH login berhasil (manual maupun otomatis)
 * TAPI SEBELUM jendela kasir dibuka, supaya kasir tahu persis kondisi data offline-nya di awal tiap
 * sesi kerja, bukan diam-diam di latar belakang begitu pos.html terbuka.
 *
 * <p>Aksi ini OPSIONAL/tidak memblokir -- login.html menyediakan tombol "Lewati" yang langsung
 * memanggil {@code login:selesai} tanpa lewat sini sama sekali (mis. kasir buru-buru/tahu datanya
 * masih segar dari sesi sebelumnya).</p>
 *
 * @return {Promise<{ok:boolean, jumlahProduk?:number, jumlahKategori?:number, pesan?:string}>}
 */
ipcMain.handle('login:sinkron-data', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    if (!posApiToken) return { ok: false, pesan: 'Sesi belum siap -- silakan masuk ulang.' };

    const hasilKonfig = await panggilPosApi(cfg, 'konfigurasi', {});
    if (hasilKonfig.ok) {
        localDb.simpanCache('konfigurasi', hasilKonfig.data);
        const aksesMenu = hasilKonfig.data.aksesMenu || {};
        if (aksesMenu.kasir === false && aksesMenu.produk === false && aksesMenu.barang === false) {
            return { ok: true, jumlahProduk: 0, jumlahKategori: 0 };
        }
    }

    const hasilKatalog = await panggilPosApi(cfg, 'katalog', {});
    if (!hasilKatalog.ok) {
        return { ok: false, pesan: hasilKatalog.offline ? 'Tidak ada koneksi internet -- sinkronisasi dilewati, data lama (bila ada) tetap dipakai.' : (hasilKatalog.pesan || 'Gagal mengunduh katalog.') };
    }
    // Gambar produk ikut disinkron di langkah ini juga -- supaya tombol "Sinkronkan Data" di layar
    // login benar-benar menyiapkan SEMUA yg dibutuhkan offline (bukan cuma teks/harga).
    await unduhCacheGambarProduk(hasilKatalog.data.produk);
    localDb.simpanCache('katalog', hasilKatalog.data);

    if (!hasilKonfig.ok) {
        // Katalog SUDAH berhasil disimpan -- konfigurasi gagal tidak membatalkan itu, cukup dilaporkan.
        return { ok: false, pesan: hasilKonfig.pesan || 'Katalog tersimpan, tetapi gagal mengunduh konfigurasi.', jumlahProduk: (hasilKatalog.data.produk || []).length };
    }

    return {
        ok: true,
        jumlahProduk: (hasilKatalog.data.produk || []).length,
        jumlahKategori: (hasilKatalog.data.kategori || []).length
    };
});

/** Dipanggil login.html setelah langkah "Sinkronkan Data" selesai/dilewati -- lanjut buka jendela kasir. */
ipcMain.handle('login:selesai', () => {
    const cfg = readConfig();
    // modeOffline (lihat handler login:coba-offline) adalah syarat ALTERNATIF thd posApiToken --
    // sesi offline sengaja tak pernah punya token sama sekali (tak ada server utk memintanya).
    if (!cfg || !(posApiToken || modeOffline)) return { ok: false };
    bukaAplikasiSetelahLoginSukses(cfg);
    return { ok: true };
});

/** Dibaca layar Kasir (pos-renderer.js) saat load utk menampilkan banner "MODE OFFLINE" dan menyembunyikan aksi yg mutlak butuh server. */
ipcMain.handle('pos:mode-offline', () => modeOffline);

ipcMain.on('login:ubah-server', () => {
    // Urutan sengaja: buka setup DULU baru tutup login -- alasan sama spt di handler login:submit.
    openSetupWindow();
    if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.destroy(); loginWindow = null; }
});

// ==== IPC: dipanggil dari renderer jendela POS utama (lewat preload.js) ====
ipcMain.on('customer-screen:open', (event, url) => openCustomerWindow(url));
ipcMain.on('customer-screen:close', () => closeCustomerWindow());
ipcMain.handle('customer-screen:is-open', () => !!(customerWindow && !customerWindow.isDestroyed()));
ipcMain.handle('display:has-second', () => screen.getAllDisplays().length > 1);
// "Coba Lagi" di error.html sengaja KEMBALI KE LAYAR LOGIN, bukan memuat ulang buildBaseUrl(cfg)
// langsung di jendela yg sama -- kegagalan muat (mis. internet sempat putus) bisa saja terjadi
// SETELAH sesi login kedaluwarsa; memuat ulang URL dasar polos berisiko menampilkan login2.jsp milik
// server di dalam jendela kasir, yg justru ingin dihindari fitur login lokal ini (lihat JavaDoc
// openLoginWindow). Login ulang otomatis membawa kembali ke /main lewat redirect server bila sesi
// TERNYATA masih valid, jadi tidak ada langkah ekstra buat kasir yg sesinya belum kedaluwarsa.
ipcMain.on('error-page:retry', () => {
    const cfg = readConfig();
    if (!cfg) return;
    // Urutan sengaja: buka login DULU baru tutup jendela kasir lama -- alasan sama spt 'setup:save'.
    openLoginWindow(cfg);
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.close(); mainWindow = null; }
});
ipcMain.on('error-page:open-setup', () => openSetupWindow());

// ==== IPC: penyimpanan transaksi lokal PERSISTEN (SQLite, lihat local-db.js) ====
// Dipanggil dari halaman POS lewat window.electronAPI.localDb.* (preload.js). Setiap handler murni
// meneruskan ke local-db.js -- tidak ada logika bisnis di sini, supaya aturan "tulis lokal dulu,
// jangan pernah hapus setelah sinkron" hanya perlu dijaga di SATU tempat (lihat JavaDoc local-db.js).
ipcMain.handle('local-db:simpan-baru', (event, trx) => localDb.simpanBaru(trx));
ipcMain.handle('local-db:tandai-sinkron', (event, clientTrxId) => localDb.tandaiSinkron(clientTrxId));
ipcMain.handle('local-db:tandai-gagal', (event, clientTrxId, pesan) => localDb.tandaiGagal(clientTrxId, pesan));
ipcMain.handle('local-db:list-pending', () => localDb.listPending());
ipcMain.handle('local-db:list-semua', (event, filter) => localDb.listSemua(filter));
ipcMain.handle('local-db:waktu-sinkron-terakhir', () => localDb.waktuSinkronTerakhir());
/** Dipakai halaman Riwayat Sinkronisasi (bagian "Sinkron Masuk") -- lihat JavaDoc localDb.listCacheSemua. */
ipcMain.handle('local-db:list-cache', () => localDb.listCacheSemua());

/**
 * Menu "Log Error" (Desktop, log-error.html) -- daftar/hapus/bersihkan baris {@code error_log} (lihat
 * JavaDoc tabel di local-db.js). {@code catat} dipanggil dari RENDERER manapun (via error-capture.js
 * yg dimuat di setiap halaman, menangkap {@code window.onerror}/{@code unhandledrejection}) -- sumber
 * dari renderer diberi awalan {@code renderer:} di sini (bukan dipercaya mentah dari klien) supaya
 * selalu bisa dibedakan dari entri yg dicatat proses utama sendiri ({@code main:*}).
 */
ipcMain.handle('pos:error-log-list', (event, filter) => {
    try { return Object.assign({ ok: true }, localDb.listErrorLog(filter || {})); }
    catch (e) { return { ok: false, pesan: String(e && e.message || e) }; }
});
ipcMain.handle('pos:error-log-catat', (event, entry) => {
    try {
        entry = entry || {};
        localDb.catatErrorLog(Object.assign({}, entry, { sumber: 'renderer:' + String(entry.sumber || '?') }));
        return { ok: true };
    } catch (e) { return { ok: false }; }
});
ipcMain.handle('pos:error-log-hapus', (event, payload) => {
    try { localDb.hapusErrorLog(payload && payload.id); return { ok: true }; }
    catch (e) { return { ok: false, pesan: String(e && e.message || e) }; }
});
ipcMain.handle('pos:error-log-bersihkan', () => {
    try { localDb.bersihkanErrorLog(); return { ok: true }; }
    catch (e) { return { ok: false, pesan: String(e && e.message || e) }; }
});

// ==== IPC: dipanggil dari halaman Kasir (POS) LOKAL (pos.html, lewat window.electronAPI.posAPI) ====
// Aksi BACA (katalog/konfigurasi) yg gagal karena OFFLINE jatuh ke cache SQLite terakhir
// (local-db.js:simpanCache/bacaCache). Aksi TULIS (bayar/draft_bayar) yg gagal karena offline TIDAK
// "jatuh ke cache" (tidak masuk akal utk transaksi) -- alih-alih masuk antrean PENDING yg sama dipakai
// _pos.jsp/ais_pos_offline.js, disinkronkan nanti lewat 'pos:sync-now'. Prinsip "tulis lokal dulu,
// jangan pernah hilang" yg SAMA dipertahankan di jalur token ini.

ipcMain.handle('pos:status', () => ({ ok: true, tersedia: !!posApiToken }));

ipcMain.handle('pos:katalog', async (event, opsi) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    kirimStatusKatalog({ tipe: 'server-mulai' });
    const hasil = await panggilPosApi(cfg, 'katalog', opsi || {});
    if (hasil.ok) {
        kirimStatusKatalog({ tipe: 'server-selesai' });
        // Sinkron gambar produk ke lokal SEBELUM di-cache -- supaya baris cache yg disimpan sudah
        // membawa path file:// lokal (bukan URL remote), lihat JavaDoc unduhCacheGambarProduk.
        await unduhCacheGambarProduk(hasil.data.produk);
        localDb.simpanCache('katalog', hasil.data);
        // Sekalian segarkan cache PER-BARIS (produk_cache) di setiap live load yg berhasil -- SEBELUMNYA
        // hanya diperbarui via tombol "Sinkronkan"/siklus berkala 10 menit, jadi layar Katalog Barang
        // bisa tampil sedikit basi sesaat sesudah admin mengubah produk lewat perangkat LAIN. Dilewati
        // utk "Semua Toko" -- cache ini cuma utk toko yg sedang login (lihat JavaDoc produkCacheSemua).
        if (!(opsi && opsi.semuaToko)) {
            try { localDb.gantiSemuaProdukCache(hasil.data.produk); } catch (eCache) { /* cache sekunder -- kegagalannya tak boleh menggagalkan respons katalog utama */ }
        }
        return { ok: true, data: hasil.data, fromCache: false };
    }
    if (hasil.offline) {
        const cache = localDb.bacaCache('katalog');
        if (cache) { kirimStatusKatalog({ tipe: 'cache-lokal' }); return { ok: true, data: cache.data, fromCache: true, cachedAt: cache.disimpanPada }; }
        return { ok: false, pesan: 'Tidak ada koneksi dan belum ada data katalog tersimpan -- sambungkan ke internet minimal sekali dulu.' };
    }
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Fitur "Cache Lokal Katalog Produk + Sinkronkan Manual/Berkala" (layar Produk) -- gap-closure
 * eksplisit "pastikan jumlah dan stok produk selalu sama dgn server". BEDA dari cache blob
 * {@code katalog} yg SUDAH ADA di atas (itu utk kontinuitas Kasir SAAT OFFLINE, diam-diam, tak
 * terlihat kasir) -- {@code produk_cache} di sini adalah tabel PER-BARIS yg statusnya (jumlah baris +
 * kapan terakhir cocok server) SENGAJA DITAMPILKAN ke admin di layar Produk, supaya bisa memverifikasi
 * SENDIRI kapan terakhir katalog lokal dijamin sama persis dgn server -- bukan sekadar "mudah-mudahan
 * masih cocok". Menimpa SELURUH cache (bukan upsert selektif) supaya jumlah baris presisi, lihat
 * JavaDoc {@code localDb.gantiSemuaProdukCache}.
 * @param {{host:string, contextPath:string, https:boolean}|null} cfg
 * @return {Promise<{ok:boolean, total?:number, disinkronPada?:string, pesan?:string}>}
 */
async function sinkronkanKatalogProdukLengkap(cfg) {
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'katalog', {});
    if (!hasil.ok) {
        if (hasil.offline) return { ok: false, pesan: 'Tidak ada koneksi -- coba lagi bila sudah online.' };
        return { ok: false, pesan: hasil.pesan || 'Gagal mengambil katalog dari server.' };
    }
    const ringkasan = localDb.gantiSemuaProdukCache(hasil.data.produk || []);
    return { ok: true, total: ringkasan.total, disinkronPada: ringkasan.disinkronPada };
}

ipcMain.handle('pos:produk-sinkron-manual', async () => sinkronkanKatalogProdukLengkap(readConfig()));
ipcMain.handle('pos:produk-cache-ringkasan', async () => ({ ok: true, data: localDb.ringkasanProdukCache() }));
/**
 * Gap-closure "layar Kasir HANYA baca local DB (sangat ringan)" -- TIDAK PERNAH memanggil
 * {@code panggilPosApi}/server sama sekali (beda dgn {@code pos:katalog}, yg dipakai layar admin
 * Produk dan MENCOBA live dulu). Kesegaran data dijamin siklus sinkron berkala terpisah (lihat
 * {@link #mulaiSinkronProdukCacheBerkala}, jalan sejak app dibuka). Sinkron murni SQLite lokal --
 * tidak ada await network sama sekali, jadi respons IPC ini nyaris instan bahkan utk katalog ribuan
 * baris.
 */
ipcMain.handle('pos:produk-cache-kasir', async () => {
    try {
        return { ok: true, data: localDb.produkCacheUntukKasir() };
    } catch (e) {
        return { ok: false, pesan: 'Gagal membaca cache produk lokal: ' + (e && e.message ? e.message : e) };
    }
});
/**
 * Gap-closure "layar Katalog Barang (admin) macet lama saat internet lambat" -- padanan {@code
 * pos:produk-cache-kasir} tapi TERMASUK produk Non-Aktif (lihat JavaDoc {@code localDb.produkCacheSemua}).
 * SAMA seperti pasangan Kasir-nya: baca lokal murni, tidak pernah menyentuh jaringan, respons nyaris
 * instan. Dipakai {@code produk-renderer.js} utk tampilan SEKETIKA sebelum live dicoba di latar
 * belakang (lihat {@code muatDaftarProduk}).
 */
ipcMain.handle('pos:produk-cache-semua', async () => {
    try {
        return { ok: true, data: localDb.produkCacheSemua() };
    } catch (e) {
        return { ok: false, pesan: 'Gagal membaca cache produk lokal: ' + (e && e.message ? e.message : e) };
    }
});

/** Timer berkala (10 menit -- katalog produk tak seurgent error log/sesi kas, cukup jarang) selama jendela Kasir terbuka. Dipanggil dari {@link #openMainWindow}, dihentikan saat jendela ditutup. */
let intervalSinkronProdukCache = null;
function mulaiSinkronProdukCacheBerkala() {
    if (intervalSinkronProdukCache) return;
    intervalSinkronProdukCache = setInterval(() => {
        const cfg = readConfig();
        if (cfg) sinkronkanKatalogProdukLengkap(cfg).catch(() => {});
    }, 600000);
}
function berhentiSinkronProdukCacheBerkala() {
    if (intervalSinkronProdukCache) { clearInterval(intervalSinkronProdukCache); intervalSinkronProdukCache = null; }
}

ipcMain.handle('pos:konfigurasi', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'konfigurasi', {});
    if (hasil.ok) {
        if (hasil.data && hasil.data.tokoId != null) posTokoAktifId = hasil.data.tokoId;
        localDb.simpanCache('konfigurasi', hasil.data);
        return { ok: true, data: hasil.data, fromCache: false };
    }
    if (hasil.offline) {
        const cache = localDb.bacaCache('konfigurasi');
        if (cache) return { ok: true, data: cache.data, fromCache: true, cachedAt: cache.disimpanPada };
        return { ok: false, pesan: 'Tidak ada koneksi dan belum ada data konfigurasi tersimpan.' };
    }
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Fitur "Multi-Toko" -- daftar toko yang boleh dioperasikan pengguna ini (lihat JavaDoc server
 * {@code KantinHelper.daftarTokoBolehDiakses}). Selalu online (tak ada cache -- dipanggil sekali
 * saja saat pos.html dimuat, bersamaan dgn konfigurasi; kalau gagal krn offline, Kasir cukup
 * jatuh ke perilaku toko-tunggal lama tanpa kombo, bukan memblokir seluruh layar).
 */
ipcMain.handle('pos:daftar-toko-saya', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'daftar_toko_saya', {});
    if (hasil.ok) return { ok: true, data: hasil.data, tokoAktifId: hasil.data && hasil.data.tokoAktifId };
    return { ok: false, pesan: hasil.pesan, offline: hasil.offline, butuhLoginUlang: hasil.butuhLoginUlang };
});

ipcMain.handle('pos:pilih-toko-aktif', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const tokoId = payload && typeof payload === 'object' ? (payload.tokoId || payload.id_toko || payload.idToko || payload.toko_id) : payload;
    const hasil = await panggilPosApi(cfg, 'pilih_toko_aktif', { tokoId: tokoId });
    if (hasil.ok) {
        posTokoAktifId = hasil.data && hasil.data.tokoId != null ? hasil.data.tokoId : Number(tokoId);
        await sinkronkanKatalogProdukLengkap(cfg).catch(() => null);
        return { ok: true, data: hasil.data };
    }
    return { ok: false, pesan: hasil.pesan, offline: hasil.offline, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Menyisipkan identitas mesin POS ini ({@code nama_mesin}) ke payload checkout -- dipasang di SATU
 * titik masuk (bukan tiap pemanggil renderer) supaya transaksi offline yang diantrekan lokal (lihat
 * {@link prosesTransaksiPosOfflineFirst}) IKUT membawa identitas mesin saat akhirnya disinkron,
 * bukan cuma transaksi yang langsung online. Fallback ke potongan {@code idMesin} bila admin belum
 * sempat memberi nama lewat Konfigurasi -- field tetap berguna (unik per mesin) walau belum diberi
 * nama manusiawi.
 */
function lampirkanNamaMesin(payload) {
    const m = bacaIdentitasMesin();
    const nama = m.namaMesin && m.namaMesin.trim() ? m.namaMesin.trim() : ('Mesin-' + m.idMesin.slice(0, 8));
    return Object.assign({}, payload || {}, { nama_mesin: nama });
}

ipcMain.handle('pos:bayar', async (event, payload) => prosesTransaksiPosOfflineFirst(readConfig(), 'bayar', lampirkanNamaMesin(payload)));
ipcMain.handle('pos:draft-bayar', async (event, payload) => prosesTransaksiPosOfflineFirst(readConfig(), 'draft_bayar', lampirkanNamaMesin(payload)));

ipcMain.handle('pos:identitas-mesin-baca', async () => ({ ok: true, data: bacaIdentitasMesin() }));
ipcMain.handle('pos:identitas-mesin-simpan', async (event, payload) => ({ ok: true, data: simpanNamaMesin(payload && payload.namaMesin) }));

ipcMain.handle('pos:check-bayar', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'checkBayar', payload || {});
    if (hasil.ok) return { ok: true, data: hasil.data };
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak bisa memeriksa status saat offline.' };
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

ipcMain.handle('pos:sync-now', async () => sinkronkanTransaksiPending(readConfig()));

/**
 * Daftar pesanan online (Fase 3) -- HANYA data BACA, jadi pola cache-nya SAMA PERSIS dgn
 * {@code pos:katalog}/{@code pos:konfigurasi}: coba live dulu, cache kalau sukses, fallback ke cache
 * lama saat offline. TIDAK ada antrean-tulis di sini (lihat {@code pos:pesanan-verifikasi}/
 * {@code pos:pesanan-batal} di bawah utk aksi yg MENGUBAH data -- keduanya butuh koneksi aktif,
 * tidak masuk akal diantrekan offline spt transaksi kasir biasa krn bisa bentrok dgn kasir/perangkat
 * lain yg memverifikasi pesanan yg sama).
 */
ipcMain.handle('pos:pesanan-list', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'pesanan_list', payload || {});
    if (hasil.ok) {
        localDb.simpanCache('pesanan', hasil.data);
        return { ok: true, data: hasil.data, fromCache: false };
    }
    if (hasil.offline) {
        const cache = localDb.bacaCache('pesanan');
        if (cache) return { ok: true, data: cache.data, fromCache: true, cachedAt: cache.disimpanPada };
        return { ok: false, pesan: 'Tidak ada koneksi dan belum ada data pesanan tersimpan.' };
    }
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});
/** Status cache lokal Pesanan TANPA memicu fetch baru (gap-closure paritas indikator Produk/Anggota -- "N tersimpan, terakhir disinkron ..."). @return {{ok:boolean, ada:boolean, total?:number, disimpanPada?:string}} */
ipcMain.handle('pos:pesanan-cache-info', async () => {
    const cache = localDb.bacaCache('pesanan');
    if (!cache) return { ok: true, ada: false };
    const total = (cache.data && cache.data.pesanan && cache.data.pesanan.length) || 0;
    return { ok: true, ada: true, total: total, disimpanPada: cache.disimpanPada };
});

/**
 * Memverifikasi/menuntaskan satu pesanan -- pakai ULANG aksi {@code bayar} yg SUDAH ADA (lihat
 * JavaDoc {@code PosApi.prosesPesananList} soal alasan tak perlu method baru). SENGAJA TIDAK lewat
 * {@link #prosesTransaksiPosOfflineFirst} (antrean offline) -- verifikasi pesanan HARUS online
 * (menyentuh data pesanan yg bisa saja sedang/sudah diproses perangkat/kasir lain), beda dgn
 * transaksi kasir baru yg memang milik satu perangkat itu sendiri.
 */
ipcMain.handle('pos:pesanan-verifikasi', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'bayar', payload);
    if (hasil.ok) return { ok: true, data: hasil.data };
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- verifikasi pesanan tidak bisa dilakukan offline.' };
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/** Membatalkan satu pesanan yang belum lunas -- lihat JavaDoc {@code PosApi.prosesBatalPesanan}. */
ipcMain.handle('pos:pesanan-batal', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'batal_pesanan', payload);
    if (hasil.ok) return { ok: true };
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- pembatalan pesanan tidak bisa dilakukan offline.' };
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * "Hitung Ulang" (gap-closure -- padanan tombol "Hitung Ulang" di JSP _draft_pesanan_anggota.jsp,
 * lihat JavaDoc server {@code KantinHelper.pesananHitungUlang}) -- menghitung ULANG diskon/cashback
 * satu pesanan (draft atau yg sudah lunas) memakai aturan diskon TERKINI lalu MENYIMPANNYA. Gerbang
 * admin/supervisor ditegakkan di server; WAJIB online (menyentuh data finansial yg bisa sedang dilihat
 * perangkat lain, sama alasannya dgn pos:pesanan-verifikasi).
 */
ipcMain.handle('pos:pesanan-hitung-ulang', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'pesanan_hitung_ulang', payload);
    if (hasil.ok) return { ok: true, data: hasil.data };
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- hitung ulang tidak bisa dilakukan offline.' };
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Pencarian member (dipakai Kasir SEBELUM checkout pakai metode "saldo") dan pengecekan saldo
 * real-time (dipanggil ULANG persis di detik checkout, BUKAN dari hasil cari_member yang bisa basi --
 * pola sama dgn {@code checkSaldoTerbaru()} versi web) -- lihat JavaDoc {@code PosApi.prosesCariMember}
 * di server. Keduanya SENGAJA TIDAK punya fallback cache offline (beda dari katalog/pesanan/ringkasan)
 * krn saldo member WAJIB data terkini -- menampilkan saldo basi berisiko memotong lebih dari yg tersisa.
 */
ipcMain.handle('pos:cari-member', async (event, opsi) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'cari_member', opsi || {});
    if (hasil.offline) {
        // Fallback "Picker Member Offline": server real-time tak terjangkau -- coba cache lokal
        // (anggota_cache, lihat local-db.js) supaya kasir TETAP bisa memilih member offline, alih-alih
        // langsung buntu spt sebelumnya. TIDAK ada saldo di hasil cache (saldo WAJIB real-time,
        // never disajikan basi) -- pemanggil (picker) menandai `dariCache:true` supaya UI jelas
        // membedakan hasil cache dari hasil server, bukan diam-diam disamarkan seolah sama.
        try {
            // Fase 5 -- {@code opsi.id} (exact lookup, dipakai "Muat" Keranjang Tertahan saat OFFLINE)
            // WAJIB via anggotaCacheById (primary key), BUKAN cariAnggotaCache dgn keyword kosong --
            // keyword kosong akan match SEMUA baris (LIKE '%%') dan mengembalikan member SEMBARANGAN
            // (baris pertama urut nama), bukan member yg dimaksud id ini. Salah pilih member di sini
            // berarti transaksi resume-nya salah kaitkan ke saldo/riwayat orang lain.
            const idExact = opsi && opsi.id != null ? Number(opsi.id) : null;
            const baris = idExact != null
                ? [localDb.anggotaCacheById(idExact)].filter(Boolean)
                : localDb.cariAnggotaCache((opsi && opsi.keyword) || '', 30);
            return {
                ok: true,
                offline: true,
                dariCache: true,
                data: {
                    member: baris.map((b) => ({
                        id: b.id, nama: b.nama, kodeIdentitas: b.kode_identitas,
                        wajibPin: !!b.wajib_pin, fotoPathLokal: b.foto_path_lokal
                    }))
                }
            };
        } catch (e) {
            return { ok: false, offline: true, pesan: 'Tidak ada koneksi, dan cache member lokal belum tersedia -- sinkronkan data anggota dulu saat online.' };
        }
    }
    // ONLINE (real-time dari server, TIDAK basi -- termasuk saldo bila diminta pemanggil lain) --
    // tetap diperkaya `fotoPathLokal` dari cache lokal BILA sudah pernah disinkron sebelumnya, supaya
    // picker tetap menampilkan foto walau server /PosApi sendiri tidak mengirim foto (murni data
    // teks). Pengayaan ini gagal-diam (tak pernah menggagalkan hasil pencarian utama) -- foto hanya
    // "bonus tampilan", bukan bagian penting alur checkout.
    try {
        if (hasil.ok && hasil.data && Array.isArray(hasil.data.member)) {
            hasil.data.member.forEach((m) => {
                const cache = localDb.anggotaCacheById(m.id);
                if (cache && cache.foto_path_lokal) m.fotoPathLokal = cache.foto_path_lokal;
            });
        }
    } catch (e) { /* pengayaan foto gagal -- diamkan, hasil pencarian utama tetap dipakai apa adanya */ }
    return hasil;
});

/**
 * Fase 5 -- daftar metode bayar TERFILTER per jenis-anggota (kirim {@code id_member}) atau daftar
 * PENUH (tanpa {@code id_member}), lihat JavaDoc server {@code PosApi.prosesCaraBayarList}. Dipanggil
 * ULANG dari renderer setiap kali member dipilih/dihapus di layar Kasir -- SEBELUMNYA {@code
 * semuaCaraBayar} hanya dimuat SEKALI saat start lewat {@code pos:konfigurasi}, tak pernah disaring
 * ulang per member (gap Fase 5). TANPA fallback cache offline (SAMA spt {@code pos:cari-member}) --
 * daftar metode bayar yg valid bisa berubah tiap saat, cache basi berisiko menawarkan metode yg
 * sebenarnya sudah tak diizinkan utk member itu.
 */
ipcMain.handle('pos:cara-bayar-list', async (event, opsi) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'cara_bayar_list', opsi || {});
    if (hasil.ok) return { ok: true, data: hasil.data };
    return { ok: false, offline: !!hasil.offline, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Fitur "anggota yang baru saja bertransaksi" -- pelengkap picker member: begitu modal dibuka
 * (kotak cari masih kosong), tampilkan jalan pintas "pilih pelanggan tadi" alih-alih layar kosong
 * yang cuma minta kasir mengetik. Selalu REAL-TIME ke server (bukan cache lokal, beda dari fallback
 * offline {@code pos:cari-member}) -- daftar ini secara alami berubah tiap ada transaksi baru,
 * cache basi di sini akan langsung terasa salah. Gagal (offline/timeout) cukup dibalas array kosong,
 * BUKAN error -- ini murni pelengkap kenyamanan, picker tetap sepenuhnya berfungsi via pencarian
 * manual/cache bila fitur ini gagal.
 */
ipcMain.handle('pos:anggota-transaksi-terbaru', async (event, opsi) => {
    const cfg = readConfig();
    if (!cfg) return { ok: true, data: { data: [] } };
    const hasil = await panggilPosApi(cfg, 'anggota_transaksi_terbaru', opsi || {});
    if (!hasil.ok) return { ok: true, data: { data: [] } };
    try {
        if (hasil.data && Array.isArray(hasil.data.data)) {
            hasil.data.data.forEach((m) => {
                const cache = localDb.anggotaCacheById(m.id);
                if (cache && cache.foto_path_lokal) m.fotoPathLokal = cache.foto_path_lokal;
            });
        }
    } catch (e) { /* pengayaan foto gagal -- diamkan, daftar utama tetap dipakai apa adanya */ }
    return hasil;
});

/**
 * Fitur "Picker Member Offline" -- memicu {@link #sinkronkanAnggotaLengkap} di background (return
 * segera, progres lewat event {@code pos:anggota-sync-status}, lihat JavaDoc fungsi itu).
 */
ipcMain.handle('pos:anggota-sync-mulai', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    if (modeOffline) return { ok: false, pesan: 'Sedang Mode Offline -- sinkron data anggota butuh koneksi aktif.' };
    sinkronkanAnggotaLengkap(cfg); // SENGAJA tidak di-await -- progres dipantau lewat event, bukan menunggu promise ini.
    return { ok: true };
});

/** Pencarian member di cache lokal SAJA (dipakai picker menampilkan "X member tersimpan offline" &amp; sbg pelengkap saat sudah online juga, bukan cuma fallback). Field dipetakan camelCase, KONSISTEN dgn bentuk balikan {@code pos:cari-member} (baik jalur online maupun fallback offline-nya) supaya renderer tidak perlu tahu asal datanya. */
ipcMain.handle('pos:anggota-cache-cari', async (event, opsi) => {
    try {
        const baris = localDb.cariAnggotaCache((opsi && opsi.keyword) || '', (opsi && opsi.limit) || 30);
        return {
            ok: true,
            data: baris.map((b) => ({
                id: b.id, nama: b.nama, kodeIdentitas: b.kode_identitas,
                wajibPin: !!b.wajib_pin, fotoPathLokal: b.foto_path_lokal
            })),
            totalCache: localDb.hitungAnggotaCache(),
            disinkronPada: localDb.waktuTerakhirSyncAnggota()
        };
    } catch (e) {
        return { ok: false, pesan: String(e && e.message || e) };
    }
});
ipcMain.handle('pos:saldo-member', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'saldo_member', payload);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- saldo tidak bisa diperiksa.' };
    return hasil;
});

/**
 * ==== Fitur "Sesi Kasir OFFLINE-FIRST" ====
 *
 * <p>Dibangun setelah bug lapangan berkepanjangan: layar "Kas Belum Dibuka" macet menampilkan
 * tertutup walau server SUDAH mencatat sesi sukses (akar masalah akhirnya ditemukan murni di sisi
 * server -- interceptor audit menimpa identitas kasir sebelum baris tersimpan -- tapi gejalanya
 * membuktikan satu hal jelas: status kas TIDAK BOLEH bergantung pada round-trip server tiap kali
 * ditanya). Sekarang status/buka/tutup dijawab SEKETIKA dari database lokal ({@code sesi_kas_lokal},
 * lihat JavaDoc lengkap di local-db.js) -- kasir bisa lanjut jualan tanpa menunggu jaringan sama
 * sekali, termasuk saat benar-benar offline. Sinkron ke server ({@code koperasi.sesi_kas_kasir},
 * idempoten lewat kolom {@code kode} yg sama -- lihat javadoc server {@code KantinHelper.sesiKasBuka})
 * berjalan di LATAR: segera setelah buka/tutup (best-effort, TIDAK PERNAH memblokir kasir), dan
 * berkala tiap 30 detik ({@link #mulaiSinkronSesiKasBerkala}) selama jendela Kasir terbuka, supaya
 * sesi yang sempat gagal sinkron (offline lama) otomatis tuntas begitu koneksi pulih.</p>
 *
 * <p>{@code totalTunai}/{@code totalNonTunai}/{@code selisih} SENGAJA tidak pernah dihitung sendiri
 * di klien (lihat JavaDoc {@code sesiKasTutupLokal} di local-db.js) -- angka-angka itu HARUS dihitung
 * server dari SELURUH transaksi toko yg tercatat resmi, bukan cuma yg kebetulan terlihat di
 * perangkat ini. Selama belum sinkron, status menampilkan {@code kasSaatIni = modalAwal} apa adanya
 * (bukan tebakan) + penanda {@code belumSinkron:true} supaya kasir tahu angka final masih menunggu.</p>
 */
let intervalSinkronSesiKas = null;
/** Timer berkala sinkron batch Impor Katalog offline-first (lihat {@link #sinkronkanImporKatalogPending}) -- pola SAMA PERSIS dgn {@link #intervalSinkronSesiKas}. */
let intervalSinkronImporKatalog = null;

/** Format waktu LOKAL (BUKAN UTC -- {@code Date#toISOString} akan salah zona waktu) sesuai yg diharapkan server ({@code Common.dateFormatInput}, pola {@code yyyy-MM-dd'T'HH:mm}). */
function keFormatWaktuServerSesiKas(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function buatKodeSesiKasLokal() {
    return 'SESI-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Sinkron SATU sesi kas lokal (by kode) ke server -- kirim BUKA dulu bila belum tersinkron, baru
 * TUTUP (hanya bila status lokalnya sudah TUTUP). Idempoten (server mengecek {@code kode} sebelum
 * membuat baris baru) -- aman dipanggil ulang kapan pun (retry timer, percobaan manual) tanpa risiko
 * sesi dobel atau hitung ganda.
 *
 * @return {Promise<{selisih?:number}|null>} hasil tutup dari server bila sesi ini SUDAH berstatus
 *         TUTUP secara lokal dan sinkron tutup-nya berhasil; {@code null} bila belum ada apa pun yg
 *         bisa/perlu disinkronkan sekarang (mis. masih BUKA, atau baru saja gagal).
 */
async function sinkronkanSatuSesiKas(cfg, kode) {
    const sesi = localDb.sesiKasByKode(kode);
    if (!sesi) return null;

    if (!sesi.tersinkron_buka) {
        const hasilBuka = await panggilPosApi(cfg, 'sesi_kas_buka', {
            id_toko: sesi.toko_id,
            modal_awal: sesi.modal_awal,
            keterangan: sesi.keterangan_buka,
            kode: sesi.kode,
            waktu_buka: sesi.waktu_buka
        });
        if (!hasilBuka.ok) {
            localDb.tandaiGagalSinkronSesiKas(kode, hasilBuka.pesan || 'Gagal sinkron buka kas.');
            return null;
        }
        localDb.tandaiSinkronBukaSesiKas(kode, hasilBuka.data && hasilBuka.data.id_server);
        sesi.tersinkron_buka = 1; // lanjut ke tutup di bawah TANPA perlu baca ulang DB, dlm proses sinkron yg sama
    }

    if (sesi.status !== 'TUTUP' || sesi.tersinkron_tutup) {
        return null; // masih terbuka (belum ada yg perlu disinkron lebih lanjut), atau tutup-nya SUDAH sinkron sebelumnya
    }

    const hasilTutup = await panggilPosApi(cfg, 'sesi_kas_tutup', {
        id_toko: sesi.toko_id,
        uang_fisik: sesi.uang_fisik,
        keterangan: sesi.keterangan_tutup,
        kode: sesi.kode,
        waktu_tutup: sesi.waktu_tutup
    });
    if (!hasilTutup.ok) {
        localDb.tandaiGagalSinkronSesiKas(kode, hasilTutup.pesan || 'Gagal sinkron tutup kas.');
        return null;
    }
    const selisih = hasilTutup.data && hasilTutup.data.selisih;
    localDb.tandaiSinkronTutupSesiKas(kode, {
        selisih: selisih,
        totalTunai: hasilTutup.data && hasilTutup.data.totalTunai,
        totalNonTunai: hasilTutup.data && hasilTutup.data.totalNonTunai
    });
    return { selisih: selisih };
}

/** Sinkron SEMUA sesi kas lokal yg belum tuntas -- dipanggil setelah buka/tutup (segera, best-effort) DAN berkala (lihat {@link #mulaiSinkronSesiKasBerkala}). Berhenti diam-diam bila offline/server belum dikonfigurasi -- bukan error, cuma belum saatnya. */
async function sinkronkanSesiKasPending(cfg) {
    if (!cfg || modeOffline) return;
    const daftar = localDb.sesiKasBelumSinkron();
    for (const sesi of daftar) {
        try {
            await sinkronkanSatuSesiKas(cfg, sesi.kode);
        } catch (e) { /* satu sesi gagal tak boleh menghentikan sesi lain dlm antrean -- lanjut coba berikutnya */ }
    }
}

/** Timer berkala (30 detik) selama jendela Kasir terbuka -- lihat JavaDoc grup fungsi ini. Dipanggil dari {@link #openMainWindow}, dihentikan saat jendela ditutup (pola SAMA dgn {@link #mulaiAutoCekUpdate}). */
function mulaiSinkronSesiKasBerkala() {
    if (intervalSinkronSesiKas) return;
    intervalSinkronSesiKas = setInterval(() => {
        const cfg = readConfig();
        if (cfg) sinkronkanSesiKasPending(cfg).catch(() => {});
    }, 30000);
}
function berhentiSinkronSesiKasBerkala() {
    if (intervalSinkronSesiKas) { clearInterval(intervalSinkronSesiKas); intervalSinkronSesiKas = null; }
}

/**
 * Fitur "Sinkronkan Log Error ke Server" -- gap-closure keluhan admin pusat kesulitan memantau error
 * mesin POS lapangan tanpa akses fisik ke perangkatnya. Kirim baris {@code error_log} lokal yang
 * BELUM tersinkron (lihat JavaDoc {@code localDb.errorLogBelumSinkron}) ke aksi server
 * {@code error_log_kirim}, satu BATCH per panggilan (bukan satu-per-satu spt sesi kas -- baris error
 * jauh lebih murah/tak butuh konsistensi transaksional ketat, jadi kirim beramai-ramai lebih efisien).
 * Ditandai tersinkron HANYA setelah server benar-benar mengonfirmasi {@code status="00"} -- gagal
 * (offline/ditolak) berarti baris itu TETAP tercoba lagi di siklus 60 detik berikutnya.
 * @param {{host:string, contextPath:string, https:boolean}|null} cfg
 */
async function sinkronkanErrorLogPending(cfg) {
    if (!cfg || modeOffline) return;
    const pending = localDb.errorLogBelumSinkron(100);
    if (pending.length === 0) return;
    try {
        const m = bacaIdentitasMesin();
        const namaMesinKirim = m.namaMesin && m.namaMesin.trim() ? m.namaMesin.trim() : ('Mesin-' + m.idMesin.slice(0, 8));
        const hasil = await panggilPosApi(cfg, 'error_log_kirim', {
            platform: 'Desktop',
            nama_mesin: namaMesinKirim,
            baris: pending.map((b) => ({ waktu: b.waktu, sumber: b.sumber, tingkat: b.tingkat, pesan: b.pesan, detail: b.detail, layar: b.layar }))
        });
        if (hasil.ok) {
            localDb.tandaiErrorLogTersinkron(pending.map((b) => b.id));
        }
    } catch (e) { /* satu siklus gagal (mis. offline) tak boleh melempar -- dicoba lagi siklus berikutnya */ }
}

/** Timer berkala (60 detik -- lebih longgar dari sesi kas krn tak ada urgensi transaksional) selama jendela Kasir terbuka. Dipanggil dari {@link #openMainWindow}, dihentikan saat jendela ditutup. */
let intervalSinkronErrorLog = null;
function mulaiSinkronErrorLogBerkala() {
    if (intervalSinkronErrorLog) return;
    intervalSinkronErrorLog = setInterval(() => {
        const cfg = readConfig();
        if (cfg) sinkronkanErrorLogPending(cfg).catch(() => {});
    }, 60000);
}
function berhentiSinkronErrorLogBerkala() {
    if (intervalSinkronErrorLog) { clearInterval(intervalSinkronErrorLog); intervalSinkronErrorLog = null; }
}

/**
 * Kirim ULANG seluruh batch Impor Katalog Barang yg masih {@code PENDING} ke server (aksi
 * {@code produk_impor_excel_komit}), satu per satu -- pola SAMA PERSIS dgn
 * {@link #sinkronkanTransaksiPending}/{@link #sinkronkanSesiKasPending}: berhenti SEGERA begitu satu
 * percobaan gagal karena OFFLINE (bukan ditolak server -- tak ada gunanya coba sisanya kalau memang
 * tak ada internet sama sekali saat ini). Begitu satu batch berhasil, jendela Kasir (bila masih
 * terbuka -- mis. supervisor sempat menutup layar Tinjau Impor sebelum sinkron kelar) diberi tahu
 * lewat event {@code pos:import-katalog-tersinkron} supaya layar Produk bisa menyegarkan
 * laporan/daftar produk TANPA supervisor perlu klik ulang apa pun.
 *
 * @param {{host:string, contextPath:string, https:boolean}|null} cfg
 */
async function sinkronkanImporKatalogPending(cfg) {
    if (!cfg || modeOffline) return;
    const pending = localDb.listImporKatalogPending();
    for (const batch of pending) {
        try {
            // Dipecah bertahap juga di sini (lihat JavaDoc kirimKomitExcelBertahap) -- batch besar yg
            // tadinya offline TETAP berisiko timeout kalau dikirim ulang sbg satu permintaan raksasa;
            // tanpa onProgress krn ini sinkronisasi latar, tak ada layar yg menonton.
            const hasil = await kirimKomitExcelBertahap(cfg, batch.tokoId, batch.baris);
            if (hasil.ok && !hasil.offline) {
                localDb.tandaiImporKatalogSinkron(batch.id, hasil.data);
                if (batch.nonaktifkanTakDitemukan) {
                    // Batch ini tadinya disimpan offline dgn checkbox "Nonaktifkan produk yang tidak
                    // ada di file ini" tercentang -- lihat JavaDoc nonaktifkanProdukTakDiimpor. Gagal-
                    // aman: batch impor UTAMA sudah tersinkron di atas, jadi kegagalan langkah ini
                    // TIDAK boleh membuat batch balik berstatus PENDING/gagal.
                    try { await nonaktifkanProdukTakDiimpor(cfg, batch.tokoId, hasil.data && hasil.data.baris); } catch (eNon) { /* diamkan */ }
                }
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('pos:import-katalog-tersinkron', { id: batch.id, hasil: hasil.data });
                }
            } else if (hasil.offline) {
                break;
            } else {
                localDb.tandaiImporKatalogGagal(batch.id, hasil.pesan);
            }
        } catch (e) { /* satu batch gagal tak boleh menghentikan batch lain dlm antrean */ }
    }
}

/** Timer berkala (30 detik) selama jendela Kasir terbuka -- pola SAMA PERSIS dgn {@link #mulaiSinkronSesiKasBerkala}. */
function mulaiSinkronImporKatalogBerkala() {
    if (intervalSinkronImporKatalog) return;
    intervalSinkronImporKatalog = setInterval(() => {
        const cfg = readConfig();
        if (cfg) sinkronkanImporKatalogPending(cfg).catch(() => {});
    }, 30000);
}
function berhentiSinkronImporKatalogBerkala() {
    if (intervalSinkronImporKatalog) { clearInterval(intervalSinkronImporKatalog); intervalSinkronImporKatalog = null; }
}

ipcMain.handle('pos:sesi-kas-status', async (event, payload) => {
    const tokoId = payload && payload.id_toko != null ? Number(payload.id_toko) : null;
    const lokal = localDb.sesiKasAktifLokal(tokoId);
    if (!lokal) return { ok: true, data: { terbuka: false } };

    const data = {
        terbuka: true,
        waktuBuka: lokal.waktu_buka,
        modalAwal: lokal.modal_awal,
        totalTunai: 0,
        totalNonTunai: 0,
        kasSaatIni: lokal.modal_awal,
        belumSinkron: !lokal.tersinkron_buka
    };
    // Pengayaan best-effort: tanya server angka penjualan BERJALAN yg akurat (bukan cuma modal awal)
    // -- gagal/offline TIDAK apa-apa, gerbang "terbuka" di atas SUDAH final dari lokal, tak menunggu ini.
    try {
        const cfg = readConfig();
        if (cfg && !modeOffline) {
            const hasilServer = await panggilPosApi(cfg, 'sesi_kas_status', payload || {});
            if (hasilServer.ok && hasilServer.data && hasilServer.data.terbuka) {
                data.totalTunai = hasilServer.data.totalTunai || 0;
                data.totalNonTunai = hasilServer.data.totalNonTunai || 0;
                data.kasSaatIni = hasilServer.data.kasSaatIni != null ? hasilServer.data.kasSaatIni : data.kasSaatIni;
            }
        }
    } catch (e) { /* murni pengayaan tampilan, diamkan */ }
    return { ok: true, data: data };
});

ipcMain.handle('pos:sesi-kas-buka', async (event, payload) => {
    const tokoId = payload && payload.id_toko != null ? Number(payload.id_toko) : null;
    if (localDb.sesiKasAktifLokal(tokoId)) {
        return { ok: false, pesan: 'Sesi kas sudah terbuka. Tutup kas yang sedang berjalan sebelum membuka sesi baru.' };
    }
    const kode = buatKodeSesiKasLokal();
    const waktuBuka = keFormatWaktuServerSesiKas(new Date());
    localDb.sesiKasBukaLokal({
        kode: kode,
        tokoId: tokoId,
        modalAwal: (payload && payload.modal_awal) || 0,
        keterangan: payload && payload.keterangan,
        waktuBuka: waktuBuka
    });
    const cfg = readConfig();
    if (cfg && !modeOffline) {
        sinkronkanSatuSesiKas(cfg, kode).catch(() => {}); // SENGAJA tidak ditunggu -- kasir sudah boleh lanjut jualan seketika
    }
    return { ok: true, offline: modeOffline || !cfg };
});

ipcMain.handle('pos:sesi-kas-tutup', async (event, payload) => {
    const tokoId = payload && payload.id_toko != null ? Number(payload.id_toko) : null;
    const lokal = localDb.sesiKasAktifLokal(tokoId);
    if (!lokal) return { ok: false, pesan: 'Tidak ada sesi kas yang terbuka untuk ditutup.' };

    const waktuTutup = keFormatWaktuServerSesiKas(new Date());
    localDb.sesiKasTutupLokal(lokal.kode, {
        uangFisik: (payload && payload.uang_fisik) || 0,
        keterangan: payload && payload.keterangan,
        waktuTutup: waktuTutup
    });

    const cfg = readConfig();
    let selisih = null;
    if (cfg && !modeOffline) {
        try {
            const hasilSync = await sinkronkanSatuSesiKas(cfg, lokal.kode);
            if (hasilSync && hasilSync.selisih != null) selisih = hasilSync.selisih;
        } catch (e) { /* akan dicoba lagi otomatis via timer berkala */ }
    }
    return {
        ok: true,
        offline: modeOffline || !cfg,
        data: { selisih: selisih != null ? selisih : 0, belumSinkron: selisih == null }
    };
});

/**
 * Fitur "Popup Pesanan Online Baru" -- meneruskan ke {@code PosApi.pesanan_online_baru} (server,
 * lihat JavaDoc {@code KantinHelper.pesananOnlineBaru}). Dipoll berkala dari renderer (bukan push) --
 * kegagalan jaringan sengaja TIDAK dilaporkan ke kasir sbg error (beda dari handler lain di atas):
 * satu siklus poll gagal itu wajar (mis. jaringan sempat putus sesaat) dan akan otomatis dicoba lagi
 * siklus berikutnya, bukan sesuatu yg perlu mengganggu kasir yg sedang melayani pelanggan.
 */
ipcMain.handle('pos:pesanan-online-baru', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'pesanan_online_baru', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi.' };
    return hasil;
});

/**
 * Fitur "Top Up Saldo lewat POS" -- meneruskan ke {@code PosApi.topup_saldo} (server, lihat JavaDoc
 * {@code KantinHelper.topupSaldo}: gerbang otorisasi hak kasir + jenis keanggotaan member SEPENUHNYA
 * di server). TANPA cache offline -- top up adalah penulisan finansial, harus gagal jelas saat offline
 * alih-alih diam-diam antre seperti transaksi checkout biasa.
 */
ipcMain.handle('pos:topup-saldo', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'topup_saldo', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- top up tidak bisa diproses saat offline.' };
    return hasil;
});

/**
 * Verifikasi PIN transaksi member -- SATU-SATUNYA panggilan jaringan yang berasal dari jendela Layar
 * Pelanggan (lihat JavaDoc {@code preload-customer.js}). Dipanggil LANGSUNG di sini (bukan diteruskan
 * ke jendela Kasir dulu) krn proses utama ini SUDAH memegang token PosApi -- lebih pendek & lebih aman
 * (PIN tak perlu singgah di jendela Kasir sama sekali). Balikan direshape jadi {@code cocok} (BUKAN
 * {@code ok} server mentah) supaya numpad PIN bisa membedakan "panggilan gagal" ({@code ok:false}) dari
 * "PIN salah" ({@code ok:true, cocok:false}) tanpa perlu buka {@code data} bersarang.
 */
ipcMain.handle('pos:verifikasi-pin', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'verifikasi_pin', payload);
    if (hasil.ok) return { ok: true, cocok: !!(hasil.data && hasil.data.ok) };
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- verifikasi PIN tidak bisa dilakukan.' };
    return { ok: false, pesan: hasil.pesan };
});

/**
 * Manajemen akun (butir 11 spesifikasi "dashboard kasir") -- meneruskan ke {@code PosApi.akun_ganti_password}/
 * {@code akun_tambah} (server, lihat JavaDoc {@code KantinHelper.gantiPasswordSendiri}/{@code tambahAkunKasir}
 * utk gerbang otorisasi lengkap -- "tambah" HANYA berhasil utk akun admin/manager, server yg menegakkan,
 * bukan Desktop). SENGAJA TIDAK ada fallback offline -- keduanya mengubah kredensial login, wajib data
 * server terkini.
 */
ipcMain.handle('pos:akun-ganti-password', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'akun_ganti_password', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- kata sandi tidak bisa diganti saat offline.' };
    return hasil;
});
ipcMain.handle('pos:akun-tambah', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'akun_tambah', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- akun tidak bisa dibuat saat offline.' };
    return hasil;
});

/**
 * Fitur "Akun Pedagang" (menu Konfigurasi) -- daftar/ubah akun {@code Pedagang} milik toko yang
 * login, lihat JavaDoc server {@code KantinHelper.pedagangList}/{@code pedagangUbah}. Gerbang
 * tambah/ubah SEBENARNYA ditegakkan server-side (supervisor/admin saja) -- handler ini murni proksi.
 */
ipcMain.handle('pos:pedagang-list', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'pedagang_list', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- daftar akun pedagang butuh koneksi aktif.' };
    return hasil;
});
ipcMain.handle('pos:pedagang-ubah', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'pedagang_ubah', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- akun tidak bisa diubah saat offline.' };
    return hasil;
});

/**
 * Fitur "Konfigurasi" -- Profil Toko (server), lihat JavaDoc server
 * {@code KantinHelper.tokoProfilAmbil}/{@code tokoProfilSimpan}. BEDA dari diskon/anggota (yg SENGAJA
 * tidak dicache -- lihat JavaDoc di atasnya): nama/alamat/kontak toko adalah data "profil", bukan data
 * transaksional/finansial yg wajib real-time -- aman dipakai versi sedikit basi saat offline (mis.
 * utk mencetak kop struk), jadi dicache spt katalog/konfigurasi (pola sama {@code pos:konfigurasi}).
 */
ipcMain.handle('pos:toko-profil-ambil', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'toko_profil_ambil', payload || {});
    if (hasil.ok) {
        localDb.simpanCache('toko_profil', hasil.data);
        return { ok: true, data: hasil.data, fromCache: false };
    }
    if (hasil.offline) {
        const cache = localDb.bacaCache('toko_profil');
        if (cache) return { ok: true, data: cache.data, fromCache: true, cachedAt: cache.disimpanPada };
        return { ok: false, offline: true, pesan: 'Tidak ada koneksi dan belum ada data profil toko tersimpan.' };
    }
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});
ipcMain.handle('pos:toko-profil-simpan', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'toko_profil_simpan', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- profil toko tidak bisa disimpan saat offline.' };
    return hasil;
});

/**
 * Fitur "Konfigurasi" -- tampilan aplikasi LOKAL (judul + logo), lihat JavaDoc {@link BRANDING_PATH}.
 * Murni operasi berkas lokal, TIDAK ADA panggilan server sama sekali.
 */
ipcMain.handle('pos:branding-ambil', async () => {
    try { return { ok: true, data: bacaBranding() }; } catch (e) { return { ok: false, pesan: String(e && e.message || e) }; }
});
ipcMain.handle('pos:branding-simpan-judul', async (event, payload) => {
    try {
        const judul = ((payload && payload.judulAplikasi) || '').trim() || 'POS Kasir';
        return { ok: true, data: simpanBranding({ judulAplikasi: judul }) };
    } catch (e) { return { ok: false, pesan: String(e && e.message || e) }; }
});
/**
 * Membuka dialog pilih berkas gambar native, MENYALIN berkas terpilih ke {@code userData/branding/}
 * (bukan sekadar menyimpan path aslinya) -- supaya logo tetap tersedia walau berkas sumber aslinya
 * (mis. di USB/folder Downloads) kemudian dipindah/dihapus pengguna. Pola "salin ke folder aplikasi
 * sendiri" SAMA dgn cache foto produk/anggota ({@code unduhCacheGambarProduk}/
 * {@code sinkronkanAnggotaLengkap}), hanya sumbernya disk lokal, bukan unduhan.
 */
ipcMain.handle('pos:branding-pilih-logo', async () => {
    try {
        const hasilDialog = await dialog.showOpenDialog({
            title: 'Pilih Logo POS',
            properties: ['openFile'],
            filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
        });
        if (hasilDialog.canceled || !hasilDialog.filePaths || hasilDialog.filePaths.length === 0) {
            return { ok: false, dibatalkan: true };
        }
        const sumber = hasilDialog.filePaths[0];
        const ekstensi = path.extname(sumber) || '.png';
        const dirTujuan = path.join(app.getPath('userData'), 'branding');
        fs.mkdirSync(dirTujuan, { recursive: true });
        const tujuan = path.join(dirTujuan, 'logo' + ekstensi);
        fs.copyFileSync(sumber, tujuan);
        const logoPath = 'file://' + tujuan.replace(/\\/g, '/');
        return { ok: true, data: simpanBranding({ logoLokalPath: logoPath }) };
    } catch (e) {
        return { ok: false, pesan: 'Gagal memilih/menyalin berkas logo: ' + (e && e.message ? e.message : e) };
    }
});

/**
 * Layar "Customer/Anggota" (butir 12 spesifikasi "dashboard kasir") -- meneruskan ke
 * {@code PosApi.anggota_list/anggota_simpan/jenis_anggota_list} (server, lihat JavaDoc
 * {@code KantinHelper.anggotaList}/{@code anggotaSimpan}/{@code jenisAnggotaList}). SENGAJA TIDAK ada
 * cache/fallback offline -- sama seperti pencarian member (cari_member) di layar Kasir, data anggota
 * WAJIB terkini (mis. mencegah membuat 2 anggota kembar dgn kode sama saat offline).
 */
ipcMain.handle('pos:anggota-list', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'anggota_list', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- daftar anggota butuh data terkini.' };
    return hasil;
});
ipcMain.handle('pos:anggota-simpan', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'anggota_simpan', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- anggota tidak bisa disimpan saat offline.' };
    return hasil;
});
ipcMain.handle('pos:anggota-jenis-list', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'jenis_anggota_list', {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi.' };
    return hasil;
});
ipcMain.handle('pos:anggota-tipe-list', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'tipe_anggota_list', {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi.' };
    return hasil;
});
ipcMain.handle('pos:anggota-statistik', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'anggota_statistik', {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi.' };
    return hasil;
});

/**
 * Layar "Aturan Diskon" -- meneruskan ke {@code PosApi.diskon_list/diskon_simpan} (server, lihat
 * JavaDoc {@code KantinHelper.diskonList}/{@code diskonSimpan}). SENGAJA TIDAK ada cache offline --
 * sama seperti anggota, data aturan diskon WAJIB terkini.
 */
ipcMain.handle('pos:diskon-list', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'diskon_list', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- daftar aturan diskon butuh data terkini.' };
    return hasil;
});
ipcMain.handle('pos:diskon-simpan', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'diskon_simpan', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- aturan diskon tidak bisa disimpan saat offline.' };
    return hasil;
});

/**
 * Layar "Katalog Barang" (produk.html, khusus supervisor) -- meneruskan ke {@code
 * PosApi.produk_simpan} (server, lihat JavaDoc {@code KantinHelper.produkSimpan}). SENGAJA TIDAK
 * ada antrean offline -- sama seperti diskon, data katalog WAJIB tersimpan langsung ke server
 * (bukan hanya ke database lokal) supaya toko lain/kasir lain langsung melihat produk terbaru,
 * dan supaya harga jual yang dipakai checkout tidak pernah basi. Daftar produk dibaca lewat aksi
 * {@code pos:katalog} yang sudah ada (dipakai juga oleh layar Kasir) -- tidak perlu aksi baca baru.
 */
ipcMain.handle('pos:produk-simpan', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_simpan', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- katalog barang tidak bisa disimpan saat offline.' };
    return hasil;
});

/**
 * Fitur "Dasbor Statistik Produk" (layar Produk) -- meneruskan ke {@code PosApi.produk_statistik}
 * (server, lihat JavaDoc {@code KantinHelper.produkStatistik}): kartu KPI (total/aktif/nonaktif/stok
 * habis-rendah/nilai stok) + 3 breakdown (kategori/pemasok/rentang harga) utk chart batang.
 */
ipcMain.handle('pos:produk-statistik', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_statistik', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi.' };
    return hasil;
});
/**
 * Fitur "klik kartu/bar statistik utk lihat daftar barangnya" (layar Produk) -- meneruskan ke
 * {@code PosApi.produk_statistik_detail} (lihat JavaDoc server {@code KantinHelper.produkStatistikDetail}).
 * SENGAJA endpoint TERPISAH dari {@code pos:katalog} -- lihat JavaDoc server soal alasan (katalog
 * SELALU menyaring aktif-saja, popup ini perlu bisa menampilkan produk Non-Aktif jg).
 */
ipcMain.handle('pos:produk-statistik-detail', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_statistik_detail', payload || {});
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi.' };
    return hasil;
});
/**
 * Fitur "Bersihkan Produk Duplikat" (pratinjau+eksekusi) -- gerbang supervisor/admin DITEGAKKAN
 * server-side (lihat JavaDoc PosApi.bolehSupervisorAtauAdmin), bukan cuma disembunyikan di UI.
 * Butuh koneksi aktif (tidak ada mode offline utk operasi tulis/hapus data).
 *
 * <p>Gap-closure "semua tombol selalu gagal 'Tidak Ada Koneksi' padahal online": query pencarian
 * grup duplikat (self-join + subquery per baris, lihat {@code KantinHelper.cariGrupDuplikat}) bisa
 * memakan waktu lebih dari timeout DEFAULT 15 detik {@link #panggilPosApi} pada toko dgn puluhan
 * ribu produk (nyata terjadi) -- {@code panggilPosApi} salah memetakan TIMEOUT sbg {@code
 * offline:true} (tak bisa membedakan "server tak terjangkau" dari "server lambat merespons"),
 * sehingga pesan "Tidak Ada Koneksi" muncul walau sebenarnya sedang online. Timeout dinaikkan jauh
 * (2 menit) krn ini operasi admin manual/jarang, bukan jalur cepat Kasir -- kasir/supervisor lebih
 * baik menunggu drpd gagal palsu. Lihat jg indeks baru {@code InitIndex.java} utk koperasi.produk/
 * koperasi.pembelian yang mempercepat query aslinya.
 */
ipcMain.handle('pos:produk-duplikat-cari', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_duplikat_cari', payload || {}, 120000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi (atau server terlalu lama merespons) -- pembersihan duplikat butuh koneksi aktif.' };
    return hasil;
});
ipcMain.handle('pos:produk-duplikat-hapus', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_duplikat_hapus', payload || {}, 120000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi (atau server terlalu lama merespons) -- pembersihan duplikat butuh koneksi aktif.' };
    return hasil;
});

/**
 * Fitur "Hapus Non-Aktif Tak Terpakai" (layar Katalog Barang, khusus supervisor/admin) -- meneruskan
 * ke {@code PosApi.produk_hapus_nonaktif_tak_terpakai} (lihat JavaDoc server
 * {@code KantinHelper.produkHapusNonaktifTakTerpakai}). Aksi PERMANEN -- konfirmasi ditampilkan di
 * renderer SEBELUM handler ini dipanggil.
 */
ipcMain.handle('pos:produk-hapus-nonaktif-tak-terpakai', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_hapus_nonaktif_tak_terpakai', payload || {}, 120000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi (atau server terlalu lama merespons) -- perlu koneksi aktif.' };
    return hasil;
});

/**
 * Fitur "Hapus Produk Tak Ada Transaksi" (layar Katalog Barang, khusus supervisor/admin) --
 * meneruskan ke {@code PosApi.produk_hapus_tak_ada_transaksi} (lihat JavaDoc server
 * {@code KantinHelper.produkHapusTakAdaTransaksi}). Aksi PERMANEN -- konfirmasi ditampilkan di
 * renderer SEBELUM handler ini dipanggil.
 */
ipcMain.handle('pos:produk-hapus-tak-ada-transaksi', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_hapus_tak_ada_transaksi', payload || {}, 120000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi (atau server terlalu lama merespons) -- perlu koneksi aktif.' };
    return hasil;
});

/**
 * Fitur "Unduh Excel" (layar Produk, khusus supervisor) -- meneruskan ke {@code
 * PosApi.produk_ekspor_excel} (server, lihat JavaDoc {@code KantinHelper.produkEksporExcel}).
 * HANYA mengambil {@code fileBase64} dari server -- MENULISNYA ke disk dilakukan terpisah lewat
 * {@code pos:produk-simpan-excel} (pola sama {@code pos:laporan-simpan-pdf}: ambil data lalu simpan
 * adalah 2 langkah terpisah, bukan 1 handler gabungan, supaya renderer bisa menampilkan progress
 * "mengunduh..." lalu "menyimpan..." terpisah).
 */
ipcMain.handle('pos:produk-ekspor-excel', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_ekspor_excel', payload || {}, 60000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- katalog perlu diunduh langsung dari server.' };
    return hasil;
});

/** Menyimpan hasil {@code pos:produk-ekspor-excel} (base64 .xlsx) ke berkas pilihan pengguna -- padanan {@code pos:laporan-simpan-pdf} tapi utk ekstensi .xlsx. */
ipcMain.handle('pos:produk-simpan-excel', async (event, opsi) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const hasil = await dialog.showSaveDialog(win, {
        title: 'Simpan Katalog Excel',
        defaultPath: (opsi && opsi.namaBerkas) || 'katalog-produk.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (hasil.canceled || !hasil.filePath) return { ok: false, dibatalkan: true };
    try {
        fs.writeFileSync(hasil.filePath, Buffer.from((opsi && opsi.fileBase64) || '', 'base64'));
        return { ok: true, path: hasil.filePath };
    } catch (e) {
        return { ok: false, pesan: 'Gagal menyimpan berkas Excel: ' + (e && e.message ? e.message : e) };
    }
});

/**
 * Membuka dialog pilih berkas .xlsx native lalu MEMBACANYA sbg base64 -- TIDAK memanggil server di
 * sini (pola sama {@code pos:branding-pilih-logo}: "pilih+baca berkas lokal" terpisah dari "kirim ke
 * server"), supaya renderer bebas menampilkan konfirmasi/preview nama berkas sebelum benar-benar
 * mengunggah lewat {@code pos:produk-pratinjau-excel} (langkah 1/2 -- parse+tinjau) lalu {@code
 * pos:produk-komit-excel} (langkah 2/2 -- simpan sungguhan, setelah user meninjau/mengedit di layar
 * review).
 */
ipcMain.handle('pos:produk-pilih-excel', async () => {
    try {
        const hasilDialog = await dialog.showOpenDialog({
            title: 'Pilih Berkas Excel Katalog',
            properties: ['openFile'],
            filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        });
        if (hasilDialog.canceled || !hasilDialog.filePaths || hasilDialog.filePaths.length === 0) {
            return { ok: false, dibatalkan: true };
        }
        const sumber = hasilDialog.filePaths[0];
        const base64 = fs.readFileSync(sumber).toString('base64');
        return { ok: true, base64: base64, namaBerkas: path.basename(sumber) };
    } catch (e) {
        return { ok: false, pesan: 'Gagal membaca berkas Excel: ' + (e && e.message ? e.message : e) };
    }
});

/**
 * Fitur "Unggah Excel" langkah 1/2 -- meneruskan {@code file_base64} (hasil {@code
 * pos:produk-pilih-excel}) ke {@code PosApi.produk_impor_excel_preview} (server, lihat JavaDoc
 * {@code KantinHelper.produkImporExcelPreview}). HANYA PARSE, tidak menulis apa pun ke database --
 * hasilnya ditampilkan renderer sbg layar review (edit sebelum simpan), lihat JavaDoc
 * {@code pos:produk-komit-excel} utk langkah 2/2 (simpan sungguhan).
 */
ipcMain.handle('pos:produk-pratinjau-excel', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_impor_excel_preview', payload || {}, 120000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- katalog perlu diproses langsung oleh server.' };
    return hasil;
});

/**
 * Kirim SELURUH baris komit impor Excel ke server, DIPECAH jadi beberapa permintaan ber-urutan
 * ({@link #UKURAN_BATCH_KOMIT_EXCEL} baris/permintaan) alih-alih satu permintaan raksasa utk ribuan
 * baris sekaligus -- dipakai BERSAMA oleh handler interaktif {@code pos:produk-komit-excel} (langkah
 * "Simpan" di layar Tinjau Impor, PERLU progress bar) dan sinkronisasi latar
 * {@link #sinkronkanImporKatalogPending} (batch yg tadinya offline, TIDAK perlu progress bar krn tak
 * ada yg menonton) -- SATU tempat logika pemecahan-batch+penggabungan-hasil ditulis, supaya kedua
 * jalur selalu berperilaku identik & sama-sama kebal dari risiko timeout pada katalog besar (mis.
 * 5000+ baris, yg sebelumnya dikirim sbg SATU permintaan JSON raksasa dalam satu transaksi server).
 *
 * <p>Hasil tiap batch DIGABUNG (angka ringkasan dijumlah, baris detail disambung dgn nomor urut
 * berkelanjutan) sehingga bentuk akhirnya SAMA PERSIS dgn sebelum ada pemecahan batch ini -- pemanggil
 * tidak perlu tahu bahwa di baliknya sebenarnya beberapa permintaan terpisah.</p>
 *
 * <p>Begitu satu batch offline/timeout, PROSES BERHENTI SEGERA (tak lanjut ke batch berikutnya) --
 * balikan {@code offline:true}. Begitu satu batch DITOLAK TEGAS server (bukan soal koneksi, mis. sesi
 * admin kedaluwarsa), proses JUGA berhenti -- balikan {@code ok:false} beserta {@code diprosesSoFar}
 * (berapa baris yg SUDAH SEMPAT tersimpan sebelum berhenti, aman tidak hilang krn
 * {@code produk_impor_excel_komit} idempoten/upsert per kode produk -- mengulang dari awal nanti
 * hanya menimpa ulang nilai yg sama, bukan menduplikasi).</p>
 *
 * @param {object} cfg
 * @param {number|undefined} tokoId
 * @param {object[]} semuaBaris
 * @param {(diproses:number, total:number)=>void} [onProgress] dipanggil setelah tiap batch selesai (opsional).
 * @return {Promise<{ok:boolean, offline?:boolean, pesan?:string, butuhLoginUlang?:boolean, data?:object, diprosesSoFar:number}>}
 */
const UKURAN_BATCH_KOMIT_EXCEL = 200;
async function kirimKomitExcelBertahap(cfg, tokoId, semuaBaris, onProgress) {
    const totalBaris = semuaBaris.length;
    const potongan = [];
    for (let i = 0; i < totalBaris; i += UKURAN_BATCH_KOMIT_EXCEL) potongan.push(semuaBaris.slice(i, i + UKURAN_BATCH_KOMIT_EXCEL));
    if (potongan.length === 0) potongan.push([]);

    const agregat = { dibuat: 0, diperbarui: 0, dilewati: 0, kategoriBaru: 0, pemasokBaru: 0, satuanBaru: 0, stokDiopname: 0, verifikasiGagal: 0, error: [], baris: [] };
    let diprosesSoFar = 0;
    if (onProgress) onProgress(0, totalBaris);

    for (let idx = 0; idx < potongan.length; idx++) {
        const bagian = potongan[idx];
        const hasil = await panggilPosApi(cfg, 'produk_impor_excel_komit', { toko_id: tokoId, baris: bagian }, 300000);

        if (hasil.offline) {
            return { ok: true, offline: true, diprosesSoFar: diprosesSoFar };
        }
        if (!hasil.ok) {
            return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang, diprosesSoFar: diprosesSoFar, data: agregat };
        }

        const d = hasil.data || {};
        agregat.dibuat += d.dibuat || 0;
        agregat.diperbarui += d.diperbarui || 0;
        agregat.dilewati += d.dilewati || 0;
        agregat.kategoriBaru += d.kategoriBaru || 0;
        agregat.pemasokBaru += d.pemasokBaru || 0;
        agregat.satuanBaru += d.satuanBaru || 0;
        agregat.stokDiopname += d.stokDiopname || 0;
        agregat.verifikasiGagal += d.verifikasiGagal || 0;
        if (Array.isArray(d.error)) agregat.error = agregat.error.concat(d.error);
        (d.baris || []).forEach((b) => { agregat.baris.push(Object.assign({}, b, { no: agregat.baris.length + 1 })); });

        diprosesSoFar += bagian.length;
        if (onProgress) onProgress(diprosesSoFar, totalBaris);
    }

    return { ok: true, offline: false, data: agregat, diprosesSoFar: diprosesSoFar };
}

/**
 * Fitur "Nonaktifkan produk yang tidak ada di file ini" -- checkbox OPSIONAL (default nonaktif) di
 * layar Tinjau Impor Katalog. WAJIB dipanggil SETELAH {@link #kirimKomitExcelBertahap} benar2 selesai
 * (SEMUA chunk/batch sudah terkirim, bukan per-chunk) memakai {@code barisHasil} GABUNGAN dari
 * SELURUH file -- kalau dipanggil per-chunk, tiap chunk akan salah paham baris2 di chunk LAIN sbg
 * "tidak ada di file" & saling menonaktifkan satu sama lain. Gagal-aman: kegagalan panggilan ini tidak
 * boleh membuat impor UTAMA (yg sudah tersimpan) dianggap gagal -- lihat pemanggil.
 * @param {object} cfg
 * @param {number|undefined} tokoId
 * @param {Array<object>} barisHasil gabungan {@code data.baris} dari kirimKomitExcelBertahap.
 * @return {Promise<{ok:boolean, dinonaktifkan?:number, pesan?:string}>}
 */
async function nonaktifkanProdukTakDiimpor(cfg, tokoId, barisHasil) {
    const idDisentuh = (barisHasil || [])
        .filter((b) => b && b.status === 'berhasil' && b.id != null)
        .map((b) => b.id);
    const hasil = await panggilPosApi(cfg, 'produk_nonaktifkan_tak_diimpor', { toko_id: tokoId, id_disentuh: idDisentuh }, 60000);
    if (!hasil.ok) return { ok: false, pesan: hasil.pesan };
    return { ok: true, dinonaktifkan: hasil.data && hasil.data.dinonaktifkan };
}

/**
 * "Simpan" di layar Tinjau Impor Katalog -- offline-first (pola SAMA PERSIS dgn
 * {@link #prosesTransaksiPosOfflineFirst}): SELURUH baris (bisa ribuan) SELALU ditulis lokal PENDING
 * dulu ({@code localDb.simpanImporKatalogBaru}, SATU record utuh -- TIDAK dipecah) SEBELUM dicoba
 * kirim ke server sama sekali, supaya klik "Simpan" tidak pernah kehilangan data walau internet putus
 * TEPAT setelah diklik -- baik sedang online maupun benar-benar offline. Pengiriman sesungguhnya lewat
 * {@link #kirimKomitExcelBertahap} (progress bar gap-closure -- SEBELUMNYA katalog besar hanya
 * menampilkan teks tombol "Menyimpan..." statis selama mungkin beberapa menit tanpa progres terlihat;
 * {@link #kirimStatusImporKatalog} sekarang mengirim {@code {diproses, total}} tiap batch selesai).
 */
ipcMain.handle('pos:produk-komit-excel', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };

    const idLokal = 'IMPKTL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const semuaBaris = (payload && payload.baris) || [];
    const tokoId = payload && payload.toko_id;
    const nonaktifkanTakDitemukan = !!(payload && payload.nonaktifkanTakDitemukan);
    localDb.simpanImporKatalogBaru({ id: idLokal, tokoId: tokoId, baris: semuaBaris, nonaktifkanTakDitemukan: nonaktifkanTakDitemukan });

    const hasil = await kirimKomitExcelBertahap(cfg, tokoId, semuaBaris, (diproses, total) => kirimStatusImporKatalog({ diproses, total }));

    if (hasil.offline) {
        return { ok: true, offline: true, idLokal: idLokal, pesan: 'Tidak ada koneksi -- data katalog tersimpan di perangkat ini, akan dikirim otomatis ke server begitu koneksi internet pulih.' };
    }
    if (!hasil.ok) {
        localDb.tandaiImporKatalogGagal(idLokal, hasil.pesan);
        return {
            ok: false, idLokal: idLokal, butuhLoginUlang: hasil.butuhLoginUlang,
            pesan: 'Berhasil memproses ' + hasil.diprosesSoFar + ' dari ' + semuaBaris.length + ' baris sebelum terhenti: ' + hasil.pesan
                + ' -- baris yang sudah sempat diproses TETAP tersimpan di server (aman, tidak hilang). '
                + 'Coba impor ulang setelah masalah teratasi (aman diulang dari awal, baris yang sudah benar tidak akan berubah).'
        };
    }

    localDb.tandaiImporKatalogSinkron(idLokal, hasil.data);

    let dinonaktifkan;
    if (nonaktifkanTakDitemukan) {
        // Lihat JavaDoc nonaktifkanProdukTakDiimpor -- gagal-aman, impor UTAMA di atas sudah sukses
        // & tersimpan, kegagalan langkah ini cukup dilaporkan (tanpa dinonaktifkan) di respons.
        try {
            const r = await nonaktifkanProdukTakDiimpor(cfg, tokoId, hasil.data && hasil.data.baris);
            if (r.ok) dinonaktifkan = r.dinonaktifkan;
        } catch (eNon) { /* diamkan -- lihat catatan di atas */ }
    }

    return {
        ok: true,
        data: dinonaktifkan != null ? Object.assign({}, hasil.data, { dinonaktifkan: dinonaktifkan }) : hasil.data,
        offline: false, idLokal: idLokal
    };
});

/** @param {string} id id lokal batch (dari {@code idLokal} balikan {@code pos:produk-komit-excel}). @return {Promise<{ok:boolean, data?:object, pesan?:string}>} status/hasil batch impor katalog TERKINI dari SQLite lokal -- dipakai renderer memuat ulang laporan (mis. setelah jendela Riwayat Sinkronisasi ditutup-buka, atau menerima event {@code pos:import-katalog-tersinkron}). */
ipcMain.handle('pos:produk-impor-status', async (event, id) => {
    try {
        const batch = localDb.ambilImporKatalog(id);
        if (!batch) return { ok: false, pesan: 'Batch impor tidak ditemukan di penyimpanan lokal.' };
        return { ok: true, data: batch };
    } catch (e) {
        return { ok: false, pesan: String(e && e.message || e) };
    }
});

/**
 * Tombol "Hitung Ulang Stok" (layar Katalog Barang, khusus supervisor/admin) -- proksi tipis ke
 * {@code PosApi.stok_hitung_ulang} (lihat JavaDoc {@code KantinHelper.stokHitungUlang}). SEKALIGUS
 * jadi jalan pemulihan mandiri kalau Stok terlihat tidak akurat (mis. bug lama di jalur penulisan
 * StokOpname.selisih) -- server memperbaiki data lama dulu sebelum recompute, kasir tak perlu
 * mengetik SQL manual. Timeout lebih longgar (bisa ribuan produk per toko, tiap produk 1 UPDATE).
 */
ipcMain.handle('pos:stok-hitung-ulang', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'stok_hitung_ulang', payload || {}, 300000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- hitung ulang stok butuh koneksi ke server.' };
    return hasil;
});

/**
 * Simpan berkas teks LANGSUNG ke folder Downloads pengguna, TANPA dialog "Simpan Sebagai" -- dipakai
 * laporan hasil impor katalog (produk-renderer.js) supaya laporan otomatis tersimpan begitu proses
 * impor selesai, tak perlu supervisor mengklik apa pun lagi. Berkas ditaruh di subfolder
 * "AIS POS - Laporan Impor Katalog" (dibuat otomatis bila belum ada) supaya tidak bercampur acak dgn
 * berkas lain di Downloads. Nama berkas SUDAH dijaga unik oleh pemanggil (menyertakan idLokal +
 * timestamp) -- di sini cukup tulis apa adanya, timpa kalau kebetulan sudah ada (retry idempoten).
 * @param {{namaFile:string, isiTeks:string}} payload
 * @return {Promise<{ok:boolean, path?:string, pesan?:string}>}
 */
ipcMain.handle('pos:simpan-laporan-otomatis', async (event, payload) => {
    try {
        const namaFile = (payload && payload.namaFile) || ('laporan-' + Date.now() + '.txt');
        const isiTeks = (payload && payload.isiTeks) || '';
        const folder = path.join(app.getPath('downloads'), 'AIS POS - Laporan Impor Katalog');
        fs.mkdirSync(folder, { recursive: true });
        const tujuan = path.join(folder, namaFile);
        fs.writeFileSync(tujuan, isiTeks, 'utf8');
        return { ok: true, path: tujuan };
    } catch (e) {
        return { ok: false, pesan: String(e && e.message || e) };
    }
});

/**
 * Tombol "Download Excel" di layar review -- meneruskan baris yang SEDANG ditampilkan/diedit user
 * (bukan query ulang ke database) ke {@code PosApi.produk_grid_ekspor_excel}, lihat JavaDoc
 * {@code KantinHelper.produkGridEksporExcel}. Hasil base64 disimpan lewat {@code
 * pos:produk-simpan-excel} yang sudah ada (dialog simpan + tulis file, dipakai bersama tombol
 * "Unduh Excel" biasa di luar layar review).
 */
ipcMain.handle('pos:produk-grid-ekspor-excel', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'produk_grid_ekspor_excel', payload || {}, 60000);
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- unduhan perlu diproses langsung oleh server.' };
    return hasil;
});

/**
 * Cetak struk LANGSUNG ke printer default, TANPA dialog "Pilih Printer" -- keluhan lapangan: kasir
 * harus mengklik "Print" tiap struk krn {@code window.print()} (dipakai struk.js sebelumnya) SELALU
 * memunculkan dialog cetak native Windows. Dialog itu muncul KARENA {@code window.print()} adalah API
 * level-renderer yg tidak tahu apa-apa soal printer -- satu-satunya cara mencetak tanpa dialog di
 * Electron adalah {@code webContents.print()} yg HANYA ada di proses UTAMA, dgn opsi {@code
 * silent:true} (memakai printer default sistem, atau {@code deviceName} bila mau memaksa printer
 * tertentu -- TIDAK dipakai di sini, sengaja ikut default OS spy kasir cukup atur default printer
 * sekali di Windows, bukan di aplikasi ini).
 *
 * <p>Jendela struk dibuat TERSEMBUNYI ({@code show:false}) khusus utk mencetak, dimuat dari data URL
 * (bukan berkas sementara di disk -- lebih simpel, tak perlu bersih-bersih file), lalu DIHANCURKAN
 * segera setelah proses cetak selesai (berhasil ATAUPUN gagal) supaya tak menumpuk jendela tak
 * terlihat di memori kalau kasir mencetak struk berkali-kali dalam 1 sesi.</p>
 *
 * @param {{html:string}} payload HTML struk lengkap (hasil {@code struk.js#bangunHtml}).
 * @return {Promise<{ok:boolean, pesan?:string}>}
 */
ipcMain.handle('pos:cetak-struk-diam', async (event, payload) => {
    const html = (payload && payload.html) || '';
    if (!html) return { ok: false, pesan: 'Tidak ada isi struk untuk dicetak.' };
    let winCetak = null;
    try {
        winCetak = new BrowserWindow({
            show: false,
            webPreferences: { sandbox: true }
        });
        await winCetak.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        const hasil = await new Promise((resolve) => {
            winCetak.webContents.print({ silent: true, printBackground: true }, (sukses, alasanGagal) => {
                resolve(sukses ? { ok: true } : { ok: false, pesan: alasanGagal || 'Gagal mencetak (printer default belum diatur di Windows?).' });
            });
        });
        return hasil;
    } catch (e) {
        return { ok: false, pesan: 'Gagal menyiapkan cetak struk: ' + (e && e.message ? e.message : e) };
    } finally {
        if (winCetak && !winCetak.isDestroyed()) winCetak.destroy();
    }
});

/**
 * Bangun halaman pratinjau struk LENGKAP DENGAN toolbar "Cetak"/"Tutup" sendiri -- dipakai
 * {@code pos:cetak-struk-preview} di bawah. Kertas struk ditampilkan di tengah dgn latar abu-abu
 * (supaya jelas beda dari toolbar), toolbar disembunyikan otomatis via {@code @media print} kalau
 * suatu saat halaman ini dicetak lewat jalur lain -- meski jalur resminya tetap
 * {@code webContents.print({silent:true})} dari proses utama begitu tombol "Cetak" ditekan (lihat
 * {@code strukPreviewAPI.cetak} di preload-struk-preview.js), BUKAN {@code window.print()} di
 * renderer (yang akan memunculkan lagi dialog native yang justru ingin dihindari).
 * @param {string} isi   fragmen HTML isi struk (hasil {@code struk.js#bangunIsi}).
 * @param {string} style CSS struk (konstanta {@code struk.js#STYLE_STRUK}).
 * @return {string} halaman HTML lengkap siap dimuat via data URL.
 */
function halamanPratinjauStruk(isi, style) {
    return '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Pratinjau Struk</title><style>'
        + 'html,body{margin:0;height:100%;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f1f5f9;}'
        + 'body{display:flex;flex-direction:column;}'
        + '.pv-scroll{flex:1;overflow:auto;display:flex;justify-content:center;padding:16px;box-sizing:border-box;}'
        + '.pv-kertas{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);height:fit-content;}'
        + '.pv-toolbar{flex-shrink:0;display:flex;gap:10px;padding:12px 16px;background:#fff;border-top:1px solid #e2e8f0;}'
        + '.pv-toolbar button{flex:1;padding:12px;border-radius:8px;border:none;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;}'
        + '.pv-btn-cetak{background:#2563eb;color:#fff;}.pv-btn-cetak:hover{background:#1d4ed8;}'
        + '.pv-btn-tutup{background:#e2e8f0;color:#1e293b;}.pv-btn-tutup:hover{background:#cbd5e1;}'
        + '@media print{.pv-toolbar,.pv-scroll{display:none !important;}}'
        + style
        + '</style></head><body>'
        + '<div class="pv-scroll"><div class="pv-kertas">' + isi + '</div></div>'
        + '<div class="pv-toolbar">'
        + '<button class="pv-btn-tutup" id="btnTutup">Tutup</button>'
        + '<button class="pv-btn-cetak" id="btnCetak">\u{1F5A8}️ Cetak</button>'
        + '</div>'
        + '<script>'
        + "document.getElementById('btnCetak').addEventListener('click', () => window.strukPreviewAPI.cetak());"
        + "document.getElementById('btnTutup').addEventListener('click', () => window.strukPreviewAPI.tutup());"
        + '</script></body></html>';
}

/**
 * Cetak struk DENGAN pratinjau -- kebalikan {@code pos:cetak-struk-diam} di atas: dipakai tombol
 * "Cetak Struk" di modal sukses checkout layar Kasir (permintaan: tampilkan pratinjau dulu, baru
 * benar-benar tercetak begitu kasir menekan tombol "Cetak"). Jendela pratinjau PUNYA TOOLBAR SENDIRI
 * (lihat {@link halamanPratinjauStruk}) -- SENGAJA bukan dialog cetak native Windows seperti percobaan
 * pertama fitur ini, krn dialog itu ternyata TIDAK merender pratinjau visual sungguhan (cuma teks
 * "This app doesn't support print preview") dan jendelanya tumpang tindih janggal dgn layar Kasir di
 * belakangnya. Tombol "Cetak" di toolbar memicu {@code pos:struk-preview-cetak} (sinyal dari jendela
 * ini SENDIRI, dicocokkan via {@code webContents.id} supaya tidak salah tangkap sinyal dari jendela
 * pratinjau lain yg kebetulan sedang terbuka bersamaan) -> proses utama mencetak DIAM-DIAM (pola sama
 * {@code pos:cetak-struk-diam}) ke printer default, lalu jendela ditutup. Tombol "Tutup" atau menutup
 * jendela manual (tombol X) sama-sama membatalkan tanpa mencetak apa pun.
 *
 * @param {{isi:string, style:string}} payload lihat {@link halamanPratinjauStruk}.
 * @return {Promise<{ok:boolean, pesan?:string}>}
 */
ipcMain.handle('pos:cetak-struk-preview', async (event, payload) => {
    const isi = (payload && payload.isi) || '';
    const style = (payload && payload.style) || '';
    if (!isi) return { ok: false, pesan: 'Tidak ada isi struk untuk dicetak.' };
    let winCetak = null;
    try {
        winCetak = new BrowserWindow({
            width: 420,
            height: 640,
            title: 'Pratinjau Struk',
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                preload: path.join(__dirname, 'preload-struk-preview.js')
            }
        });
        await winCetak.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(halamanPratinjauStruk(isi, style)));

        const hasil = await new Promise((resolve) => {
            const wcId = winCetak.webContents.id;
            const bersihkan = () => {
                ipcMain.removeListener('pos:struk-preview-cetak', onCetak);
                ipcMain.removeListener('pos:struk-preview-tutup', onTutup);
                winCetak.removeListener('closed', onTertutup);
            };
            const onCetak = (ev) => {
                if (!ev.sender || ev.sender.id !== wcId) return; // sinyal dari jendela pratinjau LAIN -- abaikan
                bersihkan();
                winCetak.webContents.print({ silent: true, printBackground: true }, (sukses, alasanGagal) => {
                    resolve(sukses ? { ok: true } : { ok: false, pesan: alasanGagal || 'Gagal mencetak (printer default belum diatur di Windows?).' });
                    if (!winCetak.isDestroyed()) winCetak.destroy();
                });
            };
            const onTutup = (ev) => {
                if (!ev.sender || ev.sender.id !== wcId) return;
                bersihkan();
                resolve({ ok: false, pesan: 'Dibatalkan.' });
                if (!winCetak.isDestroyed()) winCetak.destroy();
            };
            const onTertutup = () => {
                bersihkan();
                resolve({ ok: false, pesan: 'Dibatalkan.' });
            };
            ipcMain.on('pos:struk-preview-cetak', onCetak);
            ipcMain.on('pos:struk-preview-tutup', onTutup);
            winCetak.once('closed', onTertutup);
        });
        return hasil;
    } catch (e) {
        return { ok: false, pesan: 'Gagal menyiapkan pratinjau struk: ' + (e && e.message ? e.message : e) };
    } finally {
        if (winCetak && !winCetak.isDestroyed()) winCetak.destroy();
    }
});

/**
 * Bangun halaman pratinjau Cetak Price Tag/POP LENGKAP DENGAN toolbar "Cetak"/"Tutup" sendiri --
 * pola SAMA PERSIS {@link halamanPratinjauStruk} (lihat JavaDoc di sana soal alasan toolbar sendiri,
 * bukan dialog print native langsung). Bedanya di sini {@code isi} SUDAH berupa dokumen cetak PENUH
 * (lembar A2/A4/A5 lengkap dgn tag-tag di dalamnya, termasuk SVG barcode yg sudah di-render renderer
 * via JsBarcode SEBELUM dikirim ke sini) -- proses utama tidak perlu tahu apa pun soal produk/barcode,
 * murni membungkusnya dgn toolbar + memicu cetak native saat diminta.
 * @param {string} isi HTML lengkap lembar price tag (sudah termasuk {@code <style>} tata-letak sendiri).
 * @return {string} halaman HTML lengkap siap dimuat via data URL.
 */
function halamanPratinjauPriceTag(isi) {
    return '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Pratinjau Price Tag</title><style>'
        + 'html,body{margin:0;height:100%;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#525659;}'
        + 'body{display:flex;flex-direction:column;}'
        + '.pv-scroll{flex:1;overflow:auto;padding:16px;box-sizing:border-box;}'
        + '.pv-toolbar{flex-shrink:0;display:flex;gap:10px;padding:12px 16px;background:#fff;border-top:1px solid #e2e8f0;}'
        + '.pv-toolbar button{flex:1;padding:12px;border-radius:8px;border:none;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;}'
        + '.pv-btn-cetak{background:#2563eb;color:#fff;}.pv-btn-cetak:hover{background:#1d4ed8;}'
        + '.pv-btn-tutup{background:#e2e8f0;color:#1e293b;}.pv-btn-tutup:hover{background:#cbd5e1;}'
        + '@media print{.pv-toolbar{display:none !important;}.pv-scroll{padding:0;overflow:visible;}}'
        + '</style></head><body>'
        + '<div class="pv-scroll">' + isi + '</div>'
        + '<div class="pv-toolbar">'
        + '<button class="pv-btn-tutup" id="btnTutup">Tutup</button>'
        + '<button class="pv-btn-cetak" id="btnCetak">\u{1F5A8}️ Cetak</button>'
        + '</div>'
        + '<script>'
        + "document.getElementById('btnCetak').addEventListener('click', () => window.cetakPreviewAPI.cetak());"
        + "document.getElementById('btnTutup').addEventListener('click', () => window.cetakPreviewAPI.tutup());"
        + '</script></body></html>';
}

/**
 * Cetak Price Tag/POP DENGAN pratinjau -- pola SAMA PERSIS {@code pos:cetak-struk-preview} (lihat
 * JavaDoc di sana), BEDA HANYA di titik cetak akhir: {@code webContents.print({silent:false})} (BUKAN
 * {@code silent:true} spt struk) krn kasir WAJIB memilih printer dokumen biasa + ukuran kertas A2/A4/
 * A5 yg sesuai tiap kali -- tidak seperti struk yg selalu ke printer thermal default yang sama.
 * @param {{isi:string}} payload lihat {@link halamanPratinjauPriceTag}.
 * @return {Promise<{ok:boolean, pesan?:string}>}
 */
ipcMain.handle('pos:cetak-pricetag-preview', async (event, payload) => {
    const isi = (payload && payload.isi) || '';
    if (!isi) return { ok: false, pesan: 'Tidak ada label untuk dicetak -- pilih minimal satu produk.' };
    let winCetak = null;
    try {
        winCetak = new BrowserWindow({
            width: 900,
            height: 720,
            title: 'Pratinjau Price Tag',
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                preload: path.join(__dirname, 'preload-pricetag-preview.js')
            }
        });
        await winCetak.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(halamanPratinjauPriceTag(isi)));

        const hasil = await new Promise((resolve) => {
            const wcId = winCetak.webContents.id;
            const bersihkan = () => {
                ipcMain.removeListener('pos:pricetag-preview-cetak', onCetak);
                ipcMain.removeListener('pos:pricetag-preview-tutup', onTutup);
                winCetak.removeListener('closed', onTertutup);
            };
            const onCetak = (ev) => {
                if (!ev.sender || ev.sender.id !== wcId) return;
                bersihkan();
                winCetak.webContents.print({ silent: false, printBackground: true }, (sukses, alasanGagal) => {
                    resolve(sukses ? { ok: true } : { ok: false, pesan: alasanGagal || 'Dibatalkan.' });
                    if (!winCetak.isDestroyed()) winCetak.destroy();
                });
            };
            const onTutup = (ev) => {
                if (!ev.sender || ev.sender.id !== wcId) return;
                bersihkan();
                resolve({ ok: false, pesan: 'Dibatalkan.' });
                if (!winCetak.isDestroyed()) winCetak.destroy();
            };
            const onTertutup = () => {
                bersihkan();
                resolve({ ok: false, pesan: 'Dibatalkan.' });
            };
            ipcMain.on('pos:pricetag-preview-cetak', onCetak);
            ipcMain.on('pos:pricetag-preview-tutup', onTutup);
            winCetak.once('closed', onTertutup);
        });
        return hasil;
    } catch (e) {
        return { ok: false, pesan: 'Gagal menyiapkan pratinjau price tag: ' + (e && e.message ? e.message : e) };
    } finally {
        if (winCetak && !winCetak.isDestroyed()) winCetak.destroy();
    }
});

/**
 * Perintah "kick" ESC/POS standar industri (RawPrinterHelper, teknik P/Invoke winspool.drv yg sama
 * dgn KB322091 Microsoft) dibungkus PowerShell -- lihat JavaDoc {@link bukaLaciKasir} untuk alasan
 * pendekatan ini (bukan dependency npm native baru) dan cara kerjanya.
 */
const PS_SCRIPT_BUKA_LACI = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelperLaci {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "AIS POS - Buka Laci Kasir";
        di.pDataType = "RAW";
        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) return false;
        try {
            if (!StartDocPrinter(hPrinter, 1, di)) return false;
            try {
                if (!StartPagePrinter(hPrinter)) return false;
                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                int dwWritten;
                bool ok = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
                EndPagePrinter(hPrinter);
                return ok;
            } finally { EndDocPrinter(hPrinter); }
        } finally { ClosePrinter(hPrinter); }
    }
}
"@
$printerName = (New-Object System.Drawing.Printing.PrinterSettings).PrinterName
if ([string]::IsNullOrEmpty($printerName)) { Write-Output "GAGAL:Printer default belum diatur di Windows."; exit 0 }
$bytes = '__BYTE_HEX__'.Split(',') | ForEach-Object { [Convert]::ToByte($_, 16) }
$ok = [RawPrinterHelperLaci]::SendBytesToPrinter($printerName, $bytes)
if ($ok) { Write-Output "OK:$printerName" } else { Write-Output "GAGAL:Windows menolak mengirim perintah ke printer $printerName." }
`;

/**
 * Buka Laci Kasir (cash drawer) yang terhubung via kabel RJ11 ke port "Cash Drawer"/"DK" pada
 * printer struk thermal -- perangkat kelas kasir Indonesia umumnya begitu (mis. seri Blueprint
 * BP-ECO58D/BP-Q58D/BP-ECO80D). Tidak ada API Electron level-tinggi untuk ini -- {@code
 * webContents.print()} (dipakai {@code pos:cetak-struk-diam} di atas) cuma bisa mengirim HALAMAN
 * TERENDER, bukan byte mentah ke printer.
 *
 * <p><b>Pendekatan: PowerShell RawPrinterHelper</b> (P/Invoke {@code winspool.drv}, teknik standar
 * Microsoft KB322091), dijalankan sbg proses child dari sini -- SENGAJA bukan dependency npm native
 * baru (mis. paket {@code printer}/{@code escpos}) yang butuh toolchain kompilasi C++ terpasang di
 * mesin developer/CI dan berisiko gagal build tanpa bisa diuji lebih dulu di lingkungan ini.
 * PowerShell (bawaan Windows) + {@code Add-Type} meng-compile C# inline saat runtime, tidak perlu
 * dependency tambahan sama sekali.</p>
 *
 * <p><b>Perintah "kick" ESC/POS</b>: {@code ESC p m t1 t2} -- default {@code 0x1B 0x70 0x00 0x19
 * 0xFA} (pin 2 konektor RJ11, skema paling umum). Sudah diuji SECARA MEKANIS di lingkungan
 * pengembangan (compile C# sukses, panggilan WinSpool RAW berhasil ditulis ke printer default) --
 * BELUM bisa diverifikasi memicu laci fisik sungguhan (perlu printer+laci nyata yang tidak tersedia
 * di lingkungan ini). Kalau laci tidak terbuka di lapangan, coba varian pin 5 ({@code 0x1B 0x70 0x01
 * 0x19 0xFA}) lewat {@code payload.pinAlternatif:true}.</p>
 *
 * <p>Target SELALU printer default OS (sama dgn {@code pos:cetak-struk-diam}) -- laci kasir secara
 * fisik selalu tersambung ke printer struk yang sama, jadi tidak ada pengaturan printer terpisah yang
 * perlu diekspos ke kasir.</p>
 *
 * @param {{pinAlternatif?:boolean}} payload
 * @return {Promise<{ok:boolean, pesan?:string, detailTeknis?:string}>} {@code detailTeknis} SELALU
 *         diisi (byte hex + nama printer target + stdout/stderr mentah) -- dipakai pemanggil
 *         (pos-renderer.js) sbg field {@code detail} saat mencatat percobaan ke Log Error, supaya
 *         admin pusat yg memeriksa dari jauh (lihat {@code errorLogKirim} server) tahu PERSIS apa yg
 *         sudah dicoba di mesin ini tanpa perlu bertanya balik ke kasir.
 */
ipcMain.handle('pos:buka-laci-kasir', (event, payload) => {
    const byteHex = (payload && payload.pinAlternatif) ? '1B,70,01,19,FA' : '1B,70,00,19,FA';
    const script = PS_SCRIPT_BUKA_LACI.replace('__BYTE_HEX__', byteHex);
    return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
            { timeout: 10000, windowsHide: true }, (error, stdout, stderr) => {
                const out = (stdout || '').trim();
                const detailTeknis = 'byteHex=' + byteHex + ' stdout="' + out + '" stderr="' + (stderr || '').trim() + '"'
                    + (error ? (' execError="' + error.message + '"') : '');
                if (error && !out) {
                    resolve({ ok: false, pesan: 'Gagal menjalankan perintah buka laci: ' + ((stderr || '').trim() || error.message), detailTeknis: detailTeknis });
                    return;
                }
                if (out.indexOf('OK:') === 0) {
                    resolve({ ok: true, pesan: 'Perintah buka laci terkirim ke printer "' + out.slice(3) + '".', detailTeknis: detailTeknis });
                } else {
                    resolve({ ok: false, pesan: out.indexOf('GAGAL:') === 0 ? out.slice(6) : ('Gagal membuka laci: ' + (out || 'tidak ada respons.')), detailTeknis: detailTeknis });
                }
            });
    });
});

/**
 * Relay pesan Kasir (pos.html) <-> Layar Pelanggan lokal (customer.html) -- proses utama sebagai
 * "meja perantara" satu-satunya, konsisten dgn seluruh arsitektur aplikasi ini (renderer TIDAK PERNAH
 * bicara langsung ke renderer lain). Pesan {@code tipe:'keranjang'} disimpan sbg
 * {@link #layarPelangganStateTerakhir} (utk push otomatis saat jendela pelanggan reconnect, lihat
 * JavaDoc {@link #bukaLayarPelangganLokal}); {@code tipe:'reset'} menghapus cache itu.
 */
ipcMain.handle('pos:layar-pelanggan-buka', () => bukaLayarPelangganLokal());
ipcMain.on('pos:layar-pelanggan-tutup', () => tutupLayarPelangganLokal());
ipcMain.handle('pos:layar-pelanggan-status', () => ({
    terbuka: !!(layarPelangganWindow && !layarPelangganWindow.isDestroyed()),
    adaMonitorKedua: screen.getAllDisplays().length > 1
}));
ipcMain.on('pos:layar-pelanggan-kirim', (event, payload) => {
    if (payload && payload.tipe === 'keranjang') layarPelangganStateTerakhir = payload;
    if (payload && payload.tipe === 'reset') layarPelangganStateTerakhir = null;
    if (layarPelangganWindow && !layarPelangganWindow.isDestroyed()) {
        layarPelangganWindow.webContents.send('pos:layar-pelanggan-pesan', payload);
    }
});
ipcMain.on('pos:layar-pelanggan-dari-pelanggan', (event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pos:layar-pelanggan-dari-pelanggan', payload);
    }
});

/**
 * Handler tombol "Update Sistem" (lihat blok "Update aplikasi (electron-updater)" di atas utk
 * penjelasan arsitektur+konsekuensi operasional lengkap). {@code pos:update-cek} MEMICU pemeriksaan
 * (hasilnya datang lewat event {@code pos:update-status}, BUKAN lewat return value invoke ini --
 * pola sama dgn Layar Pelanggan: status berjalan dikabari via event, invoke cuma memicu aksi).
 */
ipcMain.handle('pos:update-versi-saat-ini', () => app.getVersion());
ipcMain.handle('pos:update-cek', async () => {
    // TIDAK butuh readConfig()/cfg server AIS -- provider GitHub sama utk semua instalasi, sudah
    // dibakukan saat build lewat app-update.yml (lihat blok "Update aplikasi" di atas), beda dari
    // percobaan provider "generic" sebelumnya yg feed-nya per-instalasi.
    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (e) {
        return { ok: false, pesan: pesanDariErrorUpdate(e) };
    }
});
ipcMain.handle('pos:update-unduh', async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (e) {
        return { ok: false, pesan: pesanDariErrorUpdate(e) };
    }
});
/** Restart aplikasi + jalankan installer NSIS yang sudah terunduh -- HANYA dipanggil setelah event {@code {tipe:'siap'}} + konfirmasi eksplisit kasir di UI. */
ipcMain.on('pos:update-instal', () => { autoUpdater.quitAndInstall(false, true); });
/**
 * Fitur "Update Otomatis" (mirip Windows Update) -- baca/simpan preferensi apakah popup tawaran
 * update boleh dilewati (ditanya sekali lalu diingat) supaya update berikutnya langsung diunduh
 * sendiri di latar tanpa menanyai kasir lagi, dan HANYA restart/instal yang tetap butuh konfirmasi
 * eksplisit (lihat {@link #bacaPreferensiUpdate}/{@link #simpanPreferensiUpdate} di atas).
 */
ipcMain.handle('pos:update-preferensi-baca', () => bacaPreferensiUpdate());
ipcMain.handle('pos:update-preferensi-set', (event, otomatis) => simpanPreferensiUpdate(!!otomatis));

/**
 * Membuka tautan di BROWSER SISTEM (Chrome/Edge/dst. bawaan Windows), BUKAN menavigasikan jendela
 * Electron manapun ke sana -- dipakai tautan di dalam catatan rilis Update Sistem (mis. "Full
 * Changelog" dari GitHub, yg dirender sbg HTML sungguhan lewat innerHTML di renderer, lihat JavaDoc
 * pos-renderer.js). Dibatasi HANYA {@code https://} (menolak {@code file://}/{@code javascript:}/
 * skema custom lain) -- lapis pertahanan tambahan drpd sekadar mengandalkan validasi renderer, krn
 * konten link berasal dari luar aplikasi ini (deskripsi rilis GitHub).
 */
ipcMain.on('pos:buka-link-eksternal', (event, url) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle('pos:ringkasan', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'ringkasan', {});
    if (hasil.ok) {
        localDb.simpanCache('ringkasan', hasil.data);
        return { ok: true, data: hasil.data, fromCache: false };
    }
    if (hasil.offline) {
        const cache = localDb.bacaCache('ringkasan');
        if (cache) return { ok: true, data: cache.data, fromCache: true, cachedAt: cache.disimpanPada };
        return { ok: false, pesan: 'Tidak ada koneksi dan belum ada data ringkasan tersimpan.' };
    }
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Rincian 1 transaksi (header+item) utk tombol "Cetak Struk" pada baris riwayat di layar Ringkasan
 * (lihat {@code struk.js}) -- lihat JavaDoc server {@code PosApi.prosesDetailTransaksi}. SENGAJA TIDAK
 * punya fallback cache offline spt katalog/ringkasan -- ini dipakai utk mencetak ULANG struk transaksi
 * LAMA yg id-nya datang dari daftar riwayat yg sendiri sudah butuh koneksi utk dimuat, jadi tak ada
 * skenario realistis "riwayat tampil tapi detailnya harus offline".
 */
ipcMain.handle('pos:detail-transaksi', async (event, payload) => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'detail_transaksi', payload || {});
    if (hasil.ok) return { ok: true, data: hasil.data };
    if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- cetak struk transaksi lama butuh koneksi aktif.' };
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Dasbor "Ringkasan" 4 tab (Umum/Keuangan/Produk/Pelanggan) -- lihat JavaDoc lengkap tiap aksi di
 * server (`PosApi.prosesDashboardUmum` dst). SENGAJA TIDAK punya fallback cache offline spt katalog
 * -- ini data analitik yg WAJIB terkini (angka basi berisiko menyesatkan keputusan bisnis), beda
 * dari katalog/harga yg memang boleh sedikit basi demi tetap bisa jualan saat offline.
 */
function handlerDashboard(action) {
    return async (event, payload) => {
        const cfg = readConfig();
        if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
        const hasil = await panggilPosApi(cfg, action, payload || {});
        if (hasil.ok) return { ok: true, data: hasil.data };
        if (hasil.offline) return { ok: false, offline: true, pesan: 'Tidak ada koneksi -- dasbor butuh data terkini, tidak bisa memakai cache lama.' };
        return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
    };
}
ipcMain.handle('pos:dashboard-umum', handlerDashboard('dashboard_umum'));
ipcMain.handle('pos:dashboard-keuangan', handlerDashboard('dashboard_keuangan'));
ipcMain.handle('pos:dashboard-produk', handlerDashboard('dashboard_produk'));
ipcMain.handle('pos:dashboard-pelanggan', handlerDashboard('dashboard_pelanggan'));
ipcMain.handle('pos:dashboard-peringkat-mitra', handlerDashboard('peringkat_mitra'));
ipcMain.handle('pos:dashboard-resep-hpp', handlerDashboard('resep_hpp_margin'));
ipcMain.handle('pos:dashboard-ramalan', handlerDashboard('ramalan_penjualan'));
ipcMain.handle('pos:dashboard-promo-cashback', handlerDashboard('monitor_promo_cashback'));
ipcMain.handle('pos:dashboard-kepatuhan', handlerDashboard('kepatuhan_operasional'));
ipcMain.handle('pos:layani-transaksi', handlerDashboard('layani_transaksi'));
ipcMain.handle('pos:layani-semua-transaksi', handlerDashboard('layani_semua_transaksi'));

/**
 * Layar "Report Order/Sesi/Payment" (spesifikasi klien "Flow Kasir") -- 3 aksi laporan transaksi
 * berbasis {@code koperasi.pembelian}/{@code pembelian_anggota_koperasi}/{@code sesi_kas_kasir}, lihat
 * JavaDoc lengkap {@code PosApi.daftarOrderDenganSesi}/{@code prosesLaporanSesiList} server. SAMA
 * pola dgn dasbor lain di atas (WAJIB data terkini, tidak ada cache offline).
 */
ipcMain.handle('pos:laporan-order-list', handlerDashboard('laporan_order_list'));
ipcMain.handle('pos:laporan-sesi-list', handlerDashboard('laporan_sesi_list'));
ipcMain.handle('pos:laporan-payment-list', handlerDashboard('laporan_payment_list'));

/**
 * Dasbor statistik Laporan Transaksi (gap-closure paritas Produk/Anggota) -- BEDA dari
 * {@code handlerDashboard} lain (yg menolak total saat offline, dasbor analitik butuh data terkini):
 * di sini kegagalan jaringan JATUH KE cache_referensi lokal (disimpan otomatis tiap kali berhasil
 * online) supaya KPI ringkas tetap terlihat (walau berpotensi basi) alih-alih layar kosong -- sesuai
 * permintaan "fungsi singkronkan (otomatis dan manual) seperti di menu Produk".
 */
ipcMain.handle('pos:transaksi-statistik', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'transaksi_statistik', {});
    if (hasil.ok) {
        localDb.simpanCache('transaksi_statistik', hasil.data);
        return { ok: true, data: hasil.data };
    }
    if (hasil.offline) {
        const cache = localDb.bacaCache('transaksi_statistik');
        if (cache) return { ok: true, data: cache.data, dariCache: true, disimpanPada: cache.disimpanPada };
        return { ok: false, offline: true, pesan: 'Tidak ada koneksi dan belum ada cache lokal.' };
    }
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
});

/**
 * Layar "Stok Opname" (Desktop) -- proksi tipis ke 3 aksi PosApi yg SUDAH ADA & sudah dipakai app
 * Android "Stok Opname" terpisah (lihat JavaDoc server {@code KantinHelper.soProdukScan}/{@code
 * soSimpan}/{@code soRingkasan}): scan/ketik barcode -> lihat stok sistem -> masukkan stok fisik ->
 * simpan (otomatis mencatat StokOpname + recompute stok produk, TANPA approval terpisah, SAMA
 * perilakunya dgn JSP/ZK "SO by Scan"). {@code so_simpan} DIGERBANG supervisor-only di server --
 * {@code so_produk_scan}/{@code so_ringkasan} boleh dipanggil siapa saja yg login (murni baca).
 */
ipcMain.handle('pos:stokopname-scan', handlerDashboard('so_produk_scan'));
ipcMain.handle('pos:stokopname-simpan', handlerDashboard('so_simpan'));
ipcMain.handle('pos:stokopname-ringkasan', handlerDashboard('so_ringkasan'));
/**
 * Daftar catatan Stok Opname HARI INI (rincian, gap-closure) -- lihat JavaDoc server
 * {@code KantinHelper.soRiwayat}. Melengkapi kartu ringkasan di atas (yang sudah membaca dari server)
 * dengan RINCIAN baris per baris, juga dari server -- sebelumnya layar ini hanya menampilkan
 * riwayatLokal (in-memory sesi layar, kosong lagi begitu dimuat ulang), membuat kartu ringkasan &
 * daftar rincian tampak tidak sinkron (angka ada, daftar kosong).
 */
ipcMain.handle('pos:stokopname-riwayat', handlerDashboard('so_riwayat'));
/** Dashboard "Mutasi Barang" (gap-closure, padanan JSP stok/mutasi_stok.jsp) -- lihat JavaDoc server {@code KantinHelper.stokDashboard}. WAJIB data terkini (sama pola dgn dasbor lain di atas), tidak ada cache offline. */
ipcMain.handle('pos:stokopname-dashboard', handlerDashboard('stok_dashboard'));

/**
 * Layar "Kulakan" (Harga Beli / Pengadaan Produk, Desktop) -- proksi tipis ke {@code kulakan_list}/
 * {@code kulakan_simpan} (lihat JavaDoc server {@code KantinHelper.kulakanList}/{@code kulakanSimpan}):
 * catat barang masuk dari pemasok, stok &amp; harga beli produk otomatis di-recompute, rumus IDENTIK
 * dgn layar ZK "Pengadaan / Kulakan (Barang Masuk)". Pencarian produk (barcode/kode) memakai ULANG
 * {@code pos:stokopname-scan} di atas -- tidak perlu aksi baru, produk yg sama dicari dgn cara yg
 * sama. {@code kulakan_simpan} DIGERBANG supervisor-only di server; {@code kulakan_list} boleh dibaca
 * siapa saja yg login.
 */
ipcMain.handle('pos:kulakan-list', handlerDashboard('kulakan_list'));
ipcMain.handle('pos:kulakan-simpan', handlerDashboard('kulakan_simpan'));
ipcMain.handle('pos:retur-penjualan-list', handlerDashboard('retur_penjualan_list'));
ipcMain.handle('pos:retur-penjualan-simpan', handlerDashboard('retur_penjualan_simpan'));
ipcMain.handle('pos:retur-penjualan-ubah', handlerDashboard('retur_penjualan_ubah'));
ipcMain.handle('pos:retur-penjualan-hapus', handlerDashboard('retur_penjualan_hapus'));
ipcMain.handle('pos:batalkan-transaksi', handlerDashboard('batalkan_transaksi'));
ipcMain.handle('pos:ebisnis-menu-tree', handlerDashboard('ebisnis_menu_tree'));

/** Layar "Produk" -- daftar produk utk Cetak Price Tag/POP (gap-closure), lihat JavaDoc server {@code KantinHelper.priceTagListProduk}. Barcode/tata-letak label dibangun di renderer, ini murni sumber datanya. */
ipcMain.handle('pos:pricetag-list-produk', handlerDashboard('price_tag_list_produk'));

/**
 * Layar Kasir (Fase 4) -- evaluasi Aturan Diskon otomatis utk isi keranjang saat ini, lihat JavaDoc
 * server {@code KantinHelper.diskonEvaluasi}. Dipanggil ULANG dari renderer setiap kali keranjang
 * berubah (tambah/qty/hapus/pilih member) -- MURNI baca/hitung, boleh dipanggil siapa saja yg login.
 * Kegagalan (offline/error) SENGAJA tidak diperlakukan sbg blocker checkout -- renderer menganggap
 * "tidak ada diskon" dan tetap membiarkan kasir menuntaskan transaksi (lihat pola {@code handlerDashboard}
 * di atas, {@code ok:false} dikembalikan apa adanya, bukan dilempar sbg exception).
 */
ipcMain.handle('pos:diskon-evaluasi', handlerDashboard('diskon_evaluasi'));

/**
 * Katalog "Laporan-Laporan e-Kantin" -- SATU perbedaan dari {@code handlerDashboard()} biasa: sebagian
 * kecil item (laporan Akuntansi resmi/ZK, lihat {@code LaporanKatalogData.launchZk}) punya field
 * {@code url} berisi PATH RELATIF server (mis. {@code "/ais/pages/master/kantin/laporan_keuangan.zul?..."}
 * -- {@code Common.ROOT} di server TIDAK menyertakan skema+host, hanya context path). Path relatif itu
 * TIDAK BISA langsung dibuka via {@code shell.openExternal} (yg mensyaratkan URL absolut https://, lihat
 * {@code pos:buka-link-eksternal}) -- di sinilah SATU-SATUNYA tempat path itu digabung dgn
 * {@link buildOriginUrl} (skema+host TANPA context path -- path relatif sudah membawa context path-nya
 * sendiri, lihat JavaDoc {@link buildOriginUrl} soal risiko context path dobel bila salah pakai
 * {@link buildBaseUrl}) menjadi URL absolut yang siap diklik.
 */
ipcMain.handle('pos:laporan-katalog', async () => {
    const cfg = readConfig();
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const hasil = await panggilPosApi(cfg, 'laporan_katalog', {});
    if (!hasil.ok) {
        if (hasil.offline) {
            // Katalog laporan cuma metadata (judul/kategori/url) -- BEDA dari 'laporan_jalankan'/'laporan_pdf'
            // (tetap wajib live, tidak tersentuh perubahan ini) yg benar-benar mengambil ISI laporan dari
            // server. Menampilkan daftar menu laporan yg (mungkin sedikit basi) tetap lebih berguna drpd
            // layar kosong saat offline -- kasir setidaknya tahu laporan apa saja yg ada.
            const cache = localDb.bacaCache('laporan_katalog');
            if (cache) return { ok: true, data: cache.data, fromCache: true, cachedAt: cache.disimpanPada };
            return { ok: false, offline: true, pesan: 'Tidak ada koneksi dan belum ada katalog laporan tersimpan.' };
        }
        return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
    }
    try {
        const origin = buildOriginUrl(cfg);
        const kategori = (hasil.data && hasil.data.kategori) || [];
        kategori.forEach((kat) => {
            (kat.items || []).forEach((it) => {
                if (it.url) it.url = origin + it.url;
            });
        });
    } catch (e) { /* url absolut gagal disusun -- item ZK terkait cukup tak bisa diklik, sisa katalog tetap tampil */ }
    // Disimpan SETELAH url diabsolutkan -- baris cache membawa url siap-klik apa adanya, konsisten dgn
    // pola gambar produk (unduhCacheGambarProduk menyimpan path file:// LOKAL, bukan url server mentah).
    localDb.simpanCache('laporan_katalog', hasil.data);
    return { ok: true, data: hasil.data, fromCache: false };
});
ipcMain.handle('pos:laporan-jalankan', handlerDashboard('laporan_jalankan'));
ipcMain.handle('pos:laporan-pdf', handlerDashboard('laporan_pdf'));

// Fitur "Alih Bahasa" (Desktop) -- ambil kamus terjemahan utk 1 bahasa dari server (Common.getBahasaConfig).
ipcMain.handle('pos:i18n-kamus', handlerDashboard('i18n_kamus'));

/**
 * Menyimpan teks (CSV) ke berkas pilihan pengguna -- dipakai tombol "Unduh CSV" di tiap tabel dasbor.
 * Dialog simpan native (bukan otomatis ke folder Download) supaya kasir/admin sadar & bisa memilih
 * lokasi -- konsisten dgn prinsip "aksi yg menulis ke disk pengguna wajib dialog eksplisit".
 */
ipcMain.handle('pos:simpan-file', async (event, opsi) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const hasil = await dialog.showSaveDialog(win, {
        title: 'Simpan Berkas',
        defaultPath: opsi && opsi.namaBerkas ? opsi.namaBerkas : 'unduhan.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (hasil.canceled || !hasil.filePath) return { ok: false, dibatalkan: true };
    try {
        fs.writeFileSync(hasil.filePath, (opsi && opsi.isi) || '', 'utf8');
        return { ok: true, path: hasil.filePath };
    } catch (e) {
        return { ok: false, pesan: 'Gagal menyimpan berkas: ' + (e && e.message ? e.message : e) };
    }
});

/**
 * Menyimpan PDF (Fitur Laporan) ke berkas pilihan pengguna -- padanan {@code pos:simpan-file} tapi utk
 * konten BINER (base64, bukan teks UTF-8) supaya byte PDF tidak rusak saat ditulis.
 */
ipcMain.handle('pos:laporan-simpan-pdf', async (event, opsi) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const hasil = await dialog.showSaveDialog(win, {
        title: 'Simpan PDF',
        defaultPath: opsi && opsi.namaBerkas ? opsi.namaBerkas : 'laporan.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (hasil.canceled || !hasil.filePath) return { ok: false, dibatalkan: true };
    try {
        fs.writeFileSync(hasil.filePath, Buffer.from((opsi && opsi.pdfBase64) || '', 'base64'));
        return { ok: true, path: hasil.filePath };
    } catch (e) {
        return { ok: false, pesan: 'Gagal menyimpan PDF: ' + (e && e.message ? e.message : e) };
    }
});

/** Batas tunggu kasir utk hasil sinkron server sebelum "Bayar"/"Tahan" dibalas duluan (lihat JavaDoc
 * {@link #prosesTransaksiPosOfflineFirst}) -- BUKAN timeout jaringan (itu tetap 15 detik di {@link
 * #panggilPosApi}), murni batas SEBERAPA LAMA UI boleh menunggu sebelum kasir dapat konfirmasi. */
const BATAS_TUNGGU_SINKRON_TRANSAKSI_MS = 3000;

/**
 * Menulis SATU transaksi (checkout/simpan draft) ke antrean lokal PENDING dulu (SELALU, sebelum
 * mencoba jaringan sama sekali -- prinsip "local-first" yg sama dipertahankan dari
 * ais_pos_offline.js/local-db.js), lalu MENCOBA mengirimnya ke server. Dipakai handler
 * {@code pos:bayar}/{@code pos:draft-bayar} (jadi berlaku utk keduanya, "Bayar" MAUPUN "Tahan").
 *
 * <p><b>Gap-closure "klik Bayar lama sekali lalu macet" (RAM 8GB, WiFi toko lambat/padat)</b> --
 * SEBELUMNYA method ini `await` percobaan kirim ke server SAMPAI SELESAI (bisa sampai {@link
 * #panggilPosApi}'s timeout 15 detik) sebelum membalas apa pun ke kasir -- baris lokal SUDAH aman
 * tersimpan sejak awal, tapi tombol "Bayar" tetap macet menunggu jaringan yg lambat, PERSIS gejala yg
 * dilaporkan. Sekarang percobaan kirim dibatasi {@link #BATAS_TUNGGU_SINKRON_TRANSAKSI_MS}: kalau
 * server sempat menjawab dalam batas itu (kasus normal, jaringan sehat), kasir tetap dapat konfirmasi
 * "Tersinkron" seketika spt sebelumnya -- TAPI kalau melewati batas, kasir SEGERA dibalas "tersimpan
 * lokal, akan disinkron di latar belakang" TANPA menunggu jaringan lagi, sementara percobaan kirim yg
 * sudah berjalan tetap dibiarkan lanjut sendiri di latar belakang (menandai hasil akhirnya ke
 * local-db begitu selesai, kapan pun itu) -- kasir tidak pernah lagi menunggu jaringan.</p>
 *
 * @param {{host:string, contextPath:string, https:boolean}|null} cfg
 * @param {string} aksi {@code "bayar"} atau {@code "draft_bayar"}.
 * @param {object} payload payload transaksi lengkap, WAJIB berisi {@code clientTrxId}.
 * @return {Promise<{ok:boolean, data?:object, offline?:boolean, pesan?:string, butuhLoginUlang?:boolean}>}
 */
async function prosesTransaksiPosOfflineFirst(cfg, aksi, payload) {
    if (!cfg) return { ok: false, pesan: 'Alamat server belum diatur.' };
    const clientTrxId = payload && payload.clientTrxId;
    if (!clientTrxId) return { ok: false, pesan: 'clientTrxId wajib disertakan pada payload transaksi.' };

    localDb.simpanBaru({
        clientTrxId: clientTrxId,
        tokoId: payload.tokoId,
        kasir: payload.kasir,
        waktu: new Date().toISOString(),
        total: payload.total,
        aksiAsli: aksi,
        payloadAsli: payload
    });

    const percobaanKirim = panggilPosApi(cfg, aksi, payload);
    // Apa pun jalur di bawah yg dipakai (selesai cepat atau lewat batas), SELALU tandai hasil AKHIR
    // percobaan ini ke local-db begitu benar2 selesai -- kalau jalur "selesai cepat" di bawah sudah
    // menanganinya lebih dulu, pemanggilan tandaiSinkron/tandaiGagal di sini idempoten (menimpa nilai
    // yg sama), aman diulang.
    percobaanKirim.then((h) => {
        if (h.ok) localDb.tandaiSinkron(clientTrxId);
        else if (!h.offline) localDb.tandaiGagal(clientTrxId, h.pesan);
    }).catch((e) => localDb.tandaiGagal(clientTrxId, e && e.message ? e.message : String(e)));

    let selesaiDalamBatas = true;
    const hasil = await Promise.race([
        percobaanKirim,
        new Promise((resolve) => setTimeout(() => { selesaiDalamBatas = false; resolve(null); }, BATAS_TUNGGU_SINKRON_TRANSAKSI_MS))
    ]);

    if (!selesaiDalamBatas) {
        return { ok: true, offline: true, pesan: 'Jaringan lambat -- transaksi sudah tersimpan lokal, sedang dikirim ke server di latar belakang.' };
    }
    if (hasil.ok) {
        return { ok: true, data: hasil.data, offline: false };
    }
    if (hasil.offline) {
        return { ok: true, offline: true, pesan: 'Tidak ada koneksi -- transaksi tersimpan lokal, akan disinkron otomatis begitu koneksi pulih.' };
    }
    // Ditolak SERVER (mis. stok tak cukup/saldo member kurang) -- BUKAN soal jaringan. Baris TETAP
    // PENDING (bukan dihapus) supaya kasir bisa perbaiki lalu coba lagi -- lihat JavaDoc
    // local-db.js:tandaiGagal soal kenapa status tak berubah jadi status akhir baru.
    return { ok: false, pesan: hasil.pesan, butuhLoginUlang: hasil.butuhLoginUlang };
}

/**
 * Mengirim ULANG seluruh transaksi yang masih {@code PENDING} ke server, satu per satu, berhenti
 * SEGERA begitu satu percobaan gagal karena OFFLINE (bukan ditolak server) -- tidak ada gunanya
 * mencoba sisanya satu-satu kalau memang tidak ada internet sama sekali saat ini. Dipanggil dari
 * tombol "Sinkronkan Sekarang" di pos.html (lihat {@code pos:sync-now}).
 *
 * @param {{host:string, contextPath:string, https:boolean}|null} cfg
 * @return {Promise<{disinkron:number, gagal:number, totalPending:number, pesan?:string}>}
 */
async function sinkronkanTransaksiPending(cfg) {
    if (!cfg) return { disinkron: 0, gagal: 0, totalPending: 0, pesan: 'Alamat server belum diatur.' };
    const pending = localDb.listPending();
    let disinkron = 0;
    let gagal = 0;
    for (let i = 0; i < pending.length; i++) {
        const trx = pending[i];
        const aksi = trx.aksiAsli || 'bayar';
        const payloadAsli = trx.payloadAsli || trx;
        const hasil = await panggilPosApi(cfg, aksi, payloadAsli);
        if (hasil.ok) {
            localDb.tandaiSinkron(trx.clientTrxId);
            disinkron++;
        } else if (hasil.offline) {
            break;
        } else {
            localDb.tandaiGagal(trx.clientTrxId, hasil.pesan);
            gagal++;
        }
    }
    return { disinkron: disinkron, gagal: gagal, totalPending: pending.length };
}

// ==== Penangkap error global (main process) ====
// Menangkap error yg TIDAK tertangkap try/catch manapun di kode -- tanpa ini, Electron akan
// menutup aplikasi secara diam-diam saat exception semacam ini terjadi (persis gejala yg dilaporkan
// pengguna: "aplikasi tiba-tiba keluar tanpa pesan apa pun"). Dicatat ke error.log DAN ditampilkan
// sbg dialog supaya pengguna awam tahu ada yg salah, bukan menduga aplikasinya rusak tanpa sebab.
process.on('uncaughtException', (err) => {
    tulisLog('uncaughtException', err);
    catatErrorLogAman({ sumber: 'main:uncaughtException', pesan: err && err.message ? err.message : String(err), detail: err && err.stack, layar: 'main-process' });
    try {
        dialog.showErrorBox('Terjadi Kesalahan Tak Terduga',
            'Aplikasi mengalami kesalahan internal dan mungkin perlu ditutup ulang.\n\n'
            + (err && err.message ? err.message : String(err))
            + '\n\nRincian teknis lengkap sudah dicatat ke:\n' + LOG_PATH);
    } catch (e) { /* menampilkan dialog gagal tak boleh menimbulkan error baru */ }
});
process.on('unhandledRejection', (reason) => {
    tulisLog('unhandledRejection', reason);
    catatErrorLogAman({ sumber: 'main:unhandledRejection', pesan: reason && reason.message ? reason.message : String(reason), detail: reason && reason.stack, layar: 'main-process' });
});

/**
 * Gap-closure "aplikasi sering keluar sendiri saat cetak struk/buka laci" -- {@code uncaughtException}
 * / {@code unhandledRejection} di atas HANYA menangkap error JAVASCRIPT di proses utama, TIDAK
 * menangkap CRASH NATIF proses render/GPU/utility Chromium (mis. driver printer USB thermal yang
 * tidak stabil menjatuhkan proses GPU saat {@code webContents.print()} dipanggil dari jendela cetak
 * tersembunyi {@code winCetak} -- pola dikenal luas di Electron, terutama utk printer struk yang
 * driver-nya jarang diuji dgn Chromium print pipeline). Tanpa handler ini, crash semacam itu TIDAK
 * pernah lewat {@code process.on(...)} di atas sama sekali (beda mekanisme -- native process
 * terminate, bukan JS exception) -- gejalanya PERSIS "aplikasi tiba-tiba tertutup tanpa pesan apa
 * pun", cocok dgn laporan pengguna. {@code app.on('render-process-gone'/'child-process-gone')} adalah
 * API resmi Electron (18+) utk kasus ini, MENGGANTIKAN {@code webContents.on('crashed')} versi lama.
 *
 * Window Kasir utama SENGAJA di-reload otomatis (bukan dibiarkan blank/mati) supaya kasir bisa
 * lanjut kerja tanpa restart aplikasi manual -- jendela cetak tersembunyi ({@code winCetak}) tidak
 * perlu recovery apa pun (sudah sekali pakai & di-destroy di blok {@code finally} pemanggilnya).
 */
app.on('render-process-gone', (event, webContents, details) => {
    tulisLog('render-process-gone', details);
    catatErrorLogAman({ sumber: 'main:render-process-gone', pesan: 'reason=' + details.reason + ' exitCode=' + details.exitCode, detail: JSON.stringify(details), layar: 'render-process' });
    const jendelaUtama = mainWindow && !mainWindow.isDestroyed() && webContents === mainWindow.webContents;
    try {
        dialog.showErrorBox('Layar Aplikasi Berhenti Tak Terduga',
            (jendelaUtama ? 'Layar Kasir utama' : 'Salah satu jendela aplikasi') + ' berhenti bekerja (' + details.reason + '), kemungkinan krn driver printer/perangkat bermasalah.\n\n'
            + 'Aplikasi TETAP BERJALAN, TIDAK ditutup.' + (jendelaUtama ? ' Layar Kasir akan dimuat ulang otomatis.' : '')
            + '\n\nRincian teknis sudah dicatat ke:\n' + LOG_PATH);
    } catch (e) { /* menampilkan dialog gagal tak boleh menimbulkan error baru */ }
    if (jendelaUtama) {
        try { webContents.reload(); } catch (e) { /* ignore -- window mungkin sudah tidak valid sama sekali */ }
    }
});
app.on('child-process-gone', (event, details) => {
    tulisLog('child-process-gone', details);
    catatErrorLogAman({ sumber: 'main:child-process-gone', pesan: 'type=' + details.type + ' reason=' + details.reason, detail: JSON.stringify(details), layar: 'child-process' });
    // Hanya GPU yg diberi tahu ke pengguna (paling sering terjadi saat cetak) -- crash Utility/lainnya
    // biasanya tak berdampak langsung ke kasir & Chromium sudah otomatis me-restart proses itu sendiri.
    if (details.type === 'GPU') {
        try {
            dialog.showErrorBox('Proses Grafis Sistem Berhenti',
                'Proses grafis (GPU) Windows berhenti tak terduga, biasanya terjadi saat mencetak struk/pratinjau.\n\n'
                + 'Aplikasi TETAP BERJALAN -- silakan coba cetak ulang. Jika printer tetap gagal berulang kali, restart aplikasi ini.');
        } catch (e) { /* ignore */ }
    }
});

app.whenReady().then(() => {
    // SQLite diinisialisasi SEKALI di sini, sebelum jendela mana pun dibuka -- seluruh handler IPC
    // di atas mengasumsikan local-db sudah siap saat halaman POS mulai memanggilnya.
    localDb.init(app.getPath('userData'));
    const cfg = readConfig();
    if (cfg) { openLoginWindow(cfg); } else { openSetupWindow(); }
});

app.on('window-all-closed', () => {
    // Windows/Linux: keluar penuh saat semua jendela tertutup (perilaku standar aplikasi desktop
    // biasa, BUKAN pola "tetap hidup di background" ala macOS -- kasir mengharapkan aplikasi benar2
    // berhenti saat ditutup, bukan diam-diam masih berjalan).
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        const cfg = readConfig();
        if (cfg) openLoginWindow(cfg); else openSetupWindow();
    }
});
