/**
 * riwayat-sinkronisasi-renderer.js -- Logika layar Riwayat Sinkronisasi LOKAL. Menampilkan DUA arah
 * sinkronisasi secara terpisah supaya kasir/admin gampang membedakan:
 *   - "Sinkron Masuk" -- data yang DIUNDUH dari server (katalog/konfigurasi/ringkasan/pesanan),
 *     dibaca dari {@code cache_referensi} lewat {@code localDb.listCache()} (BARU, lihat JavaDoc
 *     {@code local-db.js#listCacheSemua}).
 *   - "Sinkron Keluar" -- transaksi yang DIKIRIM ke server, dibaca dari tabel {@code transaksi}
 *     lewat {@code localDb.listSemua(filter)} (SUDAH ADA sebelumnya, dipakai ulang di sini).
 *
 * TIDAK ADA fetch()/XHR di sini -- pola sama dgn seluruh halaman lain, seluruh data lewat
 * window.electronAPI.posAPI dan window.electronAPI.localDb (IPC ke proses utama).
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');
    const elGridMasuk = document.getElementById('gridMasuk');
    const elFilterStatus = document.getElementById('filterStatus');
    const elWadahKeluar = document.getElementById('wadahKeluar');
    const elBtnMuatLagi = document.getElementById('btnMuatLagi');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');

    const BATAS_PER_HALAMAN = 50;
    let offsetKeluar = 0;
    let totalKeluar = 0;
    let daftarKeluar = [];
    /** @type {Object<string,string>} peta id cara-bayar -> nama, utk menampilkan metode transaksi yg cuma tersimpan sbg id. */
    let petaCaraBayar = {};

    function formatRupiah(n) {
        return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
    }
    function formatWaktu(iso) {
        if (!iso) return '-';
        try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
        catch (e) { return iso; }
    }

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
        } catch (e) { /* abaikan -- bukan jalur kritis */ }
    }

    // ==== Sinkron Masuk ====

    /** Menerjemahkan isi {@code data} tiap kunci cache jadi ringkasan 1-2 baris yang gampang dibaca -- bentuk data beda per kunci, jadi pemetaan ini eksplisit per kasus, BUKAN generik. */
    const PETA_KUNCI = {
        katalog: {
            nama: 'Katalog Produk', ico: '\u{1F6D2}',
            ringkas: (d) => {
                const jumlahProduk = (d.produk || []).length;
                const jumlahKategori = (d.kategori || []).length;
                const berGambar = (d.produk || []).filter((p) => p.gambarUrl).length;
                return jumlahProduk + ' produk, ' + jumlahKategori + ' kategori (' + berGambar + ' dgn gambar)';
            }
        },
        konfigurasi: {
            nama: 'Konfigurasi POS', ico: '\u{2699}\u{FE0F}',
            ringkas: (d) => {
                const jumlahCaraBayar = (d.caraBayar || []).length;
                return 'Toko: ' + (d.tokoNama || '-') + ' • Pajak ' + (d.pajakPersen || 0) + '% • ' + jumlahCaraBayar + ' metode bayar aktif';
            }
        },
        ringkasan: {
            nama: 'Ringkasan Penjualan', ico: '\u{1F4CA}',
            ringkas: (d) => 'Omzet ' + formatRupiah(d.omzetHariIni) + ' • ' + (d.transaksiHariIni || 0) + ' transaksi • ' + ((d.produkTerlaris || []).length) + ' produk terlaris tercatat'
        },
        pesanan: {
            nama: 'Daftar Pesanan Online', ico: '\u{1F4E5}',
            ringkas: (d) => {
                const semua = d.pesanan || [];
                const menunggu = semua.filter((p) => !p.lunas).length;
                return semua.length + ' pesanan (' + menunggu + ' menunggu pembayaran)';
            }
        }
    };
    const URUTAN_KUNCI = ['katalog', 'konfigurasi', 'ringkasan', 'pesanan'];

    function renderSinkronMasuk(daftarCache) {
        const petaTersimpan = {};
        daftarCache.forEach((c) => { petaTersimpan[c.kunci] = c; });

        elGridMasuk.innerHTML = '';
        URUTAN_KUNCI.forEach((kunci) => {
            const info = PETA_KUNCI[kunci] || { nama: kunci, ico: '\u{1F4C4}', ringkas: () => '-' };
            const tersimpan = petaTersimpan[kunci];
            const kartu = document.createElement('div');
            kartu.className = 'kartu-masuk' + (tersimpan ? '' : ' kosong');
            if (tersimpan && tersimpan.data) {
                let ringkas = '-';
                try { ringkas = info.ringkas(tersimpan.data); } catch (e) { ringkas = 'Data tersimpan (format tak terbaca).'; }
                kartu.innerHTML =
                    '<div class="baris-judul"><span class="ico">' + info.ico + '</span><span class="nama">' + info.nama + '</span></div>' +
                    '<div class="isi"></div><div class="waktu"></div>';
                kartu.querySelector('.isi').textContent = ringkas;
                kartu.querySelector('.waktu').textContent = '\u{1F553} Terakhir masuk: ' + formatWaktu(tersimpan.disimpanPada);
            } else {
                kartu.innerHTML =
                    '<div class="baris-judul"><span class="ico">' + info.ico + '</span><span class="nama">' + info.nama + '</span><span class="badge-kosong">Belum pernah</span></div>' +
                    '<div class="isi">Belum pernah berhasil diunduh dari server sejak aplikasi ini dipasang/data dibersihkan.</div>';
            }
            elGridMasuk.appendChild(kartu);
        });
    }

    // ==== Sinkron Keluar ====

    function renderSinkronKeluar() {
        elWadahKeluar.innerHTML = '';
        if (daftarKeluar.length === 0) {
            const kosong = document.createElement('div');
            kosong.className = 'daftar-kosong';
            kosong.innerHTML = '<span class="ico">\u{1F4E4}</span>Belum ada transaksi yang tercatat.';
            elWadahKeluar.appendChild(kosong);
            elBtnMuatLagi.style.display = 'none';
            return;
        }

        const tabel = document.createElement('table');
        tabel.className = 'tabel-keluar';
        tabel.innerHTML =
            '<thead><tr><th>Waktu</th><th>Kode Transaksi</th><th>Kasir</th><th>Item &amp; Metode</th><th style="text-align:right;">Total</th><th>Status</th></tr></thead><tbody></tbody>';
        const tbody = tabel.querySelector('tbody');

        daftarKeluar.forEach((t) => {
            const payloadAsli = t.payloadAsli || {};
            const jumlahItem = (payloadAsli.transaksi || []).length;
            const namaCaraBayar = petaCaraBayar[String(payloadAsli.caraBayar)] || (payloadAsli.caraBayar ? ('Metode #' + payloadAsli.caraBayar) : '-');

            const tr = document.createElement('tr');
            const sudahSinkron = t.status === 'SYNCED';
            tr.innerHTML =
                '<td></td>' +
                '<td class="kode"></td>' +
                '<td></td>' +
                '<td></td>' +
                '<td class="total"></td>' +
                '<td></td>';
            tr.children[0].textContent = formatWaktu(t.waktu);
            tr.children[1].textContent = t.clientTrxId || '-';
            tr.children[2].textContent = t.kasir || '-';
            tr.children[3].textContent = jumlahItem + ' item • ' + namaCaraBayar;
            tr.children[4].textContent = formatRupiah(t.total);

            const sel = tr.children[5];
            if (sudahSinkron) {
                sel.innerHTML = '<span class="badge-status sinkron">&#10003; Tersinkron</span><div style="font-size:10px;color:var(--muted);margin-top:3px;">' + formatWaktu(t.disinkronPada) + '</div>';
            } else {
                sel.innerHTML = '<span class="badge-status menunggu">&#8987; Menunggu</span>' + (t.pesanError ? '<div class="pesan-error-baris"></div>' : '');
                if (t.pesanError) sel.querySelector('.pesan-error-baris').textContent = t.pesanError;
            }
            tbody.appendChild(tr);
        });

        elWadahKeluar.appendChild(tabel);
        elBtnMuatLagi.style.display = (offsetKeluar + daftarKeluar.length < totalKeluar) ? 'block' : 'none';
    }

    async function muatSinkronKeluar(dariAwal) {
        if (dariAwal) { offsetKeluar = 0; daftarKeluar = []; }
        const filter = { limit: BATAS_PER_HALAMAN, offset: offsetKeluar, status: elFilterStatus.value || undefined };
        try {
            const hasil = await window.electronAPI.localDb.listSemua(filter);
            totalKeluar = hasil.total || 0;
            daftarKeluar = dariAwal ? hasil.data : daftarKeluar.concat(hasil.data);
            offsetKeluar = daftarKeluar.length;
            renderSinkronKeluar();
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat riwayat transaksi: ' + (e && e.message ? e.message : e));
        }
    }

    elFilterStatus.addEventListener('change', () => muatSinkronKeluar(true));
    elBtnMuatLagi.addEventListener('click', () => {
        elBtnMuatLagi.disabled = true;
        elBtnMuatLagi.textContent = 'Memuat...';
        muatSinkronKeluar(false).finally(() => {
            elBtnMuatLagi.disabled = false;
            elBtnMuatLagi.textContent = 'Muat 50 Lagi';
        });
    });

    // ==== Muat semua ====

    async function muatSemua() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const [hasilCache, hasilKonfig] = await Promise.all([
                window.electronAPI.localDb.listCache(),
                window.electronAPI.posAPI.konfigurasi()
            ]);
            renderSinkronMasuk(hasilCache || []);

            if (hasilKonfig.ok) {
                const userId = hasilKonfig.data.userId || '';
                elNamaToko.textContent = hasilKonfig.data.tokoNama || (userId ? ('Kasir - ' + userId) : 'Kasir');
                petaCaraBayar = {};
                (hasilKonfig.data.caraBayar || []).forEach((cb) => { petaCaraBayar[String(cb.id)] = cb.nama; });
            }

            await muatSinkronKeluar(true);
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Memuat Riwayat Sinkronisasi',
                teknis: e && e.message ? e.message : String(e)
            }));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    elBtnMuatUlang.addEventListener('click', muatSemua);

    // ==== Inisialisasi ====
    muatSemua();
    segarkanStatus();
    setInterval(segarkanStatus, 30000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
