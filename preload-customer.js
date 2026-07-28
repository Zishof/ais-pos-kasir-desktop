/**
 * preload-customer.js -- Jembatan aman untuk jendela Layar Pelanggan LOKAL (customer.html, monitor
 * kedua). Terpisah dari preload.js (jendela Kasir) sesuai prinsip "akses sekecil mungkin per jendela"
 * (lihat JavaDoc preload-login.js) -- jendela ini HANYA perlu menerima pesan mirror dari Kasir,
 * mengirim balik hasil PIN, dan memverifikasi PIN. TIDAK tahu apa-apa soal token/katalog/checkout.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('customerAPI', {
    /**
     * Mendaftarkan callback yang dipanggil setiap kali proses utama meneruskan pesan dari jendela
     * Kasir (lihat JavaDoc handler {@code pos:layar-pelanggan-kirim} di main.js) -- termasuk pesan
     * "state terakhir" yang otomatis dikirim ulang begitu jendela ini baru terbuka/reconnect.
     * @param {(payload:object)=>void} callback
     */
    onPesan: (callback) => ipcRenderer.on('pos:layar-pelanggan-pesan', (event, payload) => callback(payload)),

    /**
     * Mengirim balik hasil interaksi pembeli ke jendela Kasir (lewat proses utama) -- SATU-SATUNYA
     * arah komunikasi jendela ini -> Kasir. Dipakai utk {@code {tipe:'pin_hasil', ok, batal?}}.
     * @param {object} payload
     */
    kirimKeKasir: (payload) => ipcRenderer.send('pos:layar-pelanggan-dari-pelanggan', payload),

    /**
     * Memverifikasi PIN yang diketik pembeli LANGSUNG lewat proses utama (yang memegang token
     * PosApi) -- BUKAN fetch() dari jendela ini sendiri (jendela ini tidak pernah punya token).
     * PIN dibandingkan server-side lalu dibuang; jendela Kasir TIDAK PERNAH melihat nilai PIN,
     * hanya hasil {@code ok}/{@code cocok} lewat {@link #kirimKeKasir} setelahnya.
     * @param {{memberId:number, pin:string}} payload
     * @return {Promise<{ok:boolean, cocok?:boolean, offline?:boolean, pesan?:string}>}
     */
    verifikasiPin: (payload) => ipcRenderer.invoke('pos:verifikasi-pin', payload)
});
