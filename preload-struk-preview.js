/**
 * preload-struk-preview.js -- Jembatan aman utk jendela pratinjau struk (dibuka via IPC
 * pos:cetak-struk-preview, lihat JavaDoc main.js) -- prinsip "akses sekecil mungkin per jendela" sama
 * dgn preload-customer.js. Jendela ini HANYA perlu memberi tahu proses utama kapan tombol "Cetak"
 * atau "Tutup" pada toolbar di dalamnya ditekan -- tidak tahu apa-apa soal token/katalog/checkout.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('strukPreviewAPI', {
    /** Kasir menekan tombol "Cetak" di toolbar pratinjau -- minta proses utama mencetak diam-diam ke printer default. */
    cetak: () => ipcRenderer.send('pos:struk-preview-cetak'),
    /** Kasir menekan tombol "Tutup" -- minta proses utama menutup jendela pratinjau ini tanpa mencetak. */
    tutup: () => ipcRenderer.send('pos:struk-preview-tutup')
});
