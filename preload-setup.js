/**
 * preload-setup.js -- Jembatan aman untuk jendela wizard pengaturan (setup.html). Terpisah dari
 * preload.js (jendela POS utama) karena kebutuhan API-nya berbeda sama sekali: wizard ini hanya perlu
 * membaca/menyimpan konfigurasi alamat server, TIDAK perlu (dan tidak boleh) tahu apa-apa soal Layar
 * Pelanggan/IPC lain milik jendela utama -- prinsip "akses sekecil mungkin sesuai kebutuhan" per
 * jendela, konsisten dengan {@code contextIsolation: true} yang dipakai di seluruh aplikasi ini.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupAPI', {
    /** @return {Promise<{host:string,contextPath:string,https:boolean}|null>} konfigurasi tersimpan saat ini, bila ada (dipakai mengisi ulang form saat wizard dibuka utk MENGUBAH pengaturan, bukan pengisian pertama kali). */
    getCurrentConfig: () => ipcRenderer.invoke('setup:get-current'),

    /** Menyimpan konfigurasi baru dan memicu proses utama membuka/memuat ulang jendela POS. */
    saveConfig: (cfg) => ipcRenderer.send('setup:save', cfg),

    /**
     * Menguji apakah konfigurasi (host/contextPath/https) yang sedang diketik bisa dihubungi,
     * TANPA menyimpannya -- dipakai tombol "Tes Koneksi" di setup.html sebelum pengguna menekan
     * "Simpan & Buka Aplikasi". Lihat JavaDoc {@code tesKoneksiServer} di main.js untuk arti field
     * hasil ({@code ok}/{@code status}/{@code durasiMs}/{@code pesan}).
     * @return {Promise<{ok:boolean, status?:number, durasiMs?:number, url:string, pesan?:string}>}
     */
    testConnection: (cfg) => ipcRenderer.invoke('setup:test-connection', cfg),

    /** Fitur "Alih Bahasa" -- lihat JavaDoc handler {@code setup:i18n-kamus} di main.js. */
    i18nKamus: (payload) => ipcRenderer.invoke('setup:i18n-kamus', payload)
});
