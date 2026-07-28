/**
 * struk.js -- Modul BERSAMA (dimuat pos.html/ringkasan.html lewat <script>) yang mencetak struk
 * thermal (mirip 80mm/58mm POS) dari data transaksi, dipakai 2 tempat: tombol "Cetak Struk" di modal
 * sukses checkout layar Kasir (data in-memory, langsung dari keranjang yang barusan dibayar) dan
 * tombol "Cetak Struk" per baris riwayat di layar Ringkasan (data dari {@code posAPI.detailTransaksi},
 * lihat JavaDoc server {@code PosApi.prosesDetailTransaksi}).
 *
 * DESAIN CETAK: HTML struk dibangun di sini (tampilan lebar 300px, monospace, border putus-putus --
 * SENGAJA meniru PERSIS {@code cetak_struk.jsp}/{@code _pos.jsp}'s {@code cetakStruk()} versi web,
 * supaya struk yang keluar dari kasir dan dari toko konsisten), lalu dikirim ke PROSES UTAMA lewat
 * {@code window.electronAPI.posAPI.cetakStrukDiam(html)} yang mencetak LANGSUNG ke printer default
 * TANPA dialog "Pilih Printer" (keluhan lapangan: kasir harus klik "Print" tiap struk) -- lihat
 * JavaDoc {@code pos:cetak-struk-diam} di main.js utk alasan kenapa ini HARUS lewat proses utama
 * ({@code window.print()} di renderer SELALU memunculkan dialog, tidak bisa silent). Modul ini MURNI
 * presentasional (bangun HTML lalu minta proses utama mencetaknya) -- tidak pernah bicara ke SERVER
 * sendiri; data datang dari pemanggil (in-memory ATAU hasil {@code posAPI.detailTransaksi}, keduanya
 * lewat query terparameterisasi di sisi server).
 */
(function () {
    /** Fallback kalau {@code data.pesanTerimaKasih} kosong (mis. data lama dari sebelum fitur ini ada) -- SENGAJA sama persis dgn {@code Toko.PESAN_TERIMA_KASIH_DEFAULT} di server, supaya perilaku "belum pernah disunting -> teks formal" konsisten di kedua sisi. */
    var PESAN_TERIMA_KASIH_FALLBACK = 'Terima Kasih Telah Berbelanja, Semoga Belanja Berkah Berpahala';

    function formatRp(angka) {
        const n = Number(angka) || 0;
        return 'Rp ' + Math.round(n).toLocaleString('id-ID');
    }

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    // Cetakan thermal (80mm) SANGAT sering keluar tipis/buram kalau font default (normal-weight,
    // anti-aliased) dipakai apa adanya -- Chromium merender teks dgn abu-abu di tepi glyph, lalu
    // printer thermal (bukan printer tinta/laser) menerjemahkan abu-abu itu jadi titik jarang, BUKAN
    // hitam pekat. Font-weight 700 + `-webkit-text-stroke` (menebalkan tepi glyph tanpa mengubah lebar
    // baris, karena font tetap monospace) + ukuran sedikit lebih besar adalah perbaikan langsung utk
    // keluhan "font kurang tebal/buram saat dicetak" -- BUKAN sekadar kosmetik di layar, harfiah
    // menambah cakupan tinta per karakter di kertas thermal.
    // Dipisah jadi konstanta (bukan ditulis inline di {@link bangunHtml}) supaya jendela pratinjau
    // (lihat {@link cetakDenganPreview}) bisa memakai gaya visual YANG SAMA PERSIS tanpa duplikasi.
    var STYLE_STRUK = 'body{font-family:"Courier New",Courier,monospace;width:300px;font-size:14px;font-weight:700;'
        + '-webkit-text-stroke:0.4px #000;margin:0 auto;padding:10px;color:#000;background:#fff;'
        + '-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
        + '.text-center{text-align:center;}.text-right{text-align:right;}.bold{font-weight:900;-webkit-text-stroke:0.6px #000;}'
        + '.border-top{border-top:2px dashed #000;margin-top:5px;padding-top:5px;}'
        + '.border-bottom{border-bottom:2px dashed #000;margin-bottom:5px;padding-bottom:5px;}'
        + 'table{width:100%;border-collapse:collapse;}td{vertical-align:top;}'
        + '@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}';

    /**
     * Bangun HANYA isi struk (fragmen di dalam {@code <body>}, TANPA {@code <!DOCTYPE>/<html>/<head>}) --
     * dipakai bersama oleh {@link bangunHtml} (dibungkus jadi 1 halaman lengkap siap cetak diam-diam)
     * dan {@link cetakDenganPreview} (ditempel ke dalam jendela pratinjau kustom yang punya toolbar
     * sendiri). SATU sumber kebenaran isi struk supaya tampilan pratinjau & hasil cetak selalu identik.
     * @param {object} data lihat {@link bangunHtml}.
     * @return {string}
     */
    function bangunIsi(data) {
        const item = data.item || [];
        let subtotal = 0;
        let baris = '';
        item.forEach((it) => {
            const harga = Number(it.harga) || 0;
            const qty = Number(it.qty) || 0;
            const diskon = Number(it.diskon) || 0;
            const cashback = Number(it.cashback) || 0;
            const sub = harga * qty;
            subtotal += sub;
            baris += '<tr><td colspan="2">' + escHtml(it.nama || 'Item') + '</td></tr>';
            baris += '<tr><td style="padding-bottom:5px;">' + qty + ' x ' + formatRp(harga) + '</td><td class="text-right" style="padding-bottom:5px;">' + formatRp(sub - diskon) + '</td></tr>';
            if (diskon > 0) baris += '<tr><td colspan="2" style="padding-bottom:5px;">&nbsp;&nbsp;<i>Diskon Promo</i></td><td class="text-right">-' + formatRp(diskon) + '</td></tr>';
            if (cashback > 0) baris += '<tr><td colspan="2" style="padding-bottom:5px;">&nbsp;&nbsp;<i>Cashback Didapat</i></td><td class="text-right">+' + formatRp(cashback) + '</td></tr>';
        });

        const totalDiskon = Number(data.totalDiskon) || 0;
        const totalCashback = Number(data.totalCashback) || 0;
        const bayarTunai = Number(data.bayarTunai) || 0;
        const kembalian = Number(data.kembalian) || 0;

        let ringkasan = '<tr><td>Subtotal</td><td class="text-right">' + formatRp(subtotal) + '</td></tr>';
        if (totalDiskon > 0) ringkasan += '<tr><td>Total Diskon</td><td class="text-right">-' + formatRp(totalDiskon) + '</td></tr>';
        ringkasan += '<tr><td class="bold">Total Bayar</td><td class="text-right bold">' + formatRp(data.totalBiaya) + '</td></tr>';
        if (totalCashback > 0) ringkasan += '<tr><td class="bold">Total Cashback</td><td class="text-right bold">+' + formatRp(totalCashback) + '</td></tr>';
        if (bayarTunai > 0) {
            ringkasan += '<tr><td>Uang Tunai</td><td class="text-right">' + formatRp(bayarTunai) + '</td></tr>';
            ringkasan += '<tr><td>Kembalian</td><td class="text-right">' + formatRp(kembalian) + '</td></tr>';
        }

        return '<div class="text-center bold border-bottom"><h3 style="margin:5px 0;">' + escHtml(data.tokoNama || '') + '</h3><div style="margin-bottom:5px;">Struk Pembayaran</div></div>'
            + '<div style="margin-bottom:5px;">Waktu : ' + escHtml(data.waktu || '-') + '<br>No    : ' + escHtml(data.kode || '-') + '<br></div>'
            + '<div class="border-top border-bottom"><table>' + baris + '</table></div>'
            + '<table>' + ringkasan + '</table>'
            + '<div class="text-center bold border-top" style="margin-top:15px;">' + escHtml(data.pesanTerimaKasih || PESAN_TERIMA_KASIH_FALLBACK) + '</div>';
    }

    /**
     * Membangun HTML lengkap 1 halaman struk siap-cetak (dipakai jalur cetak diam-diam).
     * @param {{tokoNama?:string, kode?:string, waktu?:string, pesanTerimaKasih?:string, item:Array<{nama:string, qty:number, harga:number, diskon?:number, cashback?:number}>, totalDiskon?:number, totalCashback?:number, totalBiaya:number, bayarTunai?:number, kembalian?:number}} data
     * @return {string}
     */
    function bangunHtml(data) {
        return '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">'
            + '<title>Cetak Struk</title><style>' + STYLE_STRUK + '</style></head><body>'
            + bangunIsi(data)
            + '</body></html>';
    }

    /**
     * Mencetak struk LANGSUNG ke printer default (tanpa dialog "Pilih Printer") lewat proses utama
     * Electron. Async karena {@code cetakStrukDiam} adalah panggilan IPC (invoke/promise) -- pemanggil
     * boleh {@code await} kalau perlu tahu hasilnya, atau biarkan berjalan fire-and-forget.
     * @param {object} data lihat {@link #bangunHtml}.
     * @return {Promise<void>}
     */
    async function cetak(data) {
        if (!data || !data.item || data.item.length === 0) {
            window.alert('Data struk tidak lengkap -- tidak ada item untuk dicetak.');
            return;
        }
        if (!window.electronAPI || !window.electronAPI.posAPI || typeof window.electronAPI.posAPI.cetakStrukDiam !== 'function') {
            window.alert('Fitur cetak struk tidak tersedia di lingkungan ini.');
            return;
        }
        try {
            const r = await window.electronAPI.posAPI.cetakStrukDiam({ html: bangunHtml(data) });
            if (!r || !r.ok) window.alert('Gagal mencetak struk: ' + ((r && r.pesan) || 'Penyebab tidak diketahui.'));
        } catch (e) {
            window.alert('Gagal mencetak struk: ' + (e && e.message ? e.message : e));
        }
    }

    /**
     * Sama seperti {@link cetak} tapi menampilkan jendela PRATINJAU kustom (bukan dialog cetak native
     * Windows -- yang ternyata TIDAK merender pratinjau visual sungguhan untuk konten data-URL/RAW,
     * cuma menampilkan teks "This app doesn't support print preview", dan jendelanya tumpang tindih
     * janggal dengan layar Kasir di belakangnya) dulu, dengan toolbar "Cetak"/"Tutup" milik sendiri di
     * bagian bawah -- TIDAK langsung tercetak diam-diam saat tombol "Cetak Struk" ditekan, BARU
     * tercetak (diam-diam ke printer default, pola sama {@link cetak}) begitu kasir menekan tombol
     * "Cetak" di toolbar itu. Dipakai tombol "Cetak Struk" di modal sukses checkout layar Kasir. Kirim
     * {@code isi}+{@code style} (BUKAN {@code html} penuh) supaya proses utama bisa menempelkannya ke
     * dalam bingkai pratinjau+toolbar sendiri tanpa perlu mem-parsing string HTML. Lihat JavaDoc
     * {@code pos:cetak-struk-preview} di main.js.
     * @param {object} data lihat {@link #bangunHtml}.
     * @return {Promise<void>}
     */
    async function cetakDenganPreview(data) {
        if (!data || !data.item || data.item.length === 0) {
            window.alert('Data struk tidak lengkap -- tidak ada item untuk dicetak.');
            return;
        }
        if (!window.electronAPI || !window.electronAPI.posAPI || typeof window.electronAPI.posAPI.cetakStrukPreview !== 'function') {
            window.alert('Fitur cetak struk tidak tersedia di lingkungan ini.');
            return;
        }
        try {
            const r = await window.electronAPI.posAPI.cetakStrukPreview({ isi: bangunIsi(data), style: STYLE_STRUK });
            if (!r || !r.ok) window.alert('Gagal mencetak struk: ' + ((r && r.pesan) || 'Penyebab tidak diketahui.'));
        } catch (e) {
            window.alert('Gagal mencetak struk: ' + (e && e.message ? e.message : e));
        }
    }

    window.Struk = { cetak: cetak, cetakDenganPreview: cetakDenganPreview };
})();
