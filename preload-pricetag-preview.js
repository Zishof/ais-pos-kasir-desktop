/**
 * preload-pricetag-preview.js -- Jembatan aman utk jendela pratinjau Cetak Price Tag/POP (dibuka via
 * IPC pos:cetak-pricetag-preview, lihat JavaDoc main.js) -- prinsip "akses sekecil mungkin per jendela"
 * sama dgn preload-struk-preview.js. Berkas TERPISAH (bukan dipakai bersama preload-struk-preview.js)
 * krn semantik tombol "Cetak" beda: struk selalu cetak DIAM-DIAM ke printer thermal default, sedangkan
 * Price Tag membuka dialog cetak NATIVE (kasir perlu memilih ukuran kertas A2/A4/A5 & printer dokumen
 * biasa, bukan printer struk) -- menyatukan keduanya lewat channel yang sama berisiko salah perilaku
 * kalau logika berubah di satu sisi tanpa sadar memengaruhi sisi lain.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cetakPreviewAPI', {
    /** Kasir menekan tombol "Cetak" di toolbar pratinjau -- minta proses utama membuka dialog cetak native. */
    cetak: () => ipcRenderer.send('pos:pricetag-preview-cetak'),
    /** Kasir menekan tombol "Tutup" -- minta proses utama menutup jendela pratinjau ini tanpa mencetak. */
    tutup: () => ipcRenderer.send('pos:pricetag-preview-tutup')
});
