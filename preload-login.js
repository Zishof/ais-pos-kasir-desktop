/**
 * preload-login.js -- Jembatan aman untuk jendela login LOKAL (login.html). Terpisah dari
 * preload.js (jendela POS utama) dan preload-setup.js (wizard) karena kebutuhan API-nya berbeda:
 * jendela ini HANYA perlu tahu host server (utk ditampilkan sbg konteks) dan memicu proses login,
 * TIDAK perlu (dan tidak boleh) tahu apa-apa soal Layar Pelanggan/SQLite lokal milik jendela utama --
 * prinsip "akses sekecil mungkin sesuai kebutuhan" per jendela, konsisten dengan
 * {@code contextIsolation: true} yang dipakai di seluruh aplikasi ini.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loginAPI', {
    /** @return {Promise<{host:string}|null>} host server tersimpan, dipakai menampilkan konteks "Masuk ke <host>" di layar login. */
    getServerHost: () => ipcRenderer.invoke('login:get-context'),

    /**
     * Mengirim kredensial ke proses utama utk diautentikasi ke server (lihat JavaDoc
     * {@code prosesLoginServer} di main.js). TIDAK ada logika jaringan di renderer ini sama sekali --
     * murni kirim payload, proses utama yang bicara ke server. Sukses TIDAK langsung membuka jendela
     * kasir -- login.html berpindah ke langkah "Sinkronkan Data" dulu (lihat {@link #sinkronkanData}/
     * {@link #selesai}).
     * @param {{username:string, password:string, rememberMe:boolean}} payload
     * @return {Promise<{ok:boolean, pesan?:string}>}
     */
    submit: (payload) => ipcRenderer.invoke('login:submit', payload),

    /** Menutup layar login dan membuka kembali wizard pengaturan alamat server. */
    ubahServer: () => ipcRenderer.send('login:ubah-server'),

    /**
     * Dipanggil OTOMATIS oleh login-renderer.js begitu halaman selesai dimuat -- mencoba login
     * diam-diam pakai kredensial "Ingat Saya" tersimpan (lihat JavaDoc handler {@code login:coba-auto}
     * di main.js). Kalau tidak ada yg tersimpan, balikannya {@code {tried:false}} dan form login
     * manual tampil seperti biasa tanpa jeda.
     * @return {Promise<{tried:boolean, ok?:boolean, pesan?:string, username?:string}>}
     */
    cobaAutoLogin: () => ipcRenderer.invoke('login:coba-auto'),

    /**
     * "Masuk Mode Offline" -- dipanggil saat {@link #cobaAutoLogin} melaporkan server tak terjangkau
     * ({@code offline:true}) TAPI ada hash lokal tersimpan utk akun ini ({@code bisaOfflineLogin:true}).
     * Kata sandi diverifikasi LOKAL di proses utama (lihat JavaDoc handler {@code login:coba-offline}
     * di main.js), TIDAK ada permintaan jaringan sama sekali.
     * @param {{username:string, password:string}} payload
     * @return {Promise<{ok:boolean, pesan?:string}>}
     */
    cobaOfflineLogin: (payload) => ipcRenderer.invoke('login:coba-offline', payload),

    /**
     * Mengunduh katalog+konfigurasi terbaru ke database lokal -- tombol "Sinkronkan Data" yang
     * tampil SETELAH login berhasil (lihat JavaDoc handler {@code login:sinkron-data} di main.js).
     * @return {Promise<{ok:boolean, jumlahProduk?:number, jumlahKategori?:number, pesan?:string}>}
     */
    sinkronkanData: () => ipcRenderer.invoke('login:sinkron-data'),

    /** Melanjutkan ke jendela kasir setelah langkah "Sinkronkan Data" selesai/dilewati. */
    selesai: () => ipcRenderer.invoke('login:selesai'),

    /** Fitur "Alih Bahasa" -- lihat JavaDoc handler {@code login:i18n-kamus} di main.js. */
    i18nKamus: (payload) => ipcRenderer.invoke('login:i18n-kamus', payload)
});
