/**
 * customer-renderer.js -- Logika Layar Pelanggan LOKAL (customer.html, jendela monitor kedua). Jendela
 * ini TIDAK PERNAH memanggil PosApi langsung dgn fetch() -- satu-satunya panggilan jaringan yg
 * dilakukannya ({@code verifikasiPin}) tetap lewat proses utama (window.customerAPI, preload-customer.js)
 * yg memegang token, sama seperti seluruh window lain di aplikasi ini. PIN yg diketik pembeli TIDAK
 * PERNAH dikirim ke jendela Kasir -- hanya hasil ok/tidak yg dikirim balik lewat kirimKeKasir().
 *
 * Pesan MASUK dari Kasir (lewat window.customerAPI.onPesan, diteruskan proses utama dari
 * pos-renderer.js via posAPI.layarPelanggan.kirim()): {tipe:'keranjang',...} (mirror belanja),
 * {tipe:'minta_pin', memberId, memberNama} (buka numpad), {tipe:'sukses', totalBayar, metode,
 * pesanTerimaKasih} (transaksi selesai -- pesanTerimaKasih dikonfigurasi per-toko, lihat JavaDoc
 * server {@code Toko.getPesanTerimaKasih}, ditampilkan LEBIH BESAR drpd rincian transaksi lain di
 * panel ini karena ini kalimat penutup yg paling ingin dibaca pelanggan), {tipe:'reset'} (kembali
 * idle). Proses utama JUGA otomatis mengirim ulang
 * state keranjang TERAKHIR begitu jendela ini baru dibuka/reconnect (lihat JavaDoc
 * bukaLayarPelangganLokal di main.js) -- jendela ini sendiri tidak perlu minta status secara eksplisit.
 */
(function () {
    const elIdle = document.getElementById('panelIdle');
    const elKeranjang = document.getElementById('panelKeranjang');
    const elSukses = document.getElementById('panelSukses');
    const elNamaTokoIdle = document.getElementById('namaTokoIdle');
    const elNamaTokoBesar = document.getElementById('namaTokoBesar');
    const elMemberNamaTampil = document.getElementById('memberNamaTampil');
    const elDaftarItem = document.getElementById('daftarItemPelanggan');
    const elSubtotal = document.getElementById('subtotalPelanggan');
    const elPajak = document.getElementById('pajakPelanggan');
    const elTotal = document.getElementById('totalPelanggan');
    const elSuksesTotal = document.getElementById('suksesTotal');
    const elSuksesMetode = document.getElementById('suksesMetode');
    const elSuksesUcapan = document.getElementById('suksesUcapan');
    /** Fallback kalau pesan dari Kasir kosong -- SAMA persis dgn Toko.PESAN_TERIMA_KASIH_DEFAULT server & struk.js, lihat catatan di sana. */
    var PESAN_TERIMA_KASIH_FALLBACK = 'Terima Kasih Telah Berbelanja, Semoga Belanja Berkah Berpahala';

    const elOverlayPin = document.getElementById('overlayPin');
    const elPinMemberNama = document.getElementById('pinMemberNama');
    const elPinDots = document.getElementById('pinDots');
    const elPinPad = document.getElementById('pinPad');
    const elPinError = document.getElementById('pinError');
    const elBtnPinHapus = document.getElementById('btnPinHapus');
    const elBtnPinOk = document.getElementById('btnPinOk');
    const elBtnPinBatal = document.getElementById('btnPinBatal');

    let namaToko = '';
    let pinBuffer = '';
    let pinMemberId = null;
    let panelSuksesTimer = null;

    function formatRupiah(n) {
        return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
    }

    function tampilkanPanel(nama) {
        elIdle.style.display = nama === 'idle' ? 'flex' : 'none';
        elKeranjang.style.display = nama === 'keranjang' ? 'flex' : 'none';
        elSukses.style.display = nama === 'sukses' ? 'flex' : 'none';
    }

    function renderKeranjang(d) {
        if (d.namaToko) {
            namaToko = d.namaToko;
            elNamaTokoIdle.textContent = namaToko;
            elNamaTokoBesar.textContent = namaToko;
        }
        elMemberNamaTampil.textContent = d.memberNama ? ('\u{1F464} ' + d.memberNama) : '';
        elMemberNamaTampil.style.display = d.memberNama ? 'block' : 'none';

        const items = d.items || [];
        if (items.length === 0) {
            tampilkanPanel('idle');
            return;
        }

        elDaftarItem.innerHTML = '';
        items.forEach((it) => {
            const row = document.createElement('div');
            row.className = 'baris-item';
            row.innerHTML = '<span class="nama"></span><span class="qty"></span><span class="harga"></span>';
            row.querySelector('.nama').textContent = it.nama;
            row.querySelector('.qty').textContent = 'x' + it.jumlah;
            row.querySelector('.harga').textContent = formatRupiah((Number(it.harga) || 0) * (Number(it.jumlah) || 0));
            elDaftarItem.appendChild(row);
        });
        elSubtotal.textContent = formatRupiah(d.subtotal);
        elPajak.textContent = formatRupiah(d.pajak);
        elTotal.textContent = formatRupiah(d.total);
        tampilkanPanel('keranjang');
    }

    // ==== Numpad PIN ====

    function pinRenderDots() {
        const isi = '●'.repeat(pinBuffer.length);
        const sisa = '○'.repeat(Math.max(0, 4 - pinBuffer.length));
        elPinDots.textContent = isi + sisa;
    }

    function bukaPin(d) {
        pinBuffer = '';
        pinMemberId = d.memberId;
        elPinMemberNama.textContent = d.memberNama || '';
        elPinError.className = 'pin-error';
        elPinError.textContent = '';
        pinRenderDots();
        elOverlayPin.className = 'overlay-pin tampil';
    }

    function tutupPin() {
        elOverlayPin.className = 'overlay-pin';
        pinBuffer = '';
        pinMemberId = null;
    }

    elPinPad.querySelectorAll('button[data-digit]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (pinBuffer.length >= 8) return;
            pinBuffer += btn.getAttribute('data-digit');
            elPinError.className = 'pin-error';
            elPinError.textContent = '';
            pinRenderDots();
        });
    });
    elBtnPinHapus.addEventListener('click', () => {
        pinBuffer = pinBuffer.slice(0, -1);
        pinRenderDots();
    });

    elBtnPinOk.addEventListener('click', async () => {
        if (!pinBuffer) return;
        elPinError.className = 'pin-error';
        elPinError.textContent = 'Memeriksa...';
        try {
            const hasil = await window.customerAPI.verifikasiPin({ memberId: pinMemberId, pin: pinBuffer });
            if (hasil.ok && hasil.cocok) {
                elPinError.className = 'pin-error sukses';
                elPinError.textContent = 'PIN Benar!';
                window.customerAPI.kirimKeKasir({ tipe: 'pin_hasil', ok: true });
                setTimeout(tutupPin, 1200);
            } else {
                elPinError.className = 'pin-error';
                elPinError.textContent = hasil.ok ? 'PIN salah, coba lagi.' : (hasil.pesan || 'Gagal memeriksa PIN -- periksa koneksi.');
                pinBuffer = '';
                pinRenderDots();
            }
        } catch (e) {
            elPinError.className = 'pin-error';
            elPinError.textContent = 'Gagal memeriksa PIN.';
            pinBuffer = '';
            pinRenderDots();
        }
    });

    elBtnPinBatal.addEventListener('click', () => {
        window.customerAPI.kirimKeKasir({ tipe: 'pin_hasil', ok: false, batal: true });
        tutupPin();
    });

    // ==== Terima pesan dari Kasir ====

    window.customerAPI.onPesan((payload) => {
        if (!payload || !payload.tipe) return;
        if (payload.tipe === 'keranjang') {
            renderKeranjang(payload);
        } else if (payload.tipe === 'minta_pin') {
            bukaPin(payload);
        } else if (payload.tipe === 'sukses') {
            tutupPin();
            elSuksesTotal.textContent = formatRupiah(payload.totalBayar);
            elSuksesMetode.textContent = payload.metode || '-';
            elSuksesUcapan.textContent = payload.pesanTerimaKasih || PESAN_TERIMA_KASIH_FALLBACK;
            tampilkanPanel('sukses');
            if (panelSuksesTimer) clearTimeout(panelSuksesTimer);
            panelSuksesTimer = setTimeout(() => tampilkanPanel('idle'), 4000);
        } else if (payload.tipe === 'reset') {
            tutupPin();
            tampilkanPanel('idle');
        }
    });

    tampilkanPanel('idle');
    // Tak ada pemilih bahasa sendiri di sini SENGAJA -- Layar Pelanggan mengikuti bahasa yang
    // TERAKHIR dipilih kasir di jendela utama (kamus di-cache ke localStorage BERSAMA, lihat JavaDoc
    // i18n.js), bukan pilihan independen (pelanggan tak seharusnya perlu mengatur ini sendiri).
    if (window.Kamus) window.Kamus.muat(window.Kamus.bahasaTersimpan());
})();
